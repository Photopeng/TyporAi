import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TyporaEventRef, TyporaHostApp, TyporaMetadataIndex, TyporaWorkspace, TyporaWorkspaceApi,WorkspaceFileAdapter } from '@/typora/platform';
import { setIcon, TyporaDocumentView, TyporaFile, TyporaFolder } from '@/typora/platform';

import { FileSettingsStorageAdapter } from '../adapters/settingsStorage';
import { NodeWorkspaceAdapter } from '../adapters/workspace';
import type { ApplicationRuntime } from '../application/createApplicationRuntime';
import { ProviderWorkspaceRegistry } from '../core/providers/ProviderWorkspaceRegistry';
import { VIEW_TYPE_TYPORAI } from '../core/types';
import { TyporAiView } from '../features/chat/TyporAiView';
import { TyporAiSettingTab } from '../features/settings/TyporAiSettings';
import { t } from '../i18n/i18n';
import TyporAiPlugin from '../main';
import { ModalController } from '../ui/ModalController';
import { type ThemeWatchHandle,watchTheme } from '../ui/ThemeWatcher';
import { setTyporAiTooltip } from '../ui/Tooltip';
import {
  createTyporaChatRuntimeFactory,
  createTyporaProviderServiceFactory,
  tryCreateTyporaApplicationRuntime,
} from './createTyporaApplicationRuntime';
import { installTyporaDomHelpers } from './dom-helpers';
import { TyporaEditorApi } from './editor-api';

const ROOT_ID = 'typorai-typora-root';
const CONTENT_ID = 'typorai-typora-content';
const STYLE_ID = 'typorai-typora-real-styles';
const SETTINGS_MODAL_ID = 'typorai-typora-settings-modal';
let activeSettingsModal: ModalController | null = null;
const LEGACY_DATA_FILE = '.typorai/typora-plugin-data.json';
const PLUGIN_DATA_KEY = 'pluginData';
const PANEL_WIDTH_STORAGE_KEY = 'typorai.typora.panelWidth';
const PANEL_HIDDEN_STORAGE_KEY = 'typorai.typora.panelHidden';
const DEFAULT_PANEL_WIDTH = 430;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const editorLayoutTimers: number[] = [];
let editorLayoutObserver: MutationObserver | null = null;

type Listener = (...args: unknown[]) => void;

type TyporaRuntime = {
  app: TyporaHostApp;
  leaf: TyporaLeaf;
  plugin: TyporAiPlugin;
  settingsStorage: FileSettingsStorageAdapter;
  view: TyporAiView;
  editor: TyporaEditorApi;
  applicationRuntime: ApplicationRuntime | null;
  chatRuntimeFactory: ReturnType<typeof createTyporaChatRuntimeFactory> | null;
  providerServiceFactory: ReturnType<typeof createTyporaProviderServiceFactory> | null;
  workspaceAdapter: NodeWorkspaceAdapter;
  themeWatcher: ThemeWatcherHandle | null;
  ensurePanelVisible: () => void;
};

type TyporaLeaf = {
  app: TyporaHostApp;
  view: TyporAiView | null;
  setViewState(state: { type: string; active?: boolean }): Promise<void>;
};

let activeTyporaRuntime: TyporaRuntime | null = null;

class EventHub {
  private listeners = new Map<string, Set<Listener>>();

  on(name: string, callback: Listener): TyporaEventRef {
    const bucket = this.listeners.get(name) ?? new Set<Listener>();
    bucket.add(callback);
    this.listeners.set(name, bucket);
    return { name, callback };
  }

  offref(ref: TyporaEventRef): void {
    if (!ref || typeof ref !== 'object') return;
    const eventRef = ref as { name?: string; callback?: Listener };
    if (!eventRef.name || !eventRef.callback) return;
    this.listeners.get(eventRef.name)?.delete(eventRef.callback);
  }

  trigger(name: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(...args);
    }
  }
}

class TyporaWorkspaceFileAdapter implements WorkspaceFileAdapter {
  basePath: string;

  constructor(
    private readonly workspaceAdapter: NodeWorkspaceAdapter,
    private readonly getFallbackBasePath: () => string,
  ) {
    this.basePath = this.getBasePath();
  }

  refreshBasePath(): void {
    this.basePath = this.getBasePath();
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await fs.promises.access(await this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  async read(relPath: string): Promise<string> {
    return await this.workspaceAdapter.readFile(relPath);
  }

  async write(relPath: string, content: string): Promise<void> {
    await this.workspaceAdapter.writeFile(relPath, content);
  }

  async remove(relPath: string): Promise<void> {
    await fs.promises.rm(await this.resolve(relPath), { force: true });
  }

  async rmdir(relPath: string, recursive: boolean): Promise<void> {
    await fs.promises.rm(await this.resolve(relPath), { recursive, force: true });
  }

  async list(relPath: string): Promise<{ files: string[]; folders: string[] }> {
    const root = await this.resolve(relPath || '.');
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const prefix = toWorkspacePath(relPath);
    const files: string[] = [];
    const folders: string[] = [];
    for (const entry of entries) {
      const value = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) folders.push(value);
      if (entry.isFile()) files.push(value);
    }
    return { files, folders };
  }

  async mkdir(relPath: string): Promise<void> {
    await fs.promises.mkdir(await this.resolve(relPath), { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const target = await this.resolve(newPath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.rename(await this.resolve(oldPath), target);
  }

  async stat(relPath: string): Promise<{ mtime: number; size: number } | null> {
    try {
      const stats = await fs.promises.stat(await this.resolve(relPath));
      return { mtime: stats.mtimeMs, size: stats.size };
    } catch {
      return null;
    }
  }

  async resolve(relPath: string): Promise<string> {
    this.refreshBasePath();
    return await this.workspaceAdapter.resolvePath(relPath);
  }

  private getBasePath(): string {
    return this.workspaceAdapter.getRoot() ?? this.getFallbackBasePath();
  }
}

class TyporaEditorBridge {
  constructor(private readonly editor: TyporaEditorApi) {}

  getSelection(): string {
    return this.editor.getSelection();
  }

  getCursor(): { line: number; ch: number } {
    return { line: 0, ch: 0 };
  }

  getLine(line: number): string {
    return this.editor.getAllText().split(/\r?\n/)[line] ?? '';
  }

  lineCount(): number {
    return this.editor.getAllText().split(/\r?\n/).length;
  }

  replaceSelection(text: string): void {
    this.editor.insertText(text);
  }

  posToOffset(): number {
    return 0;
  }
}

class TyporaEditorViewFacade extends TyporaDocumentView {
  editor: TyporaEditorBridge;

  constructor(
    private readonly editorApi: TyporaEditorApi,
    private readonly getWorkspacePath: () => string,
  ) {
    super();
    this.editor = new TyporaEditorBridge(editorApi);
    this.containerEl = getTyporaEditorContainer();
    this.refresh();
  }

  getMode(): string {
    return 'preview';
  }

  refresh(): void {
    const currentPath = this.editorApi.getCurrentFilePath();
    this.file = currentPath ? fileFromAbsolutePath(currentPath, this.getWorkspacePath()) : undefined;
    this.containerEl = getTyporaEditorContainer();
  }
}

class TyporaWorkspaceFileFacade implements TyporaWorkspace {
  private hub = new EventHub();

  constructor(
    readonly adapter: TyporaWorkspaceFileAdapter,
    private readonly getWorkspacePath: () => string,
  ) {}

  on(name: string, callback: Listener): TyporaEventRef {
    return this.hub.on(name, callback);
  }

  offref(ref: TyporaEventRef): void {
    this.hub.offref(ref);
  }

  trigger(name: string, ...args: unknown[]): void {
    this.hub.trigger(name, ...args);
  }

  getFiles(): TyporaFile[] {
    return scanWorkspaceFiles(this.getWorkspacePath());
  }

  getAllLoadedFiles(): Array<TyporaFile | TyporaFolder> {
    return scanWorkspaceEntries(this.getWorkspacePath());
  }

  getAbstractFileByPath(relPath: string): TyporaFile | TyporaFolder | null {
    const absolute = path.resolve(this.getWorkspacePath(), relPath.replace(/[\\/]+/g, path.sep));
    if (!fs.existsSync(absolute)) return null;
    const stats = fs.statSync(absolute);
    return stats.isDirectory()
      ? folderFromAbsolutePath(absolute, this.getWorkspacePath())
      : fileFromAbsolutePath(absolute, this.getWorkspacePath());
  }

  getResourcePath(file: TyporaFile): string {
    return pathToFileUrl(path.resolve(this.getWorkspacePath(), file.path));
  }
}

class TyporaMetadataCache implements TyporaMetadataIndex {
  private hub = new EventHub();

  constructor(private readonly workspaceFiles: TyporaWorkspaceFileFacade) {}

  on(name: string, callback: Listener): TyporaEventRef {
    return this.hub.on(name, callback);
  }

  getFileCache(_file: TyporaFile): { frontmatter?: { tags?: string | string[] }; tags?: Array<{ tag: string }> } | null {
    return null;
  }

  getFirstLinkpathDest(linkpath: string, _sourcePath: string): TyporaFile | null {
    const candidates = [
      linkpath,
      linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`,
    ];
    for (const candidate of candidates) {
      const found = this.workspaceFiles.getAbstractFileByPath(candidate);
      if (found instanceof TyporaFile) return found;
    }
    return null;
  }
}

class TyporaWorkspaceService implements TyporaWorkspaceApi {
  private hub = new EventHub();
  private editorViewFacade: TyporaEditorViewFacade;
  private readonly getWorkspacePath: () => string;
  leaf: TyporaLeaf | null = null;

  constructor(editor: TyporaEditorApi, getWorkspacePath: () => string) {
    this.getWorkspacePath = getWorkspacePath;
    this.editorViewFacade = new TyporaEditorViewFacade(editor, getWorkspacePath);
  }

  on(name: string, callback: Listener): TyporaEventRef {
    return this.hub.on(name, callback);
  }

  getLeavesOfType(type: string): Array<{ view: unknown }> {
    if (type !== VIEW_TYPE_TYPORAI || !this.leaf?.view) return [];
    return [{ view: this.leaf.view }];
  }

  getActiveViewOfType<T>(type: { new (...args: never[]): T }): T | null {
    this.editorViewFacade.refresh();
    return type === TyporaDocumentView ? this.editorViewFacade as T : null;
  }

  getActiveDocumentView(): TyporaEditorViewFacade {
    this.editorViewFacade.refresh();
    return this.editorViewFacade;
  }

  getLeaf(): TyporaLeaf {
    return this.getOrCreateLeaf();
  }

  getLeftLeaf(): TyporaLeaf | null {
    return this.getOrCreateLeaf();
  }

  getRightLeaf(): TyporaLeaf | null {
    return this.getOrCreateLeaf();
  }

  getMostRecentLeaf(): TyporaLeaf | null {
    return this.getOrCreateLeaf();
  }

  getActiveFile(): TyporaFile | null {
    this.editorViewFacade.refresh();
    return this.editorViewFacade.file ?? null;
  }

  async openLinkText(linktext: string): Promise<void> {
    const target = path.resolve(this.getWorkspacePath(), linktext);
    if (fs.existsSync(target)) {
      window.location.href = pathToFileUrl(target);
    }
  }

  private getOrCreateLeaf(): TyporaLeaf {
    if (this.leaf) return this.leaf;
    this.leaf = {
      app: null as unknown as TyporaHostApp,
      view: null,
      setViewState: async () => {},
    };
    return this.leaf;
  }
}

export async function mountRealTyporAiInTypora(): Promise<TyporaRuntime | null> {
  installTyporaDomHelpers();
  repairMisnestedTyporaEditor();
  injectStyles();

  const root = ensureRoot();
  if (!root) return null;
  root.textContent = 'Loading TyporAi...';

  const editor = new TyporaEditorApi();
  const settingsStorage = new FileSettingsStorageAdapter();
  const workspaceAdapter = new NodeWorkspaceAdapter(settingsStorage);
  await initializeWorkspaceRoot(workspaceAdapter, editor);

  const getWorkspacePath = () => workspaceAdapter.getRoot() ?? getWorkspaceBasePath();
  const workspaceFileAdapter = new TyporaWorkspaceFileAdapter(workspaceAdapter, getWorkspacePath);
  const workspaceFiles = new TyporaWorkspaceFileFacade(workspaceFileAdapter, getWorkspacePath);
  const workspace = new TyporaWorkspaceService(editor, getWorkspacePath);
  const app: TyporaHostApp = {
    vault: workspaceFiles,
    workspace,
    metadataCache: new TyporaMetadataCache(workspaceFiles),
  };
  const leaf = workspace.getLeaf();
  leaf.app = app;
  workspace.leaf = leaf;

  const plugin = new TyporAiPlugin(app, {
    id: 'typorai-typora',
    name: 'TyporAi',
    version: '0.1.0',
  });
  plugin.loadData = async () => loadPluginData(settingsStorage, workspaceFileAdapter);
  plugin.saveData = async (data: unknown) => savePluginData(settingsStorage, data);

  await plugin.onload();

  root.empty();
  const containerEl = root.createDiv({ cls: 'workspace-leaf-content typorai-typora-leaf' });
  const contentEl = containerEl.createDiv({ cls: 'view-content' });
  contentEl.id = CONTENT_ID;

  const applicationRuntime = tryCreateTyporaApplicationRuntime(editor, settingsStorage);
  if (applicationRuntime) ProviderWorkspaceRegistry.configureHostServices(applicationRuntime.host);
  const view = new TyporAiView(leaf, plugin);
  const chatRuntimeFactory = applicationRuntime ? createTyporaChatRuntimeFactory(applicationRuntime) : null;
  const providerServiceFactory = applicationRuntime
    ? createTyporaProviderServiceFactory(applicationRuntime)
    : null;
  if (chatRuntimeFactory && typeof view.setRuntimeFactory === 'function') view.setRuntimeFactory(chatRuntimeFactory.create);
  if (providerServiceFactory && typeof view.setProviderServiceFactory === 'function') {
    view.setProviderServiceFactory(providerServiceFactory);
  }

  if (applicationRuntime && typeof view.setProcessTransport === 'function') {
    view.setProcessTransport(applicationRuntime.host.processes);
  }
  if (applicationRuntime && typeof view.setPlatform === 'function') {
    view.setPlatform(applicationRuntime.host.platform.operatingSystem);
  }
  if (applicationRuntime && typeof view.setFileWatchService === 'function') {
    view.setFileWatchService(applicationRuntime.host.watches);
  }
  view.app = app;
  view.containerEl = containerEl;
  view.contentEl = contentEl;
  leaf.view = view;

  await view.onOpen();
  installSettingsEntry(app, plugin, root);
  installPanelLayoutControls(root);
  const themeWatcher = installThemeWatcher();
  observeTyporaEditorLayout();
  scheduleEditorLayoutRefresh();

  activeTyporaRuntime = {
    app,
    leaf,
    plugin,
    settingsStorage,
    view,
    editor,
    applicationRuntime,
    chatRuntimeFactory,
    providerServiceFactory,
    workspaceAdapter,
    themeWatcher,
    ensurePanelVisible: () => setPanelHidden(false),
  };
  return activeTyporaRuntime;
}

export async function unmountRealTyporAiInTypora(): Promise<void> {
  clearEditorLayoutTimers();
  editorLayoutObserver?.disconnect();
  editorLayoutObserver = null;
  const runtime = activeTyporaRuntime;
  if (runtime) {
    try {
      await runtime.view.onClose();
    } finally {
      disposeThemeWatcher(runtime.themeWatcher);
      await runtime.chatRuntimeFactory?.dispose();
      await runtime.applicationRuntime?.dispose();
      runtime.plugin.onunload();
      runtime.settingsStorage.dispose();
      runtime.leaf.view = null;
      activeTyporaRuntime = null;
    }
  }

  document.getElementById(ROOT_ID)?.remove();
  document.querySelector('.typorai-typora-panel-toggle')?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.body?.classList.remove('typorai-typora-panel-hidden');
  document.body?.classList.remove('typorai-typora-resizing');
}

async function initializeWorkspaceRoot(
  workspaceAdapter: NodeWorkspaceAdapter,
  editor: TyporaEditorApi,
): Promise<void> {
  await workspaceAdapter.initialize();

  const currentFilePath = editor.getCurrentFilePath();
  const detectedRoot = currentFilePath ? await workspaceAdapter.detectRoot(currentFilePath) : null;
  if (detectedRoot) {
    await workspaceAdapter.setRoot(detectedRoot);
    return;
  }

  if (!workspaceAdapter.getRoot()) {
    await workspaceAdapter.adoptRoot(editor.getWorkspacePath() ?? getWorkspaceBasePath());
  }
}

async function loadPluginData(
  settingsStorage: FileSettingsStorageAdapter,
  workspaceFileAdapter: TyporaWorkspaceFileAdapter,
): Promise<unknown> {
  try {
    const data = await settingsStorage.get<unknown>(PLUGIN_DATA_KEY);
    if (data !== null) return data;

    return await loadLegacyPluginData(workspaceFileAdapter);
  } catch {
    return {};
  }
}

async function savePluginData(settingsStorage: FileSettingsStorageAdapter, data: unknown): Promise<void> {
  await settingsStorage.set(PLUGIN_DATA_KEY, data ?? {});
}

async function loadLegacyPluginData(adapter: TyporaWorkspaceFileAdapter): Promise<unknown> {
  try {
    if (!(await adapter.exists(LEGACY_DATA_FILE))) return {};
    return JSON.parse(await adapter.read(LEGACY_DATA_FILE)) as unknown;
  } catch {
    return {};
  }
}

function ensureRoot(): HTMLElement | null {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;
  if (!document.body) return null;

  const root = document.createElement('section');
  root.id = ROOT_ID;
  root.setAttribute('aria-label', 'TyporAi');
  document.body.appendChild(root);
  return root;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${scopeBundledStyles(readBundledStyles())}\n${getTyporaOverrideStyles()}`;
  document.head.appendChild(style);
}

function installPanelLayoutControls(root: HTMLElement): void {
  const width = getStoredPanelWidth();
  const hidden = getStoredPanelHidden();
  applyPanelLayout(width, hidden);

  if (!root.querySelector('.typorai-typora-resizer')) {
    const resizer = document.createElement('div');
    resizer.className = 'typorai-typora-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.tabIndex = 0;
    root.appendChild(resizer);
    wirePanelResizer(resizer);
  }

  installPanelHideButton(root);
  installPanelToggleButton();
}

function installPanelHideButton(root: HTMLElement): void {
  const header = root.querySelector<HTMLElement>('.typorai-header');
  const title = root.querySelector<HTMLElement>('.typorai-title');
  if (!header || !title) {
    return;
  }

  header.querySelector('.typorai-typora-hide-button')?.remove();
  if (!title.classList.contains('typorai-typora-title-hide-button')) {
    title.classList.add('typorai-typora-title-hide-button');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-label', t('typora.panel.hideAria'));
    setTyporAiTooltip(title, null);
    const chevron = document.createElement('span');
    chevron.className = 'typorai-title-chevron';
    chevron.textContent = '>';
    title.appendChild(chevron);
    title.addEventListener('click', () => setPanelHidden(true));
    title.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setPanelHidden(true);
    });
  }
  return;

  const legacyHeader = header as HTMLElement;
  if (legacyHeader.querySelector('.typorai-typora-hide-button')) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'typorai-typora-hide-button';
  button.setAttribute('aria-label', t('typora.panel.hideAria'));
  setTyporAiTooltip(button, t('typora.panel.hideTitle'));
  button.textContent = '›';
  button.textContent = '';
  setIcon(button, 'panel-right-close');
  button.addEventListener('click', () => setPanelHidden(true));
  legacyHeader.insertBefore(button, legacyHeader.firstElementChild);
}

function installPanelToggleButton(): void {
  if (document.querySelector('.typorai-typora-panel-toggle')) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'typorai-typora-panel-toggle';
  button.setAttribute('aria-label', t('typora.panel.showAria'));
  setTyporAiTooltip(button, null);
  button.textContent = t('common.typorai');
  button.addEventListener('click', () => setPanelHidden(false));
  document.body.appendChild(button);
}

function wirePanelResizer(resizer: HTMLElement): void {
  let startX = 0;
  let startWidth = DEFAULT_PANEL_WIDTH;
  let dragging = false;

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const nextWidth = clampPanelWidth(startWidth + startX - event.clientX);
    setPanelWidth(nextWidth);
  };
  const onPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('typorai-typora-resizing');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    scheduleEditorLayoutRefresh();
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (getStoredPanelHidden()) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = getStoredPanelWidth();
    document.body.classList.add('typorai-typora-resizing');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
}

function setPanelWidth(width: number): void {
  const nextWidth = clampPanelWidth(width);
  safeLocalStorageSet(PANEL_WIDTH_STORAGE_KEY, String(nextWidth));
  applyPanelLayout(nextWidth, getStoredPanelHidden());
}

function setPanelHidden(hidden: boolean): void {
  safeLocalStorageSet(PANEL_HIDDEN_STORAGE_KEY, hidden ? 'true' : 'false');
  applyPanelLayout(getStoredPanelWidth(), hidden);
  scheduleEditorLayoutRefresh();
}

function applyPanelLayout(width: number, hidden: boolean): void {
  const root = document.getElementById(ROOT_ID);
  const nextWidth = clampPanelWidth(width);
  document.documentElement.style.setProperty('--typorai-typora-panel-width', `${nextWidth}px`);
  document.body?.classList.toggle('typorai-typora-panel-hidden', hidden);
  root?.classList.toggle('typorai-typora-panel-hidden', hidden);
}

function getStoredPanelWidth(): number {
  const raw = safeLocalStorageGet(PANEL_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PANEL_WIDTH;
  return clampPanelWidth(Number.isFinite(parsed) ? parsed : DEFAULT_PANEL_WIDTH);
}

function getStoredPanelHidden(): boolean {
  return safeLocalStorageGet(PANEL_HIDDEN_STORAGE_KEY) === 'true';
}

function clampPanelWidth(width: number): number {
  const viewportWidth = window.innerWidth || 1280;
  const dynamicMax = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewportWidth - 520));
  return Math.min(dynamicMax, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Typora may disable storage in some embedded contexts.
  }
}

function scheduleEditorLayoutRefresh(): void {
  clearEditorLayoutTimers();
  for (const delay of [0, 100, 350, 800]) {
    editorLayoutTimers.push(window.setTimeout(refreshTyporaEditorLayout, delay));
  }
}

function clearEditorLayoutTimers(): void {
  while (editorLayoutTimers.length > 0) {
    const timer = editorLayoutTimers.pop();
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}

function refreshTyporaEditorLayout(): void {
  repairMisnestedTyporaEditor();
  const writeEl = getTyporaWriteElement();
  for (const cm of writeEl?.querySelectorAll<HTMLElement>('.md-fences .CodeMirror, .CodeMirror') ?? []) {
    (cm as HTMLElement & { CodeMirror?: { refresh?: () => void } }).CodeMirror?.refresh?.();
  }
}

function repairMisnestedTyporaEditor(): boolean {
  const contentEl = document.querySelector<HTMLElement>('content');
  const modalEl = document.getElementById('image-create-folder-confirm');
  if (!contentEl || !modalEl || !contentEl.contains(modalEl)) return false;

  const misnestedWriteElements = Array.from(
    modalEl.querySelectorAll<HTMLElement>('#write'),
  );
  if (misnestedWriteElements.length === 0) return false;

  for (const writeEl of misnestedWriteElements) {
    contentEl.appendChild(writeEl);
  }
  return true;
}

function observeTyporaEditorLayout(): void {
  editorLayoutObserver?.disconnect();
  const contentEl = document.querySelector<HTMLElement>('content');
  if (!contentEl || typeof MutationObserver === 'undefined') return;

  editorLayoutObserver = new MutationObserver((mutations) => {
    const documentLayoutChanged = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches('#write, .md-fences, .CodeMirror')
        || Boolean(node.querySelector('#write, .md-fences, .CodeMirror'));
    }));
    if (documentLayoutChanged) scheduleEditorLayoutRefresh();
  });
  editorLayoutObserver.observe(contentEl, { childList: true, subtree: true });
}

function getTyporaWriteElement(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('#write'));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple #write nodes can exist transiently (duplicate IDs, stale panes,
  // Typora internals). Re-resolving this on every poll tick without regard
  // for an in-progress selection can flip which node is returned between
  // ticks, which makes an active mouse-drag selection appear to "vanish"
  // (containerEl.contains(anchorNode) starts failing mid-drag). Prefer
  // whichever #write currently holds the live selection so the container
  // stays stable for as long as the user is actively selecting inside it.
  const activeSelection = window.getSelection?.();
  if (activeSelection && !activeSelection.isCollapsed) {
    const anchorNode = activeSelection.anchorNode;
    const focusNode = activeSelection.focusNode;
    const owner = candidates.find(
      candidate => (anchorNode && candidate.contains(anchorNode))
        || (focusNode && candidate.contains(focusNode))
    );
    if (owner) return owner;
  }

  const visible = candidates.find(candidate => !hasHiddenAncestor(candidate));
  if (visible) {
    return visible;
  }

  return candidates
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? null;
}

function hasHiddenAncestor(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function scopeBundledStyles(css: string): string {
  return css
    .replace(/\bbody\.theme-light\s+/g, `#${ROOT_ID}.theme-light `)
    .replace(/\bbody\.theme-dark\s+/g, `#${ROOT_ID}.theme-dark `);
}

/**
 * Compute relative luminance (0..1) of an `rgb()` / `rgba()` color string.
 * Returns 1 (light) for transparent / unparseable values so that the caller
 * falls back to the light theme.
 */
function computeLuminance(rgb: string): number {
  const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return 1;
  const channels = [+m[1], +m[2], +m[3]].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function parseAlpha(rgb: string): number {
  const m = rgb.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)\s*$/i);
  if (!m) return 1;
  const a = parseFloat(m[1]);
  return Number.isFinite(a) ? a : 1;
}

/**
 * Walk up from `start` until we find an element whose computed background
 * is not fully transparent. Returns `null` if every ancestor is transparent.
 */
function findOpaqueBackground(
  start: Element,
): { backgroundColor: string; textColor: string } | null {
  let el: Element | null = start;
  while (el && el instanceof HTMLElement) {
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    if (bg && parseAlpha(bg) > 0) {
      return { backgroundColor: bg, textColor: style.color };
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Read the actual rendered colors from the current Typora theme and push
 * them onto `<html>` (`:root`) as CSS variables so that EVERY element in
 * the document — chat panel, settings modal, selection card, future
 * additions — sees the same theme tokens.
 *
 * Setting on `:root` is the architecturally correct scope: chat panel
 * (`#typorai-typora-root`) and the settings overlay
 * (`.typorai-typora-settings-overlay`) are siblings under `<body>`, so
 * variables on one do not reach the other. The only ancestor they share
 * is `:root`.
 *
 * Idempotent and safe to call multiple times.
 */
export function detectAndApplyTyporaTheme(): void {
  const probe =
    getTyporaWriteElement() ??
    document.querySelector('content') ??
    document.body;

  const detected = findOpaqueBackground(probe);
  const bg = detected?.backgroundColor ?? 'rgb(250, 250, 250)';
  const fg = detected?.textColor ?? 'rgb(36, 36, 36)';
  const isDark = computeLuminance(bg) < 0.5;

  // 1) Push theme marker only to TyporAi surfaces. Do not mark Typora's
  //    body; Typora themes may use body.theme-* selectors for the editor.
  const surfaces = [
    document.getElementById(ROOT_ID),
    ...document.querySelectorAll<HTMLElement>('.typorai-typora-settings-overlay'),
  ].filter((el): el is HTMLElement => Boolean(el));
  for (const surface of surfaces) {
    surface.classList.toggle('theme-dark', isDark);
    surface.classList.toggle('theme-light', !isDark);
  }
  document.documentElement.dataset.typoraiTheme = isDark ? 'dark' : 'light';

  // 2) Inject actual rendered colors as CSS variables on `:root` so both
  //    the chat panel and the settings modal cascade see them.
  const target = document.documentElement;
  target.style.setProperty('--typorai-bg-primary', bg);
  target.style.setProperty('--typorai-bg-secondary', adjustAlpha(bg, isDark ? 0.16 : 0.92));
  target.style.setProperty('--typorai-fg-primary', fg);
  target.style.setProperty('--typorai-fg-muted', mixColors(fg, bg, 0.45));
  target.style.setProperty('--typorai-fg-faint', mixColors(fg, bg, 0.65));
  target.style.setProperty('--typorai-border', mixColors(fg, bg, 0.78));
  target.style.setProperty('--typorai-border-strong', mixColors(fg, bg, 0.65));
  target.style.setProperty('--typorai-hover-bg', mixColors(fg, bg, isDark ? 0.12 : 0.9));
  target.style.setProperty('--typorai-code-bg', mixColors(bg, fg, isDark ? 0.08 : 0.06));
  target.style.setProperty('--typorai-accent', isDark ? '#d97757' : '#df6f4e');
  target.style.setProperty('--typorai-accent-hover', isDark ? '#e08566' : '#cf6040');
  target.style.setProperty('--typorai-shadow', isDark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(20, 28, 38, 0.08)');
}

function adjustAlpha(rgb: string, alpha: number): string {
  const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

/** Mix `a` and `b` by weight `t` (0..1, 0 = all a, 1 = all b). */
function mixColors(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(pa[0] * (1 - t) + pb[0] * t);
  const g = clamp(pa[1] * (1 - t) + pb[1] * t);
  const bl = clamp(pa[2] * (1 - t) + pb[2] * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseRgb(rgb: string): [number, number, number] | null {
  const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return null;
  return [+m[1], +m[2], +m[3]];
}

/**
 * Install a debounced MutationObserver on `<html>` and `<body>` so the
 * plugin re-detects whenever Typora swaps themes. Also listens to OS-level
 * `prefers-color-scheme` as a tertiary fallback.
 *
 * The returned handle should be passed to `disposeThemeWatcher` on unmount
 * to release the MutationObserver and the matchMedia change listener.
 */
export type ThemeWatcherHandle = ThemeWatchHandle;

export function installThemeWatcher(): ThemeWatcherHandle | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return watchTheme(document.documentElement, { apply: detectAndApplyTyporaTheme }, { frames: 2 });
}

/**
 * Disposes a `ThemeWatcherHandle` returned from `installThemeWatcher`. Safe
 * to call multiple times and with `null`.
 */
export function disposeThemeWatcher(handle: ThemeWatcherHandle | null): void {
  if (!handle) return;
  try {
    handle.dispose();
  } catch {
    // already disposed or observer detached
  }
}

function installSettingsEntry(app: TyporaHostApp, plugin: TyporAiPlugin, root: HTMLElement): void {
  const header = root.querySelector<HTMLElement>('.typorai-header');
  if (!header || header.querySelector('.typorai-typora-settings-button')) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'typorai-typora-settings-button';
  button.setAttribute('aria-label', t('typora.settings.openAria'));
  setTyporAiTooltip(button, t('typora.settings.title'));
  setIcon(button, 'settings');
  button.addEventListener('click', () => {
    openTyporaSettings(app, plugin);
  });
  header.appendChild(button);
}

export function openTyporaSettings(app: TyporaHostApp, plugin: TyporAiPlugin): void {
  activeSettingsModal?.close();
  const controller = new ModalController();
  activeSettingsModal = controller;
  const content = document.createDocumentFragment();
  const header = document.createElement('div');
  header.className = 'typorai-typora-settings-modal-header';
  const tabBarContainer = document.createElement('div');
  tabBarContainer.className = 'typorai-typora-settings-tabs-host';
  header.append(tabBarContainer);

  const closeButton = document.createElement('button');
  closeButton.className = 'typorai-typora-settings-close';
  closeButton.setAttribute('aria-label', t('common.close'));
  closeButton.type = 'button';
  setIcon(closeButton, 'x');
  header.append(closeButton);

  const settingsContent = document.createElement('div');
  settingsContent.className = 'typorai-typora-settings-content';
  const settingsTab = new TyporAiSettingTab(app, plugin);
  settingsTab.containerEl = settingsContent;
  settingsTab.setTabBarContainer(tabBarContainer);
  settingsTab.display();
  content.append(header, settingsContent);

  closeButton.addEventListener('click', () => controller.close());
  controller.open(content, t('typora.settings.title'), {
    dialogClass: 'typorai-typora-settings-modal',
    id: SETTINGS_MODAL_ID,
    overlayClass: 'typorai-typora-settings-overlay',
    onClose: () => {
      settingsTab.hide();
      if (activeSettingsModal === controller) activeSettingsModal = null;
    },
  });
}

function readBundledStyles(): string {
  const cssPath = path.join(getRuntimeDirectory(), 'styles.css');
  try {
    return fs.readFileSync(cssPath, 'utf8');
  } catch {
    return '';
  }
}

/** Shared Typora host overrides used by both the native and Sidecar renderers. */
export function getTyporaOverrideStyles(): string {
  return `
    :root {
      /* Light-mode defaults — JS overwrites these at runtime based on the
         active Typora theme. The fallbacks are used only when detection
         fails (e.g. fully transparent theme). */
      --typorai-bg-primary: #fafafa;
      --typorai-bg-secondary: #f4f4f4;
      --typorai-fg-primary: #242424;
      --typorai-fg-muted: #666666;
      --typorai-fg-faint: #9a9a9a;
      --typorai-border: rgba(127, 127, 127, 0.18);
      --typorai-border-strong: rgba(127, 127, 127, 0.28);
      --typorai-hover-bg: #f1f1f1;
      --typorai-code-bg: #f2f2f2;
      --typorai-accent: #df6f4e;
      --typorai-accent-hover: #cf6040;
      --typorai-shadow: rgba(20, 28, 38, 0.08);
      --typorai-typora-panel-width: ${DEFAULT_PANEL_WIDTH}px;
    }

    #${ROOT_ID},
    .typorai-typora-settings-overlay {

      /* Typora-style tokens — the chat UI reads these names. They are
         aliased to our typorai-* variables so a single source of truth
         drives both surfaces. */
      --background-primary: var(--typorai-bg-primary);
      --background-primary-alt: var(--typorai-bg-primary);
      --background-secondary: var(--typorai-bg-secondary);
      --background-modifier-border: var(--typorai-border-strong);
      --background-modifier-hover: var(--typorai-hover-bg);
      --background-modifier-form-field: var(--typorai-bg-primary);
      --background-secondary-alt: var(--typorai-bg-secondary);
      --background-tertiary: var(--typorai-bg-secondary);
      --text-normal: var(--typorai-fg-primary);
      --text-muted: var(--typorai-fg-muted);
      --text-faint: var(--typorai-fg-faint);
      --text-accent: var(--typorai-accent);
      --interactive-normal: var(--typorai-bg-primary);
      --interactive-hover: var(--typorai-hover-bg);
      --interactive-accent: var(--typorai-accent);
      --interactive-accent-hover: var(--typorai-accent-hover);
      --code-background: var(--typorai-code-bg);
    }

    /* Pre-JS dark-mode fallback so users with dark Typora themes don't see
       a brief light flash while the panel is mounting. JS will overwrite
       these on completion. */
    :root[data-typora-theme^="night"],
    :root[data-typora-theme^="dark"],
    :root[data-typora-theme^="dracula"],
    :root[data-typora-theme^="black"],
    :root[data-typora-theme^="solarized"] {
      --typorai-bg-primary: #1d1d1d;
      --typorai-bg-secondary: #252525;
      --typorai-fg-primary: #e6e6e6;
      --typorai-fg-muted: #9a9a9a;
      --typorai-fg-faint: #6e6e6e;
      --typorai-border: rgba(255, 255, 255, 0.10);
      --typorai-border-strong: rgba(255, 255, 255, 0.18);
      --typorai-hover-bg: rgba(255, 255, 255, 0.08);
      --typorai-code-bg: #1a1a1a;
      --typorai-accent: #d97757;
      --typorai-accent-hover: #e08566;
      --typorai-shadow: rgba(0, 0, 0, 0.32);
    }

    #${ROOT_ID} {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      width: var(--typorai-typora-panel-width);
      min-width: ${MIN_PANEL_WIDTH}px;
      max-width: ${MAX_PANEL_WIDTH}px;
      background: var(--typorai-bg-primary);
      border-left: 1px solid var(--typorai-border);
      box-shadow: none;
      color: var(--typorai-fg-primary);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: transform 0.16s ease;
    }
    /* Typora positions its document surface with left/right anchors. Reserve
       the same width as the fixed assistant panel so neither surface covers
       the other; the exact #write repair above handles Typora's malformed DOM
       edge case independently of this layout rule. */
    body > content {
      right: var(--typorai-typora-panel-width) !important;
      transition: right 0.16s ease;
    }
    body.typorai-typora-panel-hidden > content {
      right: 0 !important;
    }
    #${ROOT_ID}.typorai-typora-panel-hidden {
      transform: translateX(100%);
      pointer-events: none;
    }
    .typorai-typora-panel-toggle {
      position: fixed;
      top: 72px;
      right: 0;
      z-index: 9998;
      display: none;
      min-width: 82px;
      height: 30px;
      padding: 0 12px;
      border: 1px solid var(--typorai-border);
      border-right: 0;
      border-radius: 7px 0 0 7px;
      background: var(--typorai-bg-primary);
      color: var(--typorai-fg-primary);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(15, 18, 22, 0.1);
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      white-space: nowrap;
      writing-mode: horizontal-tb;
    }
    body.typorai-typora-panel-hidden .typorai-typora-panel-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .typorai-typora-resizer {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 1;
      width: 5px;
      cursor: col-resize;
      touch-action: none;
    }
    .typorai-typora-resizer::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: transparent;
    }
    .typorai-typora-resizer:hover::after,
    body.typorai-typora-resizing .typorai-typora-resizer::after {
      background: var(--typorai-accent);
    }
    body.typorai-typora-resizing {
      cursor: col-resize;
      user-select: none;
    }
    #${ROOT_ID} .workspace-leaf-content,
    #${ROOT_ID} .view-content,
    #${ROOT_ID} .typorai-container {
      height: 100%;
      min-height: 0;
    }
    #${ROOT_ID} .typorai-container {
      padding: 6px 6px 12px 8px;
      box-sizing: border-box;
      background: var(--typorai-bg-primary);
    }
    #${ROOT_ID} .typorai-title-text {
      font-size: 14px;
      line-height: 1.15;
    }
    #${ROOT_ID} .typorai-header {
      align-items: center;
      display: flex;
      gap: 4px;
      min-height: 18px;
      padding: 0 0 3px;
    }
    #${ROOT_ID} .typorai-title {
      flex: 0 0 auto;
      gap: 4px;
      min-width: 0;
    }
    #${ROOT_ID} .typorai-logo svg {
      height: 14px;
      width: 14px;
    }
    #${ROOT_ID} .typorai-header-actions {
      gap: 3px;
    }
    #${ROOT_ID} .typorai-header-action-btn {
      position: relative;
    }
    #${ROOT_ID} .typorai-typora-settings-button,
    #${ROOT_ID} .typorai-typora-hide-button,
    .typorai-typora-settings-close {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      height: 24px;
      justify-content: center;
      padding: 0;
      width: 24px;
    }
    #${ROOT_ID} .typorai-typora-settings-button svg,
    #${ROOT_ID} .typorai-typora-hide-button svg,
    .typorai-typora-settings-close svg {
      height: 14px;
      width: 14px;
    }
    #${ROOT_ID} .typorai-typora-settings-button[data-icon]:not(.typorai-icon-rendered)::before,
    #${ROOT_ID} .typorai-typora-hide-button[data-icon]:not(.typorai-icon-rendered)::before,
    .typorai-typora-settings-close[data-icon]:not(.typorai-icon-rendered)::before {
      display: block;
      font-size: 15px;
      line-height: 1;
    }
    #${ROOT_ID} .typorai-typora-settings-button[data-icon="settings"]:not(.typorai-icon-rendered)::before {
      content: "⚙";
    }
    #${ROOT_ID} .typorai-typora-hide-button[data-icon="panel-right-close"]:not(.typorai-icon-rendered)::before {
      content: "‹";
      font-size: 18px;
      transform: translateY(-1px);
    }
    .typorai-typora-settings-close[data-icon="x"]:not(.typorai-icon-rendered)::before {
      content: "×";
      font-size: 18px;
    }
    #${ROOT_ID} .typorai-typora-settings-button:hover,
    #${ROOT_ID} .typorai-typora-hide-button:hover,
    .typorai-typora-settings-close:hover {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
    }
    #${ROOT_ID} .typorai-input-footer {
      padding-bottom: 0;
    }
    #${ROOT_ID} .typorai-typora-hide-button[data-icon="panel-right-close"]:not(.typorai-icon-rendered)::before {
      content: ">";
    }
    #${ROOT_ID} button {
      font-family: inherit;
    }
    .typorai-typora-settings-overlay {
      align-items: stretch;
      background: rgba(15, 18, 22, 0.38);
      bottom: 0;
      display: flex;
      justify-content: flex-end;
      left: 0;
      position: fixed;
      right: 0;
      top: 0;
      z-index: 10000;
    }
    .typorai-typora-settings-modal {
      background: var(--background-primary);
      box-shadow: -14px 0 30px rgba(10, 14, 20, 0.18);
      color: var(--text-normal);
      display: flex;
      flex-direction: column;
      max-width: min(760px, 92vw);
      min-width: min(560px, 92vw);
      width: 52vw;
    }
    .typorai-typora-settings-modal-header {
      align-items: center;
      border-bottom: 1px solid var(--background-modifier-border);
      display: flex;
      gap: 10px;
      justify-content: space-between;
      min-height: 46px;
      padding: 8px 14px 8px 18px;
    }
    .typorai-typora-settings-tabs-host {
      flex: 1 1 auto;
      min-width: 0;
    }
    .typorai-typora-settings-content {
      min-height: 0;
      overflow: auto;
      padding: 14px 20px 24px;
    }
    .typorai-typora-settings-tabs-host .typorai-settings-tabs {
      background: transparent;
      border-bottom: 0;
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      margin: 0;
      overflow-x: auto;
      padding: 0;
      position: static;
      scrollbar-width: thin;
    }
    .typorai-typora-settings-tabs-host .typorai-settings-tab {
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: var(--text-muted);
      cursor: pointer;
      flex: 0 0 auto;
      font-size: 14px;
      line-height: 1.2;
      margin: 0;
      padding: 7px 11px;
    }
    .typorai-typora-settings-tabs-host .typorai-settings-tab:hover {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
    }
    .typorai-typora-settings-tabs-host .typorai-settings-tab--active {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
      font-weight: 600;
    }
    .typorai-typora-settings-content .typorai-settings-tab-content {
      display: none;
    }
    .typorai-typora-settings-content .typorai-settings-tab-content--active {
      display: block;
    }
    .typorai-typora-settings-content .setting-item {
      align-items: flex-start;
      border-top: 1px solid rgba(127, 127, 127, 0.14);
      display: flex;
      gap: 18px;
      justify-content: space-between;
      padding: 14px 0;
    }
    .typorai-typora-settings-content .setting-item-heading {
      border-top: 0;
      padding-bottom: 6px;
    }
    .typorai-typora-settings-content .setting-item-heading .setting-item-name {
      font-size: 13px;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .typorai-typora-settings-content .setting-item-info {
      flex: 1 1 auto;
      min-width: 0;
    }
    .typorai-typora-settings-content .setting-item-name {
      font-weight: 600;
      line-height: 1.35;
    }
    .typorai-typora-settings-content .setting-item-description {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.45;
      margin-top: 4px;
    }
    .typorai-typora-settings-content .setting-item-control {
      align-items: center;
      display: flex;
      flex: 0 0 min(280px, 46%);
      gap: 8px;
      justify-content: flex-end;
    }
    .typorai-typora-settings-content input,
    .typorai-typora-settings-content select,
    .typorai-typora-settings-content textarea {
      background: var(--interactive-normal);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      box-sizing: border-box;
      color: var(--text-normal);
      font: inherit;
      max-width: 100%;
      min-height: 30px;
      padding: 5px 8px;
      width: 100%;
    }
    .typorai-typora-settings-content input[type="checkbox"] {
      min-height: 0;
      width: auto;
    }
    .typorai-typora-settings-content textarea {
      min-height: 72px;
      resize: vertical;
    }
    .typorai-typora-settings-content .checkbox-container {
      justify-content: flex-end;
      width: auto;
    }
    .typorai-typora-settings-content .typorai-hidden {
      display: none !important;
    }
    .typorai-typora-settings-content .typorai-input-error {
      border-color: #c74343;
    }
    .typorai-typora-settings-content .typorai-setting-validation {
      color: #c74343;
      font-size: 12px;
      margin: -8px 0 8px;
    }
    @media (max-width: 720px) {
      .typorai-typora-settings-modal {
        max-width: 100vw;
        min-width: 0;
        width: 100vw;
      }
      .typorai-typora-settings-content .setting-item {
        display: block;
      }
      .typorai-typora-settings-content .setting-item-control {
        justify-content: flex-start;
        margin-top: 10px;
      }
    }
  `;
}

function getRuntimeDirectory(): string {
  const runtimeScript = document.getElementById('typorai-typora-runtime') as HTMLScriptElement | null;
  const src = runtimeScript?.src;
  if (src?.startsWith('file:')) {
    const pathname = decodeURIComponent(new URL(src).pathname);
    const winPath = pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep);
    return path.dirname(winPath);
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'abnerworks.Typora', 'plugins', 'typorai');
  }
  if (process.platform === 'linux') {
    return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Typora', 'plugins', 'typorai');
  }
  return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Typora', 'plugins', 'typorai');
}

function getWorkspaceBasePath(): string {
  const fallback = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  try {
    const currentFile = new TyporaEditorApi().getCurrentFilePath();
    if (currentFile) return path.dirname(currentFile);
  } catch {
    // Fall through to user profile.
  }
  return fallback;
}

function getTyporaEditorContainer(): HTMLElement {
  return getTyporaWriteElement()
    ?? document.querySelector<HTMLElement>('content')
    ?? document.body;
}

function toWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function fileFromAbsolutePath(absolutePath: string, basePath: string): TyporaFile {
  const file = new TyporaFile();
  const rel = toWorkspacePath(path.relative(basePath, absolutePath));
  const parsed = path.parse(absolutePath);
  file.path = rel;
  file.name = parsed.base;
  file.basename = parsed.name;
  file.extension = parsed.ext.replace(/^\./, '');
  try {
    const stats = fs.statSync(absolutePath);
    file.stat = {
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
    };
  } catch {
    // Keep shim defaults.
  }
  return file;
}

function folderFromAbsolutePath(absolutePath: string, basePath: string): TyporaFolder {
  const folder = new TyporaFolder();
  folder.path = toWorkspacePath(path.relative(basePath, absolutePath));
  folder.name = path.basename(absolutePath);
  return folder;
}

function scanWorkspaceFiles(basePath: string): TyporaFile[] {
  return scanWorkspaceEntries(basePath).filter((entry): entry is TyporaFile => entry instanceof TyporaFile);
}

function scanWorkspaceEntries(basePath: string): Array<TyporaFile | TyporaFolder> {
  const entries: Array<TyporaFile | TyporaFolder> = [];
  const ignored = new Set(['.git', '.typorai', 'node_modules']);
  const walk = (dir: string, depth: number): void => {
    if (depth > 8 || entries.length > 5000) return;
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (ignored.has(child.name)) continue;
      const absolute = path.join(dir, child.name);
      if (child.isDirectory()) {
        entries.push(folderFromAbsolutePath(absolute, basePath));
        walk(absolute, depth + 1);
      } else if (child.isFile()) {
        entries.push(fileFromAbsolutePath(absolute, basePath));
      }
    }
  };
  walk(basePath, 0);
  return entries;
}

function pathToFileUrl(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '$1')}`;
}
