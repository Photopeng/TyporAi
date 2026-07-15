import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JSDOM } from 'jsdom';

import { TyporaDocumentView } from '@/typora/platform';

let mockWorkspaceRoot = '';

jest.mock('@/adapters/settingsStorage', () => ({
  FileSettingsStorageAdapter: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/adapters/workspace', () => ({
  NodeWorkspaceAdapter: jest.fn().mockImplementation(() => {
    let root = mockWorkspaceRoot;
    return {
      adoptRoot: jest.fn(async (nextRoot: string) => {
        root = nextRoot;
      }),
      detectRoot: jest.fn(async () => root),
      getRoot: jest.fn(() => root),
      initialize: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn(async (relPath: string) => fs.promises.readFile(path.join(root, relPath), 'utf8')),
      setRoot: jest.fn(async (nextRoot: string) => {
        root = nextRoot;
      }),
      writeFile: jest.fn(async (relPath: string, content: string) => {
        await fs.promises.mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
        await fs.promises.writeFile(path.join(root, relPath), content, 'utf8');
      }),
    };
  }),
}));

jest.mock('@/typora/editor-api', () => ({
  TyporaEditorApi: jest.fn().mockImplementation(() => ({
    getCurrentFilePath: jest.fn(() => path.join(mockWorkspaceRoot, 'note.md')),
    getSelection: jest.fn(() => ''),
    getWorkspacePath: jest.fn(() => mockWorkspaceRoot),
    insertText: jest.fn(() => true),
  })),
}));

jest.mock('@/main', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(function MockTyporAiPlugin(this: any, app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
    this.onload = jest.fn().mockResolvedValue(undefined);
    this.onunload = jest.fn();
  }),
}));

jest.mock('@/features/chat/TyporAiView', () => ({
  TyporAiView: jest.fn().mockImplementation(function MockTyporAiView(this: any, leaf: any, plugin: any) {
    this.leaf = leaf;
    this.plugin = plugin;
    this.onClose = jest.fn().mockResolvedValue(undefined);
    this.onOpen = jest.fn().mockImplementation(() => {
      const header = this.contentEl?.createDiv({ cls: 'typorai-header' });
      const title = header?.createDiv({ cls: 'typorai-title' });
      title?.createEl('h4', { text: 'TyporAi', cls: 'typorai-title-text' });
      return Promise.resolve();
    });
  }),
}));

import {
  disposeThemeWatcher,
  installThemeWatcher,
  mountRealTyporAiInTypora,
  unmountRealTyporAiInTypora,
} from '@/typora/typora-host';

describe('typora host workspace file facade', () => {
  let originalDocument: typeof globalThis.document | undefined;
  let originalWindow: typeof globalThis.window | undefined;
  let originalElement: typeof globalThis.Element | undefined;
  let originalHTMLElement: typeof globalThis.HTMLElement | undefined;
  let originalGetComputedStyle: typeof globalThis.getComputedStyle | undefined;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typorai-typora-host-'));
    mockWorkspaceRoot = tempRoot;
    fs.writeFileSync(path.join(tempRoot, 'note.md'), '# Note', 'utf8');

    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalElement = globalThis.Element;
    originalHTMLElement = globalThis.HTMLElement;
    originalGetComputedStyle = globalThis.getComputedStyle;
    const dom = new JSDOM('<!doctype html><html><head></head><body><content><div id="write"></div></content></body></html>', {
      url: 'https://typora.local/typemark/window.html',
    });
    dom.window.localStorage.clear();
    Object.defineProperty(dom.window, 'innerWidth', {
      configurable: true,
      value: 1600,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: dom.window.document,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: dom.window,
      writable: true,
    });
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: dom.window.Element,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: dom.window.HTMLElement,
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: dom.window.getComputedStyle.bind(dom.window),
    });
  });

  afterEach(async () => {
    await unmountRealTyporAiInTypora();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: originalElement,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHTMLElement,
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: originalGetComputedStyle,
    });
    fs.rmSync(tempRoot, { force: true, recursive: true });
    jest.clearAllMocks();
  });

  it('mounts app.vault through the workspace file facade compatibility layer', async () => {
    const runtime = await mountRealTyporAiInTypora() as any;
    expect(runtime).toBeDefined();
    expect(runtime.app.vault.constructor.name).toBe('TyporaWorkspaceFileFacade');
    expect(runtime.app.vault.adapter.constructor.name).toBe('TyporaWorkspaceFileAdapter');
    expect(runtime.app.workspace.constructor.name).toBe('TyporaWorkspaceService');
    expect(runtime.app.vault.getFiles().map((file: any) => file.path)).toContain('note.md');
    expect(runtime.app.metadataCache.getFirstLinkpathDest('note', '')?.path).toBe('note.md');
    expect(runtime.app.workspace.getActiveFile()?.path).toBe('note.md');
    expect(runtime.app.workspace.getActiveViewOfType(TyporaDocumentView)?.constructor.name).toBe('TyporaEditorViewFacade');
    expect(document.querySelector('.typorai-typora-settings-button')).not.toBeNull();
  });

  it('refreshes Typora layout while reserving the panel width for the document', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn();
    const codeMirror = document.createElement('div');
    codeMirror.className = 'CodeMirror';
    (codeMirror as HTMLElement & { CodeMirror?: { refresh: () => void } }).CodeMirror = { refresh };
    document.getElementById('write')?.appendChild(codeMirror);
    const secondRefresh = jest.fn();
    const secondCodeMirror = document.createElement('div');
    secondCodeMirror.className = 'CodeMirror';
    (secondCodeMirror as HTMLElement & { CodeMirror?: { refresh: () => void } }).CodeMirror = { refresh: secondRefresh };
    document.getElementById('write')?.appendChild(secondCodeMirror);
    const onResize = jest.fn();
    window.addEventListener('resize', onResize);

    await mountRealTyporAiInTypora();
    jest.advanceTimersByTime(801);

    expect(refresh).toHaveBeenCalledTimes(4);
    expect(secondRefresh).toHaveBeenCalledTimes(4);
    expect(onResize).not.toHaveBeenCalled();
    expect(document.body.classList.contains('typorai-typora-repair-write-layout')).toBe(false);
    expect(document.getElementById('typorai-typora-real-styles')?.textContent)
      .not.toContain('typorai-typora-repair-write-layout');
    const styles = document.getElementById('typorai-typora-real-styles')?.textContent ?? '';
    expect(styles).toMatch(/body\s*>\s*content\s*\{[^}]*right:\s*var\(--typorai-typora-panel-width\)/);
    expect(styles).toMatch(/body\.typorai-typora-panel-hidden\s*>\s*content\s*\{[^}]*right:\s*0/);

    window.removeEventListener('resize', onResize);
    jest.useRealTimers();
  });

  it('recovers #write when Typora nests it inside the hidden image-folder modal', async () => {
    const content = document.querySelector('content')!;
    const write = document.getElementById('write')!;
    const modal = document.createElement('div');
    modal.id = 'image-create-folder-confirm';
    modal.className = 'modal fade';
    modal.style.display = 'none';
    content.appendChild(modal);
    modal.appendChild(write);

    await mountRealTyporAiInTypora();

    expect(write.closest('#image-create-folder-confirm')).toBeNull();
    expect(write.parentElement).toBe(content);
  });

  it('leaves a healthy Typora #write parent unchanged', async () => {
    const write = document.getElementById('write')!;
    const originalParent = write.parentElement;

    await mountRealTyporAiInTypora();

    expect(write.parentElement).toBe(originalParent);
  });

  it('remains leak-free across 100 mount/unmount cycles', async () => {
    for (let index = 0; index < 100; index++) {
      await mountRealTyporAiInTypora();
      expect(document.querySelectorAll('#typorai-typora-root')).toHaveLength(1);
      expect(document.querySelectorAll('#typorai-typora-real-styles')).toHaveLength(1);
      await unmountRealTyporAiInTypora();
      expect(document.querySelector('#typorai-typora-root')).toBeNull();
      expect(document.querySelector('#typorai-typora-real-styles')).toBeNull();
      expect(document.querySelector('.typorai-typora-panel-toggle')).toBeNull();
    }
  });

  it('installs panel resize and hide controls on mount', async () => {
    await mountRealTyporAiInTypora();

    expect(document.querySelector('.typorai-typora-resizer')).not.toBeNull();
    expect(document.querySelector('.typorai-typora-hide-button')).toBeNull();
    expect(document.querySelector('.typorai-typora-title-hide-button')).not.toBeNull();
    expect(document.querySelector('.typorai-typora-title-hide-button')?.getAttribute('role')).toBe('button');
    expect(document.querySelector('.typorai-title')?.textContent).toBe('TyporAi>');
    expect(document.querySelector('.typorai-typora-panel-toggle')).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('430px');
    expect(document.getElementById('typorai-typora-root')?.classList.contains('typorai-typora-panel-hidden')).toBe(false);
  });

  it('resizes the panel via the left drag handle and persists the width', async () => {
    await mountRealTyporAiInTypora();

    const resizer = document.querySelector<HTMLElement>('.typorai-typora-resizer')!;
    dispatchPointer(resizer, 'pointerdown', 1000);
    dispatchPointer(document, 'pointermove', 850);
    dispatchPointer(document, 'pointerup', 850);

    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('580px');
    expect(window.localStorage.getItem('typorai.typora.panelWidth')).toBe('580');
  });

  it('clamps panel resizing to minimum and maximum widths', async () => {
    await mountRealTyporAiInTypora();

    const resizer = document.querySelector<HTMLElement>('.typorai-typora-resizer')!;
    dispatchPointer(resizer, 'pointerdown', 1000);
    dispatchPointer(document, 'pointermove', 1200);
    dispatchPointer(document, 'pointerup', 1200);
    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('320px');

    dispatchPointer(resizer, 'pointerdown', 1000);
    dispatchPointer(document, 'pointermove', 0);
    dispatchPointer(document, 'pointerup', 0);
    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('720px');
  });

  it('hides and restores the panel while preserving the stored width', async () => {
    window.localStorage.setItem('typorai.typora.panelWidth', '560');
    await mountRealTyporAiInTypora();

    document.querySelector<HTMLElement>('.typorai-typora-title-hide-button')!.click();
    expect(document.body.classList.contains('typorai-typora-panel-hidden')).toBe(true);
    expect(document.getElementById('typorai-typora-root')?.classList.contains('typorai-typora-panel-hidden')).toBe(true);
    expect(window.localStorage.getItem('typorai.typora.panelHidden')).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('560px');

    document.querySelector<HTMLButtonElement>('.typorai-typora-panel-toggle')!.click();
    expect(document.body.classList.contains('typorai-typora-panel-hidden')).toBe(false);
    expect(document.getElementById('typorai-typora-root')?.classList.contains('typorai-typora-panel-hidden')).toBe(false);
    expect(window.localStorage.getItem('typorai.typora.panelHidden')).toBe('false');
    expect(document.documentElement.style.getPropertyValue('--typorai-typora-panel-width')).toBe('560px');
  });
});

describe('installThemeWatcher / disposeThemeWatcher', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let originalMutationObserver: typeof globalThis.MutationObserver | undefined;
  let originalDocument: typeof globalThis.document | undefined;
  let originalWindow: typeof globalThis.window | undefined;
  let originalElement: typeof globalThis.Element | undefined;
  let originalHTMLElement: typeof globalThis.HTMLElement | undefined;
  let originalGetComputedStyle: typeof globalThis.getComputedStyle | undefined;
  let addEventListenerSpy: jest.Mock;
  let removeEventListenerSpy: jest.Mock;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalElement = globalThis.Element;
    originalHTMLElement = globalThis.HTMLElement;
    originalGetComputedStyle = globalThis.getComputedStyle;
    originalMatchMedia = window.matchMedia;
    originalMutationObserver = globalThis.MutationObserver;

    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: dom.window.document,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: dom.window,
      writable: true,
    });
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: dom.window.Element,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: dom.window.HTMLElement,
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: dom.window.getComputedStyle.bind(dom.window),
    });

    addEventListenerSpy = jest.fn();
    removeEventListenerSpy = jest.fn();
    const mockMql = {
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      removeListener: jest.fn(),
      addListener: jest.fn(),
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
    } as unknown as MediaQueryList;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockReturnValue(mockMql),
    });

    class MockMutationObserver {
      private disconnectFn = jest.fn();
      private observeFn = jest.fn();
      disconnect(): void {
        this.disconnectFn();
      }
      observe(): void {
        this.observeFn();
      }
    }
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: MockMutationObserver,
    });
  });

  afterEach(() => {
    if (originalMatchMedia !== undefined) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
    }
    if (originalMutationObserver !== undefined) {
      Object.defineProperty(globalThis, 'MutationObserver', {
        configurable: true,
        writable: true,
        value: originalMutationObserver,
      });
    }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: originalElement,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHTMLElement,
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: originalGetComputedStyle,
    });
    jest.clearAllMocks();
  });

  it('removes the matchMedia change listener on dispose', () => {
    const handle = installThemeWatcher();
    expect(handle).not.toBeNull();
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));

    disposeThemeWatcher(handle);

    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    const registered = addEventListenerSpy.mock.calls.find(call => call[0] === 'change');
    const removed = removeEventListenerSpy.mock.calls.find(call => call[0] === 'change');
    expect(registered).toBeDefined();
    expect(removed).toBeDefined();
    // The exact same handler reference must be used for add and remove, otherwise
    // the browser's listener registry will not match and the leak persists.
    expect(removed?.[1]).toBe(registered?.[1]);
  });

  it('dispose is a no-op when called with null', () => {
    expect(() => disposeThemeWatcher(null)).not.toThrow();
  });

  it('dispose is idempotent (safe to call multiple times)', () => {
    const handle = installThemeWatcher();
    disposeThemeWatcher(handle);
    expect(() => disposeThemeWatcher(handle)).not.toThrow();
  });
});

function dispatchPointer(target: EventTarget, type: string, clientX: number): void {
  const event = new window.Event(type, { bubbles: true, cancelable: true }) as Event & { clientX: number };
  Object.defineProperty(event, 'clientX', {
    configurable: true,
    value: clientX,
  });
  target.dispatchEvent(event);
}
