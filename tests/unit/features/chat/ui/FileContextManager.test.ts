import { createMockEl, type MockElement } from '@test/helpers/mockElement';

import type { FileChangeEvent, FileWatchService } from '@/core/ports';
import type { FileContextCallbacks } from '@/features/chat/ui/FileContext';
import { FileContextManager } from '@/features/chat/ui/FileContext';
import { WorkspaceFolderCache } from '@/shared/mention/WorkspaceMentionCache';
import { TyporaFile } from '@/typora/platform';
import type { ExternalContextFile } from '@/utils/externalContextScanner';

jest.mock('@/typora/platform', () => {
  const actual = jest.requireActual('@/typora/platform');
  return {
    ...actual,
    setIcon: jest.fn(),
    Notice: jest.fn(),
  };
});

jest.mock('@/ui/NoticeAdapter', () => ({
  NoticeAdapter: jest.fn().mockImplementation(() => ({
    show: (message: string) => {
      const { Notice } = jest.requireMock('@/typora/platform') as { Notice: (value: string) => void };
      Notice(message);
    },
  })),
}));

function createMockTFile(filePath: string): TyporaFile {
  const file = new TyporaFile();
  file.path = filePath;
  file.name = filePath.split('/').pop() ?? filePath;
  file.basename = file.name.replace(/\.[^.]+$/, '');
  file.extension = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
  (file as any).stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  return file;
}

let mockVaultPath = '/vault';
jest.mock('@/utils/path', () => {
  const actual = jest.requireActual('@/utils/path');
  return {
    ...actual,
    getVaultPath: jest.fn(() => mockVaultPath),
    isPathWithinVault: jest.fn((candidatePath: string, vaultPath: string) => {
      if (!candidatePath) return false;
      if (!candidatePath.startsWith('/')) return true;
      return candidatePath.startsWith(vaultPath);
    }),
  };
});

const mockScanPaths = jest.fn<ExternalContextFile[], [string[]]>(() => []);
jest.mock('@/utils/externalContextScanner', () => ({
  externalContextScanner: {
    scanPaths: (paths: string[]) => mockScanPaths(paths),
  },
}));


function findByClass(root: MockElement, className: string): MockElement | undefined {
  if (root.hasClass(className)) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return undefined;
}

function findAllByClass(root: MockElement, className: string): MockElement[] {
  const results: MockElement[] = [];
  const walk = (node: MockElement) => {
    if (node.hasClass(className)) {
      results.push(node);
    }
    node.children.forEach(walk);
  };
  walk(root);
  return results;
}

function createMockApp(options: {
  files?: string[];
  activeFilePath?: string | null;
  fileCacheByPath?: Map<string, any>;
} = {}) {
  const { files = [], activeFilePath = null, fileCacheByPath = new Map() } = options;
  const fileMap = new Map<string, TyporaFile>();
  files.forEach((filePath) => {
    fileMap.set(filePath, createMockTFile(filePath));
  });

  return {
    vault: {
      on: jest.fn(() => ({ id: 'event-ref' })),
      offref: jest.fn(),
      getAbstractFileByPath: jest.fn((filePath: string) => fileMap.get(filePath) || null),
      getAllLoadedFiles: jest.fn(() => Array.from(fileMap.values())),
      getFiles: jest.fn(() => Array.from(fileMap.values())),
    },
    workspace: {
      getActiveFile: jest.fn(() => {
        if (!activeFilePath) return null;
        return fileMap.get(activeFilePath) || createMockTFile(activeFilePath);
      }),
      getLeaf: jest.fn(() => ({
        openFile: jest.fn().mockResolvedValue(undefined),
      })),
    },
    metadataCache: {
      getFileCache: jest.fn((file: TyporaFile) => fileCacheByPath.get(file.path) || null),
    },
  } as any;
}

function createMockCallbacks(options: {
  externalContexts?: string[];
  excludedTags?: string[];
} = {}): FileContextCallbacks {
  const { externalContexts = [], excludedTags = [] } = options;
  return {
    getExcludedTags: jest.fn(() => excludedTags),
    getExternalContexts: jest.fn(() => externalContexts),
  };
}

function createMockWatches(): {
  listeners: Map<string, (event: FileChangeEvent) => void>;
  service: FileWatchService;
  stops: jest.Mock[];
} {
  const listeners = new Map<string, (event: FileChangeEvent) => void>();
  const stops: jest.Mock[] = [];
  return {
    listeners,
    service: {
      watch: jest.fn((path, listener) => {
        listeners.set(path, listener);
        const stop = jest.fn();
        stops.push(stop);
        return stop;
      }),
      dispose: jest.fn(),
    },
    stops,
  };
}

describe('FileContextManager', () => {
  let containerEl: MockElement;
  let inputEl: HTMLTextAreaElement;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockVaultPath = '/vault';
    mockScanPaths.mockReturnValue([]);
    containerEl = createMockEl();
    inputEl = {
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      focus: jest.fn(),
    } as unknown as HTMLTextAreaElement;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tracks current note send state per session', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    manager.setCurrentNote('notes/alpha.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);
    manager.markCurrentNoteSent();
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.resetForLoadedConversation(true);
    manager.setCurrentNote('notes/alpha.md');
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.resetForLoadedConversation(false);
    manager.setCurrentNote('notes/beta.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);

    manager.destroy();
  });

  it('should NOT resend current note when loading conversation with existing messages', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    // When loading a conversation that already has messages, the current note
    // should be marked as already sent to avoid re-sending context
    manager.resetForLoadedConversation(true);
    manager.setCurrentNote('notes/restored.md');
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.destroy();
  });

  it('should send current note when loading empty conversation', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    // When loading a conversation with no messages, the current note
    // should be sent with the first message
    manager.resetForLoadedConversation(false);
    manager.setCurrentNote('notes/new.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);

    manager.destroy();
  });

  it('renders current note chip and removes on click', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    manager.setCurrentNote('notes/chip.md');

    const indicator = findByClass(containerEl, 'typorai-file-indicator');
    expect(indicator).toBeDefined();
    expect(indicator?.style.display).toBe('flex');

    const removeEl = findByClass(containerEl, 'typorai-file-chip-remove');
    expect(removeEl).toBeDefined();

    removeEl!.click();

    expect(manager.getCurrentNotePath()).toBeNull();
    expect(indicator?.style.display).toBe('none');

    manager.destroy();
  });

  it('auto-attaches active file unless excluded by tag', () => {
    const fileCacheByPath = new Map<string, any>([
      ['notes/private.md', { frontmatter: { tags: ['private'] } }],
    ]);
    const app = createMockApp({
      files: ['notes/private.md', 'notes/public.md'],
      activeFilePath: 'notes/private.md',
      fileCacheByPath,
    });

    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ excludedTags: ['private'] })
    );

    manager.autoAttachActiveFile();
    expect(manager.getCurrentNotePath()).toBeNull();

    app.workspace.getActiveFile = jest.fn(() => createMockTFile('notes/public.md'));
    manager.autoAttachActiveFile();
    expect(manager.getCurrentNotePath()).toBe('notes/public.md');

    manager.destroy();
  });

  it('shows vault-relative path in @ dropdown and inserts full path on selection', () => {
    const app = createMockApp({
      files: ['clipping/file.md'],
    });
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    inputEl.value = '@file';
    inputEl.selectionStart = 5;
    inputEl.selectionEnd = 5;
    manager.handleInputChange();
    jest.advanceTimersByTime(200);

    const pathEl = findByClass(containerEl, 'typorai-mention-path');
    expect(pathEl?.textContent).toBe('clipping/file.md');

    manager.handleMentionKeydown({ key: 'Enter', preventDefault: jest.fn() } as any);

    // Now inserts full vault-relative path (WYSIWYG)
    expect(inputEl.value).toBe('@clipping/file.md ');
    const attached = manager.getAttachedFiles();
    expect(attached.has('clipping/file.md')).toBe(true);

    manager.destroy();
  });

  it('wires cached workspace folders through WorkspaceFolderCache.getFolders', () => {
    const folder = { name: 'src', path: 'src' } as any;
    const getFoldersSpy = jest
      .spyOn(WorkspaceFolderCache.prototype, 'getFolders')
      .mockReturnValue([folder]);
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    inputEl.value = '@src';
    inputEl.selectionStart = 4;
    inputEl.selectionEnd = 4;
    manager.handleInputChange();
    jest.advanceTimersByTime(200);

    expect(getFoldersSpy).toHaveBeenCalled();
    const folderLabel = findByClass(containerEl, 'typorai-mention-name-folder');
    expect(folderLabel?.textContent).toBe('@src/');

    manager.destroy();
    getFoldersSpy.mockRestore();
  });

  it('filters context files and attaches absolute path', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ externalContexts: ['/external'] })
    );

    const contextFiles: ExternalContextFile[] = [
      {
        path: '/external/src/app.md',
        name: 'app.md',
        relativePath: 'src/app.md',
        contextRoot: '/external',
        mtime: 1000,
      },
    ];
    mockScanPaths.mockReturnValue(contextFiles);

    inputEl.value = '@external/app';
    inputEl.selectionStart = 13;
    inputEl.selectionEnd = 13;
    manager.handleInputChange();
    jest.advanceTimersByTime(200);

    const nameEls = findAllByClass(containerEl, 'typorai-mention-name-context');
    expect(nameEls[0]?.textContent).toBe('src/app.md');

    manager.handleMentionKeydown({ key: 'Enter', preventDefault: jest.fn() } as any);

    // Display shows friendly name, but state stores mapping to absolute path
    expect(inputEl.value).toBe('@external/src/app.md ');
    const attached = manager.getAttachedFiles();
    expect(attached.has('/external/src/app.md')).toBe(true);
    // Check transformation works
    const transformed = manager.transformContextMentions('@external/src/app.md');
    expect(transformed).toBe('/external/src/app.md');

    manager.destroy();
  });

  it('transforms pasted external context mention to absolute path without dropdown selection', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ externalContexts: ['/external'] })
    );

    const contextFiles: ExternalContextFile[] = [
      {
        path: '/external/src/app.md',
        name: 'app.md',
        relativePath: 'src/app.md',
        contextRoot: '/external',
        mtime: 1000,
      },
    ];
    mockScanPaths.mockReturnValue(contextFiles);

    const transformed = manager.transformContextMentions('Please review @external/src/app.md before merging.');
    expect(transformed).toBe('Please review /external/src/app.md before merging.');

    manager.destroy();
  });

  it('transforms pasted external context mention with spaces in path', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ externalContexts: ['/external'] })
    );

    const contextFiles: ExternalContextFile[] = [
      {
        path: '/external/src/my file.md',
        name: 'my file.md',
        relativePath: 'src/my file.md',
        contextRoot: '/external',
        mtime: 1000,
      },
    ];
    mockScanPaths.mockReturnValue(contextFiles);

    const transformed = manager.transformContextMentions('Please review @external/src/my file.md before merging.');
    expect(transformed).toBe('Please review /external/src/my file.md before merging.');

    manager.destroy();
  });

  it('keeps trailing punctuation when transforming pasted external context mention', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ externalContexts: ['/external'] })
    );

    const contextFiles: ExternalContextFile[] = [
      {
        path: '/external/src/app.md',
        name: 'app.md',
        relativePath: 'src/app.md',
        contextRoot: '/external',
        mtime: 1000,
      },
    ];
    mockScanPaths.mockReturnValue(contextFiles);

    const transformed = manager.transformContextMentions('Check @external/src/app.md, then continue.');
    expect(transformed).toBe('Check /external/src/app.md, then continue.');

    manager.destroy();
  });

  it('resolves pasted mention using disambiguated external context display name', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({
        externalContexts: ['/work/a/external', '/work/b/external'],
      })
    );

    mockScanPaths.mockImplementation((paths: string[]) => {
      const contextRoot = paths[0];
      if (contextRoot === '/work/a/external') {
        return [
          {
            path: '/work/a/external/src/app.md',
            name: 'app.md',
            relativePath: 'src/app.md',
            contextRoot: '/work/a/external',
            mtime: 1000,
          },
        ];
      }

      if (contextRoot === '/work/b/external') {
        return [
          {
            path: '/work/b/external/src/app.md',
            name: 'app.md',
            relativePath: 'src/app.md',
            contextRoot: '/work/b/external',
            mtime: 1000,
          },
        ];
      }

      return [];
    });

    const transformed = manager.transformContextMentions('Use @a/external/src/app.md from workspace A');
    expect(transformed).toBe('Use /work/a/external/src/app.md from workspace A');

    manager.destroy();
  });

  describe('session lifecycle', () => {
    it('should report session not started initially', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(manager.isSessionStarted()).toBe(false);
      manager.destroy();
    });

    it('should report session started after startSession', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      manager.startSession();
      expect(manager.isSessionStarted()).toBe(true);
      manager.destroy();
    });

    it('should reset state for new conversation', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      manager.setCurrentNote('notes/test.md');
      manager.startSession();

      manager.resetForNewConversation();
      expect(manager.getCurrentNotePath()).toBeNull();
      expect(manager.isSessionStarted()).toBe(false);
      manager.destroy();
    });
  });

  describe('handleFileOpen', () => {
    it('should update current note when session not started', () => {
      const app = createMockApp({ files: ['notes/new.md'] });
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );

      const file = createMockTFile('notes/new.md');
      manager.handleFileOpen(file);
      expect(manager.getCurrentNotePath()).toBe('notes/new.md');
      manager.destroy();
    });

    it('should clear attachments when opening a new file before session starts', () => {
      const app = createMockApp({ files: ['notes/a.md', 'notes/b.md'] });
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );

      manager.setCurrentNote('notes/a.md');
      const fileB = createMockTFile('notes/b.md');
      manager.handleFileOpen(fileB);
      expect(manager.getCurrentNotePath()).toBe('notes/b.md');
      manager.destroy();
    });

    it('should not update current note when session is started', () => {
      const app = createMockApp({ files: ['notes/a.md'] });
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );

      manager.setCurrentNote('notes/a.md');
      manager.startSession();

      const fileB = createMockTFile('notes/b.md');
      manager.handleFileOpen(fileB);
      // Should NOT update because session is started
      expect(manager.getCurrentNotePath()).toBe('notes/a.md');
      manager.destroy();
    });

    it('should not attach file with excluded tag', () => {
      const fileCacheByPath = new Map<string, any>([
        ['notes/secret.md', { frontmatter: { tags: ['private'] } }],
      ]);
      const app = createMockApp({ files: ['notes/secret.md'], fileCacheByPath });
      const manager = new FileContextManager(
        app, containerEl as any, inputEl,
        createMockCallbacks({ excludedTags: ['private'] })
      );

      const file = createMockTFile('notes/secret.md');
      manager.handleFileOpen(file);
      expect(manager.getCurrentNotePath()).toBeNull();
      manager.destroy();
    });
  });

  describe('file watcher handling', () => {
    it('clears a watched current note when its file is deleted', () => {
      const app = createMockApp({ files: ['notes/doomed.md'] });
      const watches = createMockWatches();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks(), undefined, watches.service,
      );
      manager.setCurrentNote('notes/doomed.md');

      watches.listeners.get('/vault/notes/doomed.md')?.({ path: '/vault/notes/doomed.md', type: 'deleted' });
      expect(manager.getCurrentNotePath()).toBeNull();
      expect(manager.getAttachedFiles().has('notes/doomed.md')).toBe(false);
      manager.destroy();
    });

    it('stops watchers when an attachment is removed or the manager is destroyed', () => {
      const app = createMockApp({ files: ['notes/a.md'] });
      const watches = createMockWatches();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks(), undefined, watches.service,
      );
      manager.setCurrentNote('notes/a.md');
      (manager as any).detachFile('notes/a.md');
      expect(watches.stops[0]).toHaveBeenCalledTimes(1);

      manager.setCurrentNote('notes/a.md');
      manager.destroy();
      expect(watches.stops[1]).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasExcludedTag edge cases', () => {
    it('should exclude file with inline tags (not just frontmatter)', () => {
      const fileCacheByPath = new Map<string, any>([
        ['notes/tagged.md', {
          tags: [{ tag: '#system', position: { start: { line: 5, col: 0 }, end: { line: 5, col: 7 } } }],
        }],
      ]);
      const app = createMockApp({
        files: ['notes/tagged.md'],
        activeFilePath: 'notes/tagged.md',
        fileCacheByPath,
      });

      const manager = new FileContextManager(
        app, containerEl as any, inputEl,
        createMockCallbacks({ excludedTags: ['system'] })
      );

      manager.autoAttachActiveFile();
      expect(manager.getCurrentNotePath()).toBeNull();
      manager.destroy();
    });

    it('should exclude file with string frontmatter tag (not array)', () => {
      const fileCacheByPath = new Map<string, any>([
        ['notes/single-tag.md', { frontmatter: { tags: 'private' } }],
      ]);
      const app = createMockApp({
        files: ['notes/single-tag.md'],
        activeFilePath: 'notes/single-tag.md',
        fileCacheByPath,
      });

      const manager = new FileContextManager(
        app, containerEl as any, inputEl,
        createMockCallbacks({ excludedTags: ['private'] })
      );

      manager.autoAttachActiveFile();
      expect(manager.getCurrentNotePath()).toBeNull();
      manager.destroy();
    });

    it('should handle tags with # prefix in cache', () => {
      const fileCacheByPath = new Map<string, any>([
        ['notes/hash-tag.md', { frontmatter: { tags: ['#draft'] } }],
      ]);
      const app = createMockApp({
        files: ['notes/hash-tag.md'],
        activeFilePath: 'notes/hash-tag.md',
        fileCacheByPath,
      });

      const manager = new FileContextManager(
        app, containerEl as any, inputEl,
        createMockCallbacks({ excludedTags: ['draft'] })
      );

      manager.autoAttachActiveFile();
      expect(manager.getCurrentNotePath()).toBeNull();
      manager.destroy();
    });
  });

  describe('cache dirty marking', () => {
    it('should not throw when marking file cache dirty', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.markFileCacheDirty()).not.toThrow();
      manager.destroy();
    });

    it('should not throw when marking folder cache dirty', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.markFolderCacheDirty()).not.toThrow();
      manager.destroy();
    });
  });

  describe('MCP and agent support', () => {
    it('should expose getMentionedMcpServers', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      const servers = manager.getMentionedMcpServers();
      expect(servers).toBeInstanceOf(Set);
      expect(servers.size).toBe(0);
      manager.destroy();
    });

    it('should clear MCP mentions', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      // Should not throw
      manager.clearMcpMentions();
      expect(manager.getMentionedMcpServers().size).toBe(0);
      manager.destroy();
    });

    it('should set onMcpMentionChange callback without error', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      const callback = jest.fn();
      expect(() => manager.setOnMcpMentionChange(callback)).not.toThrow();
      manager.destroy();
    });

    it('should setMcpManager without error', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.setMcpManager(null)).not.toThrow();
      manager.destroy();
    });

    it('should setAgentService without error', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.setAgentService(null)).not.toThrow();
      manager.destroy();
    });

    it('should preScanExternalContexts without error', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.preScanExternalContexts()).not.toThrow();
      manager.destroy();
    });
  });

  describe('mention dropdown delegation', () => {
    it('should report isMentionDropdownVisible as false initially', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(manager.isMentionDropdownVisible()).toBe(false);
      manager.destroy();
    });

    it('should hideMentionDropdown without error', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      expect(() => manager.hideMentionDropdown()).not.toThrow();
      manager.destroy();
    });

    it('should containsElement return false for unrelated node', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );
      const unrelatedNode = createMockEl() as unknown as Node;
      expect(manager.containsElement(unrelatedNode)).toBe(false);
      manager.destroy();
    });
  });

  describe('destroy', () => {
    it('does not use TyporaWorkspace event subscriptions', () => {
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );

      manager.destroy();
      expect(app.vault.on).not.toHaveBeenCalled();
      expect(app.vault.offref).not.toHaveBeenCalled();
    });
  });

  describe('onOpenFile callback', () => {
    it('should show Notice when file not found in vault', async () => {
      const { Notice: NoticeMock } = jest.requireMock('@/typora/platform');
      const app = createMockApp();
      const manager = new FileContextManager(
        app, containerEl as any, inputEl, createMockCallbacks()
      );

      const chipsView = (manager as any).chipsView;
      const openCallback = chipsView.callbacks.onOpenFile;
      expect(openCallback).toBeDefined();

      await openCallback('notes/missing.md');
      expect(NoticeMock).toHaveBeenCalledWith(expect.stringContaining('Could not open file'));
      manager.destroy();
    });
  });
});
