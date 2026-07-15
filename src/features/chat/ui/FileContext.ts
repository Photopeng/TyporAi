import type { McpServerManager } from '../../../core/mcp/McpServerManager';
import type { FileWatchService, NotificationService } from '../../../core/ports';
import { t } from '../../../i18n/i18n';
import type { AgentMentionProvider } from '../../../shared/mention/MentionDropdownController';
import { MentionDropdownController } from '../../../shared/mention/MentionDropdownController';
import { WorkspaceMentionDataProvider } from '../../../shared/mention/WorkspaceMentionDataProvider';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import {
  createExternalContextLookupGetter,
  isMentionStart,
  resolveExternalMentionAtIndex,
} from '../../../utils/contextMentionResolver';
import { buildExternalContextDisplayEntries } from '../../../utils/externalContext';
import { externalContextScanner } from '../../../utils/externalContextScanner';
import { getVaultPath, normalizePathForVault as normalizePathForVaultUtil } from '../../../utils/path';
import { FileContextState } from './file-context/state/FileContextState';
import { FileChipsView } from './file-context/view/FileChipsView';

export interface FileContextCallbacks {
  getExcludedTags: () => string[];
  onChipsChanged?: () => void;
  getExternalContexts?: () => string[];
  /** Called when an agent is selected from the @ mention dropdown. */
  onAgentMentionSelect?: (agentId: string) => void;
}

function isWorkspaceFileLike(value: unknown): value is { path: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { path?: unknown };
  return typeof candidate.path === 'string' && candidate.path.length > 0;
}

interface WorkspaceFileRef { path: string }
interface FileContextHost {
  vault: {
    adapter?: { basePath?: unknown };
    getFiles(): Array<{ name: string; path: string; stat?: { mtime?: number } }>;
    getAllLoadedFiles(): Array<{ name?: string; path?: string }>;
    getAbstractFileByPath(path: string): unknown;
  };
  workspace: {
    getActiveFile(): WorkspaceFileRef | null;
    getLeaf(): { openFile(file: WorkspaceFileRef): Promise<void> | void };
  };
  metadataCache: {
    getFileCache(file: WorkspaceFileRef): {
      frontmatter?: { tags?: unknown };
      tags?: Array<{ tag: string }>;
    } | null;
  };
}

export class FileContextManager {
  private app: FileContextHost;
  private callbacks: FileContextCallbacks;
  private chipsContainerEl: HTMLElement;
  private dropdownContainerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private state: FileContextState;
  private mentionDataProvider: WorkspaceMentionDataProvider;
  private chipsView: FileChipsView;
  private mentionDropdown: MentionDropdownController;
  private readonly fileWatchStops = new Map<string, () => void>();

  // Current note (shown as chip)
  private currentNotePath: string | null = null;

  // MCP server support
  private onMcpMentionChange: ((servers: Set<string>) => void) | null = null;

  constructor(
    app: FileContextHost,
    chipsContainerEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    callbacks: FileContextCallbacks,
    dropdownContainerEl?: HTMLElement,
    private readonly watches?: FileWatchService,
    private readonly notifications: NotificationService = new NoticeAdapter(),
  ) {
    this.app = app;
    this.chipsContainerEl = chipsContainerEl;
    this.dropdownContainerEl = dropdownContainerEl ?? chipsContainerEl;
    this.inputEl = inputEl;
    this.callbacks = callbacks;

    this.state = new FileContextState();
    this.mentionDataProvider = new WorkspaceMentionDataProvider(this.app);
    this.mentionDataProvider.initializeInBackground();

    this.chipsView = new FileChipsView(this.chipsContainerEl, {
      onRemoveAttachment: (filePath) => {
        if (filePath === this.currentNotePath) {
          this.currentNotePath = null;
          this.detachFile(filePath);
          this.refreshCurrentNoteChip();
        }
      },
      onOpenFile: (filePath) => {
        void (async (): Promise<void> => {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (!isWorkspaceFileLike(file)) {
            this.notifications.show(t('chat.fileContext.openNotFound', { path: filePath }), 'warning');
            return;
          }
          try {
            await this.app.workspace.getLeaf().openFile(file);
          } catch (error) {
            this.notifications.show(t('chat.fileContext.openFailed', { error: error instanceof Error ? error.message : String(error) }), 'error');
          }
        })();
      },
    });

    this.mentionDropdown = new MentionDropdownController(
      this.dropdownContainerEl,
      this.inputEl,
      {
        onAttachFile: (filePath) => this.attachFile(filePath),
        onMcpMentionChange: (servers) => this.onMcpMentionChange?.(servers),
        onAgentMentionSelect: (agentId) => this.callbacks.onAgentMentionSelect?.(agentId),
        getMentionedMcpServers: () => this.state.getMentionedMcpServers(),
        setMentionedMcpServers: (mentions) => this.state.setMentionedMcpServers(mentions),
        addMentionedMcpServer: (name) => this.state.addMentionedMcpServer(name),
        getExternalContexts: () => this.callbacks.getExternalContexts?.() || [],
        getCachedWorkspaceFolders: () => this.mentionDataProvider.getCachedWorkspaceFolders(),
        getCachedWorkspaceFiles: () => this.mentionDataProvider.getCachedWorkspaceFiles(),
        normalizeWorkspacePath: (rawPath) => this.normalizePathForVault(rawPath),
      }
    );

  }

  /** Returns the current note path (shown as chip). */
  getCurrentNotePath(): string | null {
    return this.currentNotePath;
  }

  getAttachedFiles(): Set<string> {
    return this.state.getAttachedFiles();
  }

  /** Checks whether current note should be sent for this session. */
  shouldSendCurrentNote(notePath?: string | null): boolean {
    const resolvedPath = notePath ?? this.currentNotePath;
    return !!resolvedPath && !this.state.hasSentCurrentNote();
  }

  /** Marks current note as sent (call after sending a message). */
  markCurrentNoteSent() {
    this.state.markCurrentNoteSent();
  }

  isSessionStarted(): boolean {
    return this.state.isSessionStarted();
  }

  startSession() {
    this.state.startSession();
  }

  /** Resets state for a new conversation. */
  resetForNewConversation() {
    this.currentNotePath = null;
    this.state.resetForNewConversation();
    this.refreshCurrentNoteChip();
  }

  /** Resets state for loading an existing conversation. */
  resetForLoadedConversation(hasMessages: boolean) {
    this.currentNotePath = null;
    this.state.resetForLoadedConversation(hasMessages);
    this.refreshCurrentNoteChip();
  }

  /** Sets current note (for restoring persisted state). */
  setCurrentNote(notePath: string | null) {
    this.currentNotePath = notePath;
    if (notePath) {
      this.attachFile(notePath);
    }
    this.refreshCurrentNoteChip();
  }

  /** Auto-attaches the currently focused file (for new sessions). */
  autoAttachActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !this.hasExcludedTag(activeFile)) {
      const normalizedPath = this.normalizePathForVault(activeFile.path);
      if (normalizedPath) {
        this.currentNotePath = normalizedPath;
        this.attachFile(normalizedPath);
        this.refreshCurrentNoteChip();
      }
    }
  }

  /** Handles file open event. */
  handleFileOpen(file: WorkspaceFileRef) {
    const normalizedPath = this.normalizePathForVault(file.path);
    if (!normalizedPath) return;

    if (!this.state.isSessionStarted()) {
      this.clearAttachments();
      if (!this.hasExcludedTag(file)) {
        this.currentNotePath = normalizedPath;
        this.attachFile(normalizedPath);
      } else {
        this.currentNotePath = null;
      }
      this.refreshCurrentNoteChip();
    }
  }

  markFileCacheDirty() {
    this.mentionDataProvider.markFilesDirty();
  }

  markFolderCacheDirty() {
    this.mentionDataProvider.markFoldersDirty();
  }

  /** Handles input changes to detect @ mentions. */
  handleInputChange() {
    this.mentionDropdown.handleInputChange();
  }

  /** Handles keyboard navigation in mention dropdown. Returns true if handled. */
  handleMentionKeydown(e: KeyboardEvent): boolean {
    return this.mentionDropdown.handleKeydown(e);
  }

  isMentionDropdownVisible(): boolean {
    return this.mentionDropdown.isVisible();
  }

  hideMentionDropdown() {
    this.mentionDropdown.hide();
  }

  containsElement(el: Node): boolean {
    return this.mentionDropdown.containsElement(el);
  }

  transformContextMentions(text: string): string {
    const externalContexts = this.callbacks.getExternalContexts?.() || [];
    if (externalContexts.length === 0 || !text.includes('@')) return text;

    const contextEntries = buildExternalContextDisplayEntries(externalContexts)
      .sort((a, b) => b.displayNameLower.length - a.displayNameLower.length);
    const getContextLookup = createExternalContextLookupGetter(
      contextRoot => externalContextScanner.scanPaths([contextRoot])
    );

    let replaced = false;
    let cursor = 0;
    const chunks: string[] = [];

    for (let index = 0; index < text.length; index++) {
      if (!isMentionStart(text, index)) continue;

      const resolved = resolveExternalMentionAtIndex(text, index, contextEntries, getContextLookup);
      if (!resolved) continue;

      chunks.push(text.slice(cursor, index));
      chunks.push(`${resolved.resolvedPath}${resolved.trailingPunctuation}`);
      cursor = resolved.endIndex;
      index = resolved.endIndex - 1;
      replaced = true;
    }

    if (!replaced) return text;
    chunks.push(text.slice(cursor));
    return chunks.join('');
  }

  /** Cleans up event listeners (call on view close). */
  destroy() {
    this.fileWatchStops.forEach(stop => stop());
    this.fileWatchStops.clear();
    this.mentionDropdown.destroy();
    this.chipsView.destroy();
  }

  /** Normalizes a file path to be vault-relative with forward slashes. */
  normalizePathForVault(rawPath: string | undefined | null): string | null {
    const vaultPath = getVaultPath(this.app);
    return normalizePathForVaultUtil(rawPath, vaultPath);
  }

  private refreshCurrentNoteChip(): void {
    this.chipsView.renderCurrentNote(this.currentNotePath);
    this.callbacks.onChipsChanged?.();
  }

  private attachFile(path: string): void {
    this.state.attachFile(path);
    this.syncFileWatches();
  }

  private detachFile(path: string): void {
    this.state.detachFile(path);
    this.syncFileWatches();
  }

  private clearAttachments(): void {
    this.state.clearAttachments();
    this.syncFileWatches();
  }

  private syncFileWatches(): void {
    if (!this.watches) return;
    const attached = this.state.getAttachedFiles();
    for (const [path, stop] of this.fileWatchStops) {
      if (!attached.has(path)) {
        stop();
        this.fileWatchStops.delete(path);
      }
    }
    const root = getVaultPath(this.app);
    if (!root) return;
    for (const path of attached) {
      if (this.fileWatchStops.has(path)) continue;
      const absolutePath = `${root.replace(/[\\/]+$/, '')}/${path.replace(/\\/g, '/')}`;
      this.fileWatchStops.set(path, this.watches.watch(absolutePath, event => {
        if (event.type === 'deleted') this.handleFileDeleted(path);
      }));
    }
  }

  private handleFileDeleted(deletedPath: string): void {
    const normalized = this.normalizePathForVault(deletedPath);
    if (!normalized) return;

    let needsUpdate = false;

    // Clear current note if deleted
    if (this.currentNotePath === normalized) {
      this.currentNotePath = null;
      needsUpdate = true;
    }

    // Remove from attached files
    if (this.state.getAttachedFiles().has(normalized)) {
      this.detachFile(normalized);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.refreshCurrentNoteChip();
    }
  }

  // ========================================
  // MCP Server Support
  // ========================================

  setMcpManager(manager: McpServerManager | null): void {
    this.mentionDropdown.setMcpManager(manager);
  }

  setAgentService(agentService: AgentMentionProvider | null): void {
    this.mentionDropdown.setAgentService(agentService);
  }

  setOnMcpMentionChange(callback: (servers: Set<string>) => void): void {
    this.onMcpMentionChange = callback;
  }

  /**
   * Pre-scans external context paths in the background to warm the cache.
   * Should be called when external context paths are added/changed.
   */
  preScanExternalContexts(): void {
    this.mentionDropdown.preScanExternalContexts();
  }

  getMentionedMcpServers(): Set<string> {
    return this.state.getMentionedMcpServers();
  }

  clearMcpMentions(): void {
    this.state.clearMcpMentions();
  }

  updateMcpMentionsFromText(text: string): void {
    this.mentionDropdown.updateMcpMentionsFromText(text);
  }

  private hasExcludedTag(file: WorkspaceFileRef): boolean {
    const excludedTags = this.callbacks.getExcludedTags();
    if (excludedTags.length === 0) return false;

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;

    const fileTags: string[] = [];

    if (cache.frontmatter?.tags) {
      const fmTags: unknown = cache.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        fileTags.push(...fmTags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.replace(/^#/, '')));
      } else if (typeof fmTags === 'string') {
        fileTags.push(fmTags.replace(/^#/, ''));
      }
    }

    if (cache.tags) {
      fileTags.push(...cache.tags.map(t => t.tag.replace(/^#/, '')));
    }

    return fileTags.some(tag => excludedTags.includes(tag));
  }
}
