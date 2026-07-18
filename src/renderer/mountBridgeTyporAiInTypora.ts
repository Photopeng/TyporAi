import { ApplicationActivityScheduler } from '@/application/activity/ApplicationActivityScheduler';
import { type ApplicationRuntime,createApplicationRuntime } from '@/application/createApplicationRuntime';
import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import { BridgeFileStore } from '@/bridge/host/BridgeFileStore';
import { BridgeSettingsStore } from '@/bridge/host/BridgeSettingsStore';
import { BridgeWatchService } from '@/bridge/host/BridgeWatchService';
import type {
  EnvironmentService,
  FileStore,
  HostServices,
  PathService,
  ProcessTransportFactory,
} from '@/core/ports';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { VIEW_TYPE_TYPORAI } from '@/core/types';
import { TyporAiView } from '@/features/chat/TyporAiView';
import { TyporAiSettingTab } from '@/features/settings/TyporAiSettings';
import { t } from '@/i18n/i18n';
import TyporAiPlugin from '@/main';
import type { SidecarBootstrap } from '@/sidecar/protocol';
import { installTyporaDomHelpers } from '@/typora/dom-helpers';
import { TyporaEditorApi } from '@/typora/editor-api';
import {
  TyporaDocumentView,
  type TyporaEventRef,
  TyporaFile,
  TyporaFolder,
  type TyporaHostApp,
  type TyporaMetadataIndex,
  type TyporaWorkspace,
  type TyporaWorkspaceApi,
  type WorkspaceFileAdapter,
} from '@/typora/platform';
import {
  detectAndApplyTyporaTheme,
  disposeThemeWatcher,
  getTyporaOverrideStyles,
  installThemeWatcher,
} from '@/typora/typora-host';
import { TyporaDocumentService } from '@/typora/TyporaDocumentService';
import { setIcon } from '@/ui/Icon';
import { ModalController } from '@/ui/ModalController';
import { setTyporAiTooltip } from '@/ui/Tooltip';

import { BridgeProviderServiceFactory } from './BridgeProviderServiceFactory';
import { FullBridgeChatRuntime } from './FullBridgeChatRuntime';
import { registerRendererProviders } from './registerRendererProviders';
import { registerRendererWorkspaceServices } from './registerRendererWorkspaceServices';

const ROOT_ID = 'typorai-typora-root';
const CONTENT_ID = 'typorai-typora-content';
const HOST_STYLE_ID = 'typorai-bridge-host-styles';
const PANEL_WIDTH_KEY = 'typorai.typora.panelWidth';
const PANEL_HIDDEN_KEY = 'typorai.typora.panelHidden';
const DEFAULT_PANEL_WIDTH = 430;

type Listener = (...args: unknown[]) => void;

export interface BridgeTyporAiRuntime {
  readonly applicationRuntime: ApplicationRuntime;
  readonly editor: TyporaEditorApi;
  readonly plugin: TyporAiPlugin;
  readonly view: TyporAiView;
  dispose(): Promise<void>;
}

/** Mounts the exact same TyporAiView used by the Windows Electron host. */
export async function mountBridgeTyporAiInTypora(
  rpc: WebSocketRpcClient,
  bootstrap: SidecarBootstrap,
  platform: 'macos' | 'windows',
): Promise<BridgeTyporAiRuntime> {
  (globalThis as { __TYPORAI_HOME_DIRECTORY__?: string }).__TYPORAI_HOME_DIRECTORY__ = bootstrap.homeDirectory;
  installTyporaDomHelpers();
  registerRendererProviders();
  installHostStyles();

  const editor = new TyporaEditorApi();
  const rootPath = await resolveWorkspaceRoot(rpc, bootstrap, editor);
  const files = new BridgeFileStore(rpc);
  const fileAdapter = new RendererWorkspaceFileAdapter(files, rootPath);
  const vault = new RendererWorkspace(fileAdapter);
  await vault.refresh();
  const workspace = new RendererWorkspaceService(editor, rootPath);
  const app: TyporaHostApp = {
    metadataCache: new RendererMetadataCache(vault),
    vault,
    workspace,
  };
  const leaf = workspace.getLeaf();
  leaf.app = app;

  const settings = new BridgeSettingsStore(rpc);
  const plugin = new TyporAiPlugin(app, {
    id: 'typorai-typora',
    name: 'TyporAi',
    version: '2.x',
  });
  plugin.loadData = async () => await settings.get('pluginData') ?? {};
  plugin.saveData = async data => { await settings.set('pluginData', data ?? {}); };
  await plugin.onload();
  await registerRendererWorkspaceServices(rpc, plugin);

  const originalSaveSettings = plugin.saveSettings.bind(plugin);
  plugin.saveSettings = async () => {
    await originalSaveSettings();
    await syncSidecarSettings(rpc, plugin.settings as unknown as Record<string, unknown>);
  };
  await syncSidecarSettings(rpc, plugin.settings as unknown as Record<string, unknown>);

  const applicationRuntime = createRendererApplicationRuntime(
    rpc,
    bootstrap,
    editor,
    files,
    platform,
  );
  ProviderWorkspaceRegistry.configureHostServices(applicationRuntime.host);

  const root = ensureRoot();
  root.replaceChildren();
  root.dataset.typoraiRuntime = 'sidecar-shared-ui';
  root.dataset.typoraiSidecar = 'connected';
  const container = root.createDiv({ cls: 'workspace-leaf-content typorai-typora-leaf' });
  const content = container.createDiv({ cls: 'view-content' });
  content.id = CONTENT_ID;

  const view = new TyporAiView(leaf, plugin);
  view.app = app;
  view.containerEl = container;
  view.contentEl = content;
  view.setRuntimeFactory(options => new FullBridgeChatRuntime(rpc, options.providerId ?? 'typora', plugin));
  view.setProviderServiceFactory(new BridgeProviderServiceFactory(rpc));
  view.setProcessTransport(applicationRuntime.host.processes);
  view.setPlatform(platform);
  view.setFileWatchService(applicationRuntime.host.watches);
  leaf.view = view;

  await view.onOpen();
  installSettingsEntry(app, plugin, root);
  installPanelControls(root);
  detectAndApplyTyporaTheme();
  const themeWatcher = installThemeWatcher();

  return {
    applicationRuntime,
    editor,
    plugin,
    view,
    async dispose(): Promise<void> {
      await view.onClose();
      disposeThemeWatcher(themeWatcher);
      leaf.view = null;
      plugin.onunload();
      await applicationRuntime.dispose();
      root.remove();
      document.querySelector('.typorai-typora-panel-toggle')?.remove();
      document.getElementById(HOST_STYLE_ID)?.remove();
      document.body.classList.remove('typorai-typora-panel-hidden');
    },
  };
}

async function resolveWorkspaceRoot(
  rpc: WebSocketRpcClient,
  bootstrap: SidecarBootstrap,
  editor: TyporaEditorApi,
): Promise<string> {
  const current = await rpc.request<{ root: string | null }>('workspace.getCurrent');
  if (current.root) return current.root;
  let candidate = editor.getWorkspacePath();
  if (!candidate) {
    candidate = window.prompt(
      'Grant TyporAi access to a workspace folder:',
      bootstrap.homeDirectory ?? '',
    )?.trim() ?? '';
  }
  if (!candidate) throw new Error('Open a saved document before starting TyporAi.');
  const granted = await rpc.request<{ root: string }>('workspace.grant', { root: candidate });
  return granted.root;
}

function createRendererApplicationRuntime(
  rpc: WebSocketRpcClient,
  bootstrap: SidecarBootstrap,
  editor: TyporaEditorApi,
  files: FileStore,
  platform: 'macos' | 'windows',
): ApplicationRuntime {
  const scheduler = new ApplicationActivityScheduler();
  const watches = new BridgeWatchService(rpc);
  const environment: EnvironmentService = {
    findExecutable: async name => {
      try {
        const result = await rpc.request<{ path?: string | null }>('provider.probeCli', { providerId: name });
        return typeof result.path === 'string' ? result.path : null;
      } catch { return null; }
    },
    get: () => null,
    homeDirectory: () => bootstrap.homeDirectory ?? null,
  };
  const host: HostServices = {
    documents: new TyporaDocumentService(editor, watches, scheduler),
    environment,
    files,
    notifications: { show: (message, level) => showNotice(message, level ?? 'info') },
    paths: portablePathService,
    platform: { appVersion: null, operatingSystem: platform, runtime: 'webkit' },
    processes: sidecarOwnedProcesses,
    scheduler,
    settings: new BridgeSettingsStore(rpc),
    watches,
    workspace: null,
  };
  return createApplicationRuntime(host);
}

const sidecarOwnedProcesses: ProcessTransportFactory = {
  async start(): Promise<never> {
    throw new Error('Provider processes are owned by TyporAi Sidecar.');
  },
};

class EventHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  on(name: string, callback: Listener): TyporaEventRef {
    const listeners = this.listeners.get(name) ?? new Set<Listener>();
    listeners.add(callback);
    this.listeners.set(name, listeners);
    return { callback, name };
  }
  offref(ref: TyporaEventRef): void {
    const value = ref as { callback?: Listener; name?: string } | null;
    if (value?.name && value.callback) this.listeners.get(value.name)?.delete(value.callback);
  }
  trigger(name: string, ...args: unknown[]): void { this.listeners.get(name)?.forEach(listener => listener(...args)); }
}

class RendererWorkspaceFileAdapter implements WorkspaceFileAdapter {
  readonly basePath: string;
  constructor(private readonly files: FileStore, root: string) { this.basePath = normalize(root); }
  exists(relativePath: string): Promise<boolean> { return this.files.exists(this.resolve(relativePath)); }
  read(relativePath: string): Promise<string> { return this.files.readText(this.resolve(relativePath)); }
  write(relativePath: string, content: string): Promise<void> { return this.files.writeAtomic(this.resolve(relativePath), content); }
  remove(relativePath: string): Promise<void> { return this.files.remove(this.resolve(relativePath)); }
  rmdir(relativePath: string, _recursive: boolean): Promise<void> { return this.files.remove(this.resolve(relativePath)); }
  mkdir(relativePath: string): Promise<void> { return this.files.ensureDirectory(this.resolve(relativePath)); }
  rename(from: string, to: string): Promise<void> { return this.files.rename(this.resolve(from), this.resolve(to)); }
  async stat(relativePath: string): Promise<{ mtime: number; size: number } | null> {
    try { const stat = await this.files.stat(this.resolve(relativePath)); return { mtime: stat.modifiedAtMs, size: stat.size }; }
    catch { return null; }
  }
  async list(relativePath: string): Promise<{ files: string[]; folders: string[] }> {
    const entries = await this.files.list(this.resolve(relativePath));
    const files: string[] = [];
    const folders: string[] = [];
    for (const entry of entries) {
      const relative = this.relative(entry.path);
      if (entry.kind === 'directory') folders.push(relative);
      if (entry.kind === 'file') files.push(relative);
    }
    return { files, folders };
  }
  resolve(relativePath: string): string {
    const clean = normalize(relativePath || '.');
    if (isAbsolute(clean)) return clean;
    return normalize(`${this.basePath}/${clean}`);
  }
  relative(absolutePath: string): string {
    const normalized = normalize(absolutePath);
    const prefix = `${this.basePath.replace(/\/$/, '')}/`;
    return normalized.toLowerCase().startsWith(prefix.toLowerCase()) ? normalized.slice(prefix.length) : normalized;
  }
}

class RendererWorkspace implements TyporaWorkspace {
  private readonly hub = new EventHub();
  private entries: Array<TyporaFile | TyporaFolder> = [];
  constructor(readonly adapter: RendererWorkspaceFileAdapter) {}
  on(name: string, callback: Listener): TyporaEventRef { return this.hub.on(name, callback); }
  offref(ref: TyporaEventRef): void { this.hub.offref(ref); }
  trigger(name: string, ...args: unknown[]): void { this.hub.trigger(name, ...args); }
  getFiles(): TyporaFile[] { return this.entries.filter((entry): entry is TyporaFile => entry instanceof TyporaFile); }
  getAllLoadedFiles(): Array<TyporaFile | TyporaFolder> { return [...this.entries]; }
  getAbstractFileByPath(path: string): TyporaFile | TyporaFolder | null { return this.entries.find(entry => entry.path === normalizeRelative(path)) ?? null; }
  getResourcePath(file: TyporaFile): string { return `file://${this.adapter.resolve(file.path)}`; }
  async refresh(): Promise<void> {
    const entries: Array<TyporaFile | TyporaFolder> = [];
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 12 || entries.length >= 10_000) return;
      const listing = await this.adapter.list(directory);
      for (const path of listing.files) entries.push(await createFile(this.adapter, path));
      for (const path of listing.folders) {
        if (/(^|\/)\.(?:git|cache|typora-ai-assistant)(\/|$)/.test(path)) continue;
        entries.push(createFolder(path));
        await visit(path, depth + 1);
      }
    };
    await visit('', 0);
    this.entries = entries;
  }
}

interface RendererLeaf {
  app: TyporaHostApp;
  view: TyporAiView | null;
  setViewState(state: { type: string; active?: boolean }): Promise<void>;
}

class RendererWorkspaceService implements TyporaWorkspaceApi {
  private readonly documentView: RendererDocumentView;
  private readonly hub = new EventHub();
  private readonly leaf: RendererLeaf = { app: null as unknown as TyporaHostApp, view: null, setViewState: async () => {} };
  constructor(private readonly editor: TyporaEditorApi, private readonly root: string) {
    this.documentView = new RendererDocumentView(editor, () => this.getActiveFile());
  }
  on(name: string, callback: Listener): TyporaEventRef { return this.hub.on(name, callback); }
  getLeavesOfType(type: string): Array<{ view: unknown }> { return type === VIEW_TYPE_TYPORAI && this.leaf.view ? [{ view: this.leaf.view }] : []; }
  getActiveViewOfType<T>(type: { new (...args: never[]): T }): T | null {
    if (type !== TyporaDocumentView) return null;
    this.documentView.refresh();
    return this.documentView as T;
  }
  getActiveDocumentView(): RendererDocumentView { this.documentView.refresh(); return this.documentView; }
  getLeaf(): RendererLeaf { return this.leaf; }
  getLeftLeaf(): RendererLeaf { return this.leaf; }
  getRightLeaf(): RendererLeaf { return this.leaf; }
  getMostRecentLeaf(): RendererLeaf { return this.leaf; }
  getActiveFile(): TyporaFile | null {
    const path = this.editor.getCurrentFilePath();
    return path ? fileFromPath(relativePath(this.root, path)) : null;
  }
  async openLinkText(linktext: string): Promise<void> { window.location.href = `file://${normalize(`${this.root}/${linktext}`)}`; }
}

class RendererDocumentView extends TyporaDocumentView {
  constructor(
    private readonly editorApi: TyporaEditorApi,
    private readonly activeFile: () => TyporaFile | null,
  ) {
    super();
    this.editor = {
      getSelection: () => this.editorApi.getSelection(),
      replaceSelection: (text: string) => this.editorApi.replaceSelection(text),
    };
    this.refresh();
  }

  getMode(): string { return 'preview'; }

  refresh(): void {
    this.file = this.activeFile() ?? undefined;
    this.containerEl = getActiveTyporaWriteElement();
  }
}

function getActiveTyporaWriteElement(): HTMLElement {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('#write'));
  const selection = document.getSelection?.();
  if (selection && !selection.isCollapsed) {
    const owner = candidates.find(candidate =>
      Boolean(selection.anchorNode && candidate.contains(selection.anchorNode))
      || Boolean(selection.focusNode && candidate.contains(selection.focusNode))
    );
    if (owner) return owner;
  }
  return candidates.find(candidate => {
    const style = getComputedStyle(candidate);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }) ?? candidates[0] ?? document.querySelector<HTMLElement>('content') ?? document.body;
}

class RendererMetadataCache implements TyporaMetadataIndex {
  private readonly hub = new EventHub();
  constructor(private readonly vault: RendererWorkspace) {}
  on(name: string, callback: Listener): TyporaEventRef { return this.hub.on(name, callback); }
  getFileCache(): null { return null; }
  getFirstLinkpathDest(linkpath: string): TyporaFile | null {
    for (const candidate of [linkpath, linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`]) {
      const entry = this.vault.getAbstractFileByPath(candidate);
      if (entry instanceof TyporaFile) return entry;
    }
    return null;
  }
}

function ensureRoot(): HTMLElement {
  const root = document.getElementById(ROOT_ID) ?? document.body.appendChild(document.createElement('section'));
  root.removeAttribute('style');
  root.id = ROOT_ID;
  root.setAttribute('aria-label', 'TyporAi');
  return root;
}

function installSettingsEntry(app: TyporaHostApp, plugin: TyporAiPlugin, root: HTMLElement): void {
  const header = root.querySelector<HTMLElement>('.typorai-header');
  if (!header || header.querySelector('.typorai-typora-settings-button')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'typorai-typora-settings-button';
  button.setAttribute('aria-label', t('typora.settings.openAria'));
  setTyporAiTooltip(button, t('typora.settings.title'));
  setIcon(button, 'settings');
  button.addEventListener('click', () => openSettings(app, plugin));
  header.append(button);
}

function openSettings(app: TyporaHostApp, plugin: TyporAiPlugin): void {
  const controller = new ModalController();
  const shell = document.createDocumentFragment();
  const header = document.createElement('div');
  header.className = 'typorai-typora-settings-modal-header';
  const tabs = document.createElement('div');
  tabs.className = 'typorai-typora-settings-tabs-host';
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'typorai-typora-settings-close'; setIcon(close, 'x');
  header.append(tabs, close);
  const content = document.createElement('div');
  content.className = 'typorai-typora-settings-content';
  const settingsTab = new TyporAiSettingTab(app, plugin);
  settingsTab.containerEl = content;
  settingsTab.setTabBarContainer(tabs);
  settingsTab.display();
  shell.append(header, content);
  close.addEventListener('click', () => controller.close());
  controller.open(shell, t('typora.settings.title'), {
    dialogClass: 'typorai-typora-settings-modal',
    overlayClass: 'typorai-typora-settings-overlay',
    onClose: () => settingsTab.hide(),
  });
}

function installPanelControls(root: HTMLElement): void {
  const width = readStoredPanelWidth();
  applyPanelLayout(width, localStorage.getItem(PANEL_HIDDEN_KEY) === 'true');
  const resizer = document.createElement('div');
  resizer.className = 'typorai-typora-resizer';
  resizer.setAttribute('role', 'separator');
  root.append(resizer);
  let resizing = false;
  let pointerId: number | null = null;
  let startX = 0;
  let startWidth = width;
  const widthFor = (event: PointerEvent): number => clampPanelWidth(startWidth + startX - event.clientX);
  const finishResize = (event: PointerEvent, persist: boolean): void => {
    if (!resizing || event.pointerId !== pointerId) return;
    const next = widthFor(event);
    if (persist) localStorage.setItem(PANEL_WIDTH_KEY, String(next));
    resizing = false;
    pointerId = null;
    document.body.classList.remove('typorai-typora-resizing');
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
  };
  resizer.addEventListener('pointermove', event => {
    if (!resizing || event.pointerId !== pointerId) return;
    applyPanelLayout(widthFor(event), false);
  });
  resizer.addEventListener('pointerup', event => finishResize(event, true));
  resizer.addEventListener('pointercancel', event => finishResize(event, false));
  resizer.addEventListener('pointerdown', event => {
    if (event.button !== 0 || resizing) return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = readStoredPanelWidth();
    pointerId = event.pointerId;
    resizing = true;
    document.body.classList.add('typorai-typora-resizing');
    resizer.setPointerCapture(event.pointerId);
  });
  const title = root.querySelector<HTMLElement>('.typorai-title');
  title?.classList.add('typorai-typora-title-hide-button');
  title?.addEventListener('click', () => setPanelHidden(true));
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'typorai-typora-panel-toggle'; toggle.textContent = 'TyporAi';
  toggle.addEventListener('click', () => setPanelHidden(false));
  document.body.append(toggle);
}

function setPanelHidden(hidden: boolean): void {
  localStorage.setItem(PANEL_HIDDEN_KEY, String(hidden));
  const width = readStoredPanelWidth();
  applyPanelLayout(width, hidden);
}

function applyPanelLayout(width: number, hidden: boolean): void {
  document.documentElement.style.setProperty('--typorai-typora-panel-width', `${width}px`);
  document.body.classList.toggle('typorai-typora-panel-hidden', hidden);
  document.getElementById(ROOT_ID)?.classList.toggle('typorai-typora-panel-hidden', hidden);
}

function clampPanelWidth(width: number): number { return Math.min(720, Math.max(320, Math.round(width))); }

function readStoredPanelWidth(): number {
  const stored = Number.parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? '', 10);
  if (stored >= 320 && stored <= 720) return stored;
  localStorage.setItem(PANEL_WIDTH_KEY, String(DEFAULT_PANEL_WIDTH));
  return DEFAULT_PANEL_WIDTH;
}

function installHostStyles(): void {
  if (document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOST_STYLE_ID;
  style.textContent = getTyporaOverrideStyles();
  document.head.append(style);
}

async function syncSidecarSettings(rpc: WebSocketRpcClient, settings: Record<string, unknown>): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await rpc.request<{ revision: number }>('settings.getSnapshot');
    try {
      await rpc.request('settings.applyPatch', {
        expectedRevision: snapshot.revision,
        idempotencyKey: crypto.randomUUID(),
        patch: settings,
      });
      return;
    } catch (error) {
      if (attempt > 0) throw error;
    }
  }
}

const portablePathService: PathService = {
  dirname: value => dirname(normalize(value)),
  isAbsolute,
  join: (...parts) => normalize(parts.join('/')),
  normalize,
  relative: relativePath,
};

function normalize(value: string): string {
  const drive = value.match(/^[A-Za-z]:/)?.[0] ?? '';
  const absolute = Boolean(drive) || value.startsWith('/');
  const parts: string[] = [];
  for (const part of value.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return `${drive}${absolute && !drive ? '/' : drive ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
}

function isAbsolute(value: string): boolean { return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value); }
function dirname(value: string): string { const index = value.lastIndexOf('/'); return index <= 0 ? value.slice(0, Math.max(1, index)) : value.slice(0, index); }
function relativePath(from: string, to: string): string {
  const fromParts = normalize(from).split('/').filter(Boolean);
  const toParts = normalize(to).split('/').filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) { fromParts.shift(); toParts.shift(); }
  return [...fromParts.map(() => '..'), ...toParts].join('/') || '.';
}
function normalizeRelative(value: string): string { return normalize(value).replace(/^\.\//, '').replace(/^\//, ''); }

async function createFile(adapter: RendererWorkspaceFileAdapter, path: string): Promise<TyporaFile> {
  const file = fileFromPath(path);
  const stat = await adapter.stat(path);
  if (stat) file.stat = { ctime: stat.mtime, mtime: stat.mtime, size: stat.size };
  return file;
}

function fileFromPath(path: string): TyporaFile {
  const file = new TyporaFile();
  file.path = normalizeRelative(path);
  file.name = file.path.split('/').pop() ?? file.path;
  const index = file.name.lastIndexOf('.');
  file.basename = index > 0 ? file.name.slice(0, index) : file.name;
  file.extension = index > 0 ? file.name.slice(index + 1) : '';
  return file;
}

function createFolder(path: string): TyporaFolder {
  const folder = new TyporaFolder();
  folder.path = normalizeRelative(path);
  folder.name = folder.path.split('/').pop() ?? folder.path;
  return folder;
}

function showNotice(message: string, level: string): void {
  const notice = document.createElement('div');
  notice.className = `typorai-platform-notice typorai-platform-notice-${level}`;
  notice.textContent = message;
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 4_000);
}
