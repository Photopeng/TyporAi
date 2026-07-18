import { setTyporAiTooltip } from '../ui/Tooltip';

export type TyporaEventRef = unknown;
export type TyporaPanelHost = any;
export type Workspace = any;
export type Editor = any;
export type Component = any;

export interface WorkspaceFileAdapter {
  basePath?: string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  mkdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(path: string): Promise<{ mtime: number; size: number } | null>;
}

export interface TyporaWorkspace {
  adapter: WorkspaceFileAdapter;
  on(name: string, callback: (arg1: any, arg2: any, arg3: any) => void): TyporaEventRef;
  offref(ref: TyporaEventRef): void;
  trigger(name: string, ...args: any[]): void;
  getFiles(): TyporaFile[];
  getAllLoadedFiles(): Array<TyporaFile | TyporaFolder>;
  getAbstractFileByPath(path: string): TyporaFile | TyporaFolder | null;
  getResourcePath(file: TyporaFile): string;
}

export interface TyporaMetadataIndex {
  on(name: string, callback: (arg1: any, arg2: any, arg3: any) => void): TyporaEventRef;
  getFileCache(file: TyporaFile): {
    frontmatter?: { tags?: string | string[] };
    tags?: Array<{ tag: string }>;
  } | null;
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TyporaFile | null;
}

export interface TyporaWorkspaceApi {
  on(name: string, callback: (arg1: any, arg2: any, arg3: any) => void): TyporaEventRef;
  getLeavesOfType(type: string): Array<{ view: any }>;
  getActiveDocumentView?(): unknown;
  getActiveViewOfType<T>(type: { new (...args: any[]): T }): T | null;
  getLeaf(...args: any[]): TyporaPanelHost;
  getLeftLeaf(...args: any[]): TyporaPanelHost | null;
  getRightLeaf(...args: any[]): TyporaPanelHost | null;
  getMostRecentLeaf(): TyporaPanelHost | null;
  getActiveFile(): TyporaFile | null;
  openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean | string): Promise<void>;
}

export interface TyporaHostApp {
  vault: TyporaWorkspace;
  workspace: TyporaWorkspaceApi;
  metadataCache: TyporaMetadataIndex;
  scope?: Scope;
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private changeCallback: ((value: string) => void | Promise<void>) | null = null;

  constructor(containerEl?: HTMLElement) {
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.addEventListener('input', () => {
      void this.changeCallback?.(this.inputEl.value);
    });
    containerEl?.appendChild(this.inputEl);
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  onChange(callback: (value: string) => void | Promise<void>): this {
    this.changeCallback = callback;
    return this;
  }

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  inputEl: HTMLInputElement;
  private changeCallback: ((value: boolean) => void | Promise<void>) | null = null;

  constructor(containerEl?: HTMLElement) {
    this.toggleEl = document.createElement('label');
    this.toggleEl.className = 'checkbox-container';
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'checkbox';
    this.inputEl.addEventListener('change', () => {
      void this.changeCallback?.(this.inputEl.checked);
    });
    this.toggleEl.appendChild(this.inputEl);
    this.toggleEl.appendChild(document.createElement('span'));
    containerEl?.appendChild(this.toggleEl);
  }

  setValue(value: boolean): this {
    this.inputEl.checked = value;
    return this;
  }

  getValue(): boolean { return this.inputEl.checked; }

  onChange(callback: (value: boolean) => void | Promise<void>): this {
    this.changeCallback = callback;
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private changeCallback: ((value: string) => void | Promise<void>) | null = null;

  constructor(containerEl?: HTMLElement) {
    this.selectEl = document.createElement('select');
    this.selectEl.addEventListener('change', () => {
      void this.changeCallback?.(this.selectEl.value);
    });
    containerEl?.appendChild(this.selectEl);
  }

  addOption(value: string, display: string): this {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = display;
    this.selectEl.appendChild(option);
    return this;
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display);
    }
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled;
    return this;
  }

  getValue(): string { return this.selectEl.value; }

  onChange(callback: (value: string) => void | Promise<void>): this {
    this.changeCallback = callback;
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(containerEl?: HTMLElement) {
    this.buttonEl = document.createElement('button');
    this.buttonEl.type = 'button';
    containerEl?.appendChild(this.buttonEl);
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  setTooltip(text: string): this {
    setTyporAiTooltip(this.buttonEl, text);
    return this;
  }

  setCta(): this {
    this.buttonEl.classList.add('mod-cta');
    return this;
  }

  setWarning(): this {
    this.buttonEl.classList.add('mod-warning');
    return this;
  }

  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }

  onClick(callback: (event: MouseEvent) => void | Promise<void>): this {
    this.buttonEl.addEventListener('click', event => void callback(event));
    return this;
  }
}

export class ExtraButtonComponent extends ButtonComponent {}

export class SliderComponent {
  sliderEl: HTMLInputElement;
  private changeCallback: ((value: number) => void | Promise<void>) | null = null;

  constructor(containerEl?: HTMLElement) {
    this.sliderEl = document.createElement('input');
    this.sliderEl.type = 'range';
    this.sliderEl.addEventListener('input', () => {
      void this.changeCallback?.(Number(this.sliderEl.value));
    });
    containerEl?.appendChild(this.sliderEl);
  }

  setLimits(min: number, max: number, step: number): this {
    this.sliderEl.min = String(min);
    this.sliderEl.max = String(max);
    this.sliderEl.step = String(step);
    return this;
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }

  getValue(): number { return Number(this.sliderEl.value); }

  setDynamicTooltip(): this {
    setTyporAiTooltip(this.sliderEl, this.sliderEl.value);
    this.sliderEl.addEventListener('input', () => {
      setTyporAiTooltip(this.sliderEl, this.sliderEl.value);
    });
    return this;
  }

  onChange(callback: (value: number) => void | Promise<void>): this {
    this.changeCallback = callback;
    return this;
  }
}

export class TyporaPluginRuntime {
  app: TyporaHostApp;
  manifest: any;

  constructor(app?: TyporaHostApp, manifest?: any) {
    this.app = app ?? {} as TyporaHostApp;
    this.manifest = manifest ?? {};
  }

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(_data: any): Promise<void> {}

  addCommand(_command: {
    id: string;
    name: string;
    callback?: () => void;
    editorCallback?: (editor: Editor, ctx: unknown) => void | Promise<void>;
    checkCallback?: (checking: boolean) => boolean;
  }): void {}
  addRibbonIcon(_icon: string, _title: string, _callback: () => void): void {}
  addSettingTab(_tab: any): void {}
  registerView(_type: string, _factory: (leaf: TyporaPanelHost) => any): void {}
  registerEvent(_event: TyporaEventRef): void {}
  registerDomEvent(_el: HTMLElement | Window | Document, _type: string, _callback: (event: any) => void): void {}
}

export class TyporaSettingsPanel {
  app: TyporaHostApp;
  plugin: TyporaPluginRuntime;
  containerEl: HTMLElement;

  constructor(app: TyporaHostApp, plugin: TyporaPluginRuntime) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  private infoEl: HTMLElement;

  constructor(containerEl?: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.settingEl.className = 'setting-item';
    this.infoEl = document.createElement('div');
    this.infoEl.className = 'setting-item-info';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = document.createElement('div');
    this.descEl.className = 'setting-item-description';
    this.controlEl = document.createElement('div');
    this.controlEl.className = 'setting-item-control';

    this.infoEl.append(this.nameEl, this.descEl);
    this.settingEl.append(this.infoEl, this.controlEl);
    containerEl?.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.replaceChildren();
    if (typeof desc === 'string') {
      this.descEl.textContent = desc;
    } else {
      this.descEl.appendChild(desc);
    }
    return this;
  }

  setClass(className: string): this {
    this.settingEl.classList.add(className);
    return this;
  }

  setHeading(): this {
    this.settingEl.classList.add('setting-item-heading');
    return this;
  }

  addText(callback: (component: TextComponent) => void): this {
    callback(new TextComponent(this.controlEl));
    return this;
  }

  addTextArea(callback: (component: TextAreaComponent) => void): this {
    callback(new TextAreaComponent(this.controlEl));
    return this;
  }

  addToggle(callback: (component: ToggleComponent) => void): this {
    callback(new ToggleComponent(this.controlEl));
    return this;
  }

  addDropdown(callback: (component: DropdownComponent) => void): this {
    callback(new DropdownComponent(this.controlEl));
    return this;
  }

  addButton(callback: (component: ButtonComponent) => void): this {
    callback(new ButtonComponent(this.controlEl));
    return this;
  }

  addExtraButton(callback: (component: ExtraButtonComponent) => void): this {
    callback(new ExtraButtonComponent(this.controlEl));
    return this;
  }

  addSlider(callback: (component: SliderComponent) => void): this {
    callback(new SliderComponent(this.controlEl));
    return this;
  }
}

export class Modal {
  app: TyporaHostApp;
  contentEl: HTMLElement = document.createElement('div');
  modalEl: HTMLElement = document.createElement('div');
  private backdropEl: HTMLElement | null = null;

  constructor(app: TyporaHostApp) {
    this.app = app;
  }

  open(): void {
    if (this.backdropEl) return;
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'modal-container';
    this.modalEl.classList.add('modal');
    this.contentEl.classList.add('modal-content');
    if (!this.contentEl.parentElement) {
      this.modalEl.appendChild(this.contentEl);
    }
    this.backdropEl.appendChild(this.modalEl);
    document.body.appendChild(this.backdropEl);
    this.onOpen();
  }

  close(): void {
    this.onClose();
    this.backdropEl?.remove();
    this.backdropEl = null;
  }

  setTitle(title: string): void {
    let titleEl = this.modalEl.querySelector<HTMLElement>('.modal-title');
    if (!titleEl) {
      titleEl = document.createElement('h2');
      titleEl.className = 'modal-title';
      this.modalEl.prepend(titleEl);
    }
    titleEl.textContent = title;
  }
  onOpen(): void {}
  onClose(): void {}
}

/**
 * Pluggable notice sink. The shim does not know about the real toast
 * adapter, so consumers that need a working Notice should assign a handler
 * here (TyporAi wires `ToastNoticeAdapter.show` in `mount.ts`). When no
 * handler is installed, Notice still creates a DOM node so the message is
 * at least inspectable in DevTools.
 */
type NoticeHandler = (message: string, timeout?: number) => void;
let activeNoticeHandler: NoticeHandler | null = null;
export function setNoticeHandler(handler: NoticeHandler | null): void {
  activeNoticeHandler = handler;
}

export class Notice {
  private el: HTMLElement | null = null;
  private timeoutId: number | null = null;
  constructor(message: string, timeout?: number) {
    if (activeNoticeHandler) {
      activeNoticeHandler(message, timeout);
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }
    this.el = document.createElement('div');
    this.el.className = 'typorai-platform-notice';
    this.el.setAttribute('role', 'status');
    this.el.textContent = message;
    this.el.style.cssText = [
      'position: fixed',
      'right: 16px',
      'bottom: 16px',
      'z-index: 2147483647',
      'max-width: 360px',
      'padding: 8px 12px',
      'border-radius: 6px',
      'background: rgba(28, 28, 30, 0.92)',
      'color: #ffffff',
      'font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25)',
      'opacity: 0',
      'transition: opacity 160ms ease',
    ].join(';');
    document.body.appendChild(this.el);
    requestAnimationFrame(() => {
      if (this.el) this.el.style.opacity = '1';
    });
    if (typeof timeout === 'number' && timeout > 0) {
      this.timeoutId = window.setTimeout(() => this.hide(), timeout);
    }
  }
  hide(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.el) {
      this.el.style.opacity = '0';
      const node = this.el;
      window.setTimeout(() => node.remove(), 200);
      this.el = null;
    }
  }
}

export class TyporaDocumentView {
  file?: TyporaFile;
  editor?: Editor;
  containerEl: HTMLElement = document.createElement('div');
  getMode(): string { return 'source'; }
}

export class TyporaPanelView {
  leaf: TyporaPanelHost;
  app: TyporaHostApp = {} as TyporaHostApp;
  contentEl: HTMLElement = document.createElement('div');
  containerEl: HTMLElement = document.createElement('div');
  scope: Scope | null = new Scope();
  private readonly disposers = new Set<() => void>();

  constructor(leaf: TyporaPanelHost) {
    this.leaf = leaf;
  }

  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  load(): Promise<void> { return Promise.resolve(); }
  onOpen(): Promise<void> { return Promise.resolve(); }
  onClose(): Promise<void> { return Promise.resolve(); }
  registerEvent(event: TyporaEventRef): void {
    const ref = event as { dispose?: () => void; off?: () => void } | null;
    if (ref?.dispose) this.disposers.add(() => ref.dispose?.());
    else if (ref?.off) this.disposers.add(() => ref.off?.());
  }

  registerDomEvent<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    callback: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    element.addEventListener(type, callback as EventListener, options);
    this.disposers.add(() => element.removeEventListener(type, callback as EventListener, options));
  }

  protected disposePlatformListeners(): void {
    for (const dispose of [...this.disposers].reverse()) dispose();
    this.disposers.clear();
  }
}

export class Scope {
  parent?: unknown;
  handlers: Array<{
    modifiers: string[] | null;
    key: string | null;
    func: (evt: KeyboardEvent) => unknown;
  }> = [];

  constructor(parent?: unknown) {
    this.parent = parent;
  }

  register(modifiers: string[] | null, key: string | null, func: (evt: KeyboardEvent) => unknown): void {
    this.handlers.push({ modifiers, key, func });
  }
}

export class TyporaFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
  stat = {
    ctime: 0,
    mtime: 0,
    size: 0,
  };
}

export class TyporaFolder {
  path = '';
  name = '';
  children: Array<TyporaFile | TyporaFolder> = [];
}

export class Menu {
  addItem(_callback: (item: any) => void): this { return this; }
  showAtMouseEvent(_event: MouseEvent): void {}
  hide(): void {}
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  private changeCallback: ((value: string) => void | Promise<void>) | null = null;

  constructor(containerEl?: HTMLElement) {
    this.inputEl = document.createElement('textarea');
    this.inputEl.addEventListener('input', () => {
      void this.changeCallback?.(this.inputEl.value);
    });
    containerEl?.appendChild(this.inputEl);
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  onChange(callback: (value: string) => void | Promise<void>): this {
    this.changeCallback = callback;
    return this;
  }

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }
}

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      parent.appendChild(document.createTextNode(text.slice(cursor, index)));
    }

    if (token.startsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    } else if (token.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const link = document.createElement('a');
        link.textContent = linkMatch[1];
        link.setAttribute('href', linkMatch[2]);
        parent.appendChild(link);
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function flushParagraph(target: HTMLElement, paragraphLines: string[]): void {
  if (paragraphLines.length === 0) {
    return;
  }
  const paragraph = document.createElement('p');
  appendInlineMarkdown(paragraph, paragraphLines.join(' '));
  target.appendChild(paragraph);
  paragraphLines.length = 0;
}

function flushList(target: HTMLElement, list: HTMLUListElement | HTMLOListElement | null): null {
  if (list) {
    target.appendChild(list);
  }
  return null;
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return !!cells
    && cells.length > 0
    && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function collectMarkdownTable(lines: string[], startIndex: number): {
  nextIndex: number;
  rows: string[][];
} | null {
  const header = splitMarkdownTableRow(lines[startIndex]);
  if (!header || !isMarkdownTableSeparator(lines[startIndex + 1] ?? '')) {
    return null;
  }

  const rows: string[][] = [header];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = splitMarkdownTableRow(lines[index]);
    if (!row) {
      break;
    }
    rows.push(row);
    index++;
  }

  return { nextIndex: index, rows };
}

function renderMarkdownTable(target: HTMLElement, rows: string[][]): void {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const headerRow = document.createElement('tr');
  const columnCount = rows[0]?.length ?? 0;

  for (const cell of rows[0] ?? []) {
    const th = document.createElement('th');
    appendInlineMarkdown(th, cell);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  for (const row of rows.slice(1)) {
    const tr = document.createElement('tr');
    for (let index = 0; index < columnCount; index++) {
      const td = document.createElement('td');
      appendInlineMarkdown(td, row[index] ?? '');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  target.appendChild(table);
}

function renderBasicMarkdown(markdown: string, el: HTMLElement): void {
  el.textContent = '';
  el.classList.add('markdown-rendered');

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const paragraphLines: string[] = [];
  let list: HTMLUListElement | HTMLOListElement | null = null;
  let codeFence: { language: string; lines: string[] } | null = null;

  const finishCodeFence = (): void => {
    if (!codeFence) {
      return;
    }
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (codeFence.language) {
      code.className = `language-${codeFence.language}`;
    }
    code.textContent = codeFence.lines.join('\n');
    pre.appendChild(code);
    el.appendChild(pre);
    codeFence = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.match(/^```([^`]*)$/);
    if (fenceMatch) {
      if (codeFence) {
        finishCodeFence();
      } else {
        flushParagraph(el, paragraphLines);
        list = flushList(el, list);
        codeFence = { language: fenceMatch[1].trim(), lines: [] };
      }
      continue;
    }

    if (codeFence) {
      codeFence.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(el, paragraphLines);
      list = flushList(el, list);
      continue;
    }

    const table = collectMarkdownTable(lines, index);
    if (table) {
      flushParagraph(el, paragraphLines);
      list = flushList(el, list);
      renderMarkdownTable(el, table.rows);
      index = table.nextIndex - 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph(el, paragraphLines);
      list = flushList(el, list);
      const heading = document.createElement(`h${headingMatch[1].length}`) as HTMLHeadingElement;
      appendInlineMarkdown(heading, headingMatch[2]);
      el.appendChild(heading);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph(el, paragraphLines);
      list = flushList(el, list);
      const quote = document.createElement('blockquote');
      appendInlineMarkdown(quote, quoteMatch[1]);
      el.appendChild(quote);
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph(el, paragraphLines);
      const shouldUseOrdered = Boolean(orderedMatch);
      const expectedTag = shouldUseOrdered ? 'OL' : 'UL';
      if (!list || list.tagName !== expectedTag) {
        flushList(el, list);
        list = document.createElement(shouldUseOrdered ? 'ol' : 'ul');
      }
      const item = document.createElement('li');
      appendInlineMarkdown(item, (unorderedMatch ?? orderedMatch)?.[1] ?? '');
      list.appendChild(item);
      continue;
    }

    paragraphLines.push(line.trim());
  }

  finishCodeFence();
  flushParagraph(el, paragraphLines);
  flushList(el, list);
}

export const MarkdownRenderer = {
  render: async (
    _app: TyporaHostApp,
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: Component,
  ): Promise<void> => {
    renderBasicMarkdown(markdown, el);
  },
  renderMarkdown: async (
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: Component,
  ): Promise<void> => {
    renderBasicMarkdown(markdown, el);
  },
};

export function setIcon(el: HTMLElement, icon: string): void {
  el.setAttribute('data-icon', icon);
  el.classList.add('typorai-icon-rendered');

  for (const existing of Array.from(el.querySelectorAll?.('svg.typorai-inline-icon') ?? [])) {
    existing.remove();
  }

  const ownerDocument = el.ownerDocument ?? document;
  if (typeof ownerDocument.createElementNS !== 'function') {
    return;
  }

  const svg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('typorai-inline-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const child of getIconSvgChildren(icon)) {
    const node = ownerDocument.createElementNS('http://www.w3.org/2000/svg', child.tag);
    for (const [key, value] of Object.entries(child.attributes)) {
      node.setAttribute(key, value);
    }
    svg.appendChild(node);
  }

  if (typeof el.prepend === 'function') {
    el.prepend(svg);
  } else {
    el.insertBefore(svg, el.firstChild);
  }
}

type InlineIconChild = {
  tag: 'circle' | 'line' | 'path' | 'polyline' | 'rect';
  attributes: Record<string, string>;
};

const SIMPLE_ICON_CHILDREN: Record<string, InlineIconChild[]> = {
  'alert-circle': [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'line', attributes: { x1: '12', y1: '8', x2: '12', y2: '12' } },
    { tag: 'line', attributes: { x1: '12', y1: '16', x2: '12.01', y2: '16' } },
  ],
  bot: [
    { tag: 'rect', attributes: { x: '5', y: '8', width: '14', height: '10', rx: '2' } },
    { tag: 'path', attributes: { d: 'M12 8V4' } },
    { tag: 'path', attributes: { d: 'M8 13h.01' } },
    { tag: 'path', attributes: { d: 'M16 13h.01' } },
  ],
  check: [
    { tag: 'path', attributes: { d: 'M20 6 9 17l-5-5' } },
  ],
  'check-circle': [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attributes: { d: 'M9 12l2 2 4-4' } },
  ],
  'clipboard-paste': [
    { tag: 'path', attributes: { d: 'M8 4h8' } },
    { tag: 'rect', attributes: { x: '8', y: '2', width: '8', height: '4', rx: '1' } },
    { tag: 'path', attributes: { d: 'M16 4h2a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h2' } },
    { tag: 'path', attributes: { d: 'M12 11v6' } },
    { tag: 'path', attributes: { d: 'M9 14h6' } },
  ],
  clock: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'polyline', attributes: { points: '12 6 12 12 16 14' } },
  ],
  copy: [
    { tag: 'rect', attributes: { x: '9', y: '9', width: '11', height: '11', rx: '2' } },
    { tag: 'path', attributes: { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' } },
  ],
  download: [
    { tag: 'path', attributes: { d: 'M12 3v12' } },
    { tag: 'path', attributes: { d: 'm7 10 5 5 5-5' } },
    { tag: 'path', attributes: { d: 'M5 21h14' } },
  ],
  'dollar-sign': [
    { tag: 'path', attributes: { d: 'M12 2v20' } },
    { tag: 'path', attributes: { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6' } },
  ],
  'external-link': [
    { tag: 'path', attributes: { d: 'M15 3h6v6' } },
    { tag: 'path', attributes: { d: 'M10 14 21 3' } },
    { tag: 'path', attributes: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
  ],
  'file-plus': [
    { tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
    { tag: 'path', attributes: { d: 'M14 2v6h6' } },
    { tag: 'path', attributes: { d: 'M12 11v6' } },
    { tag: 'path', attributes: { d: 'M9 14h6' } },
  ],
  'file-pen': [
    { tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
    { tag: 'path', attributes: { d: 'M14 2v6h6' } },
    { tag: 'path', attributes: { d: 'M10 18l1-4 6-6 3 3-6 6-4 1z' } },
  ],
  'file-text': [
    { tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
    { tag: 'path', attributes: { d: 'M14 2v6h6' } },
    { tag: 'path', attributes: { d: 'M8 13h8' } },
    { tag: 'path', attributes: { d: 'M8 17h6' } },
  ],
  folder: [
    { tag: 'path', attributes: { d: 'M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } },
  ],
  'folder-open': [
    { tag: 'path', attributes: { d: 'M3 7h6l2 2h10' } },
    { tag: 'path', attributes: { d: 'M3 19l3-8h17l-3 8z' } },
  ],
  'folder-search': [
    { tag: 'path', attributes: { d: 'M3 7h6l2 2h10v4' } },
    { tag: 'circle', attributes: { cx: '15', cy: '16', r: '3' } },
    { tag: 'path', attributes: { d: 'm18 19 3 3' } },
  ],
  'git-fork': [
    { tag: 'circle', attributes: { cx: '6', cy: '3', r: '2' } },
    { tag: 'circle', attributes: { cx: '18', cy: '3', r: '2' } },
    { tag: 'circle', attributes: { cx: '12', cy: '21', r: '2' } },
    { tag: 'path', attributes: { d: 'M6 5v3a6 6 0 0 0 6 6v5' } },
    { tag: 'path', attributes: { d: 'M18 5v3a6 6 0 0 1-6 6' } },
  ],
  globe: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attributes: { d: 'M2 12h20' } },
    { tag: 'path', attributes: { d: 'M12 2a15 15 0 0 1 0 20' } },
    { tag: 'path', attributes: { d: 'M12 2a15 15 0 0 0 0 20' } },
  ],
  'help-circle': [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attributes: { d: 'M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4' } },
    { tag: 'path', attributes: { d: 'M12 17h.01' } },
  ],
  list: [
    { tag: 'path', attributes: { d: 'M8 6h13' } },
    { tag: 'path', attributes: { d: 'M8 12h13' } },
    { tag: 'path', attributes: { d: 'M8 18h13' } },
    { tag: 'path', attributes: { d: 'M3 6h.01' } },
    { tag: 'path', attributes: { d: 'M3 12h.01' } },
    { tag: 'path', attributes: { d: 'M3 18h.01' } },
  ],
  'list-checks': [
    { tag: 'path', attributes: { d: 'm3 6 1.5 1.5L7 5' } },
    { tag: 'path', attributes: { d: 'm3 12 1.5 1.5L7 11' } },
    { tag: 'path', attributes: { d: 'M10 6h11' } },
    { tag: 'path', attributes: { d: 'M10 12h11' } },
    { tag: 'path', attributes: { d: 'M3 18h4' } },
    { tag: 'path', attributes: { d: 'M10 18h11' } },
  ],
  'list-clock': [
    { tag: 'path', attributes: { d: 'M4 6h10' } },
    { tag: 'path', attributes: { d: 'M4 12h6' } },
    { tag: 'circle', attributes: { cx: '16', cy: '16', r: '5' } },
    { tag: 'path', attributes: { d: 'M16 13v3l2 1' } },
  ],
  loader: [
    { tag: 'path', attributes: { d: 'M21 12a9 9 0 1 1-6.2-8.6' } },
  ],
  'loader-2': [
    { tag: 'path', attributes: { d: 'M21 12a9 9 0 1 1-6.2-8.6' } },
  ],
  lock: [
    { tag: 'rect', attributes: { x: '5', y: '11', width: '14', height: '10', rx: '2' } },
    { tag: 'path', attributes: { d: 'M8 11V7a4 4 0 0 1 8 0v4' } },
  ],
  map: [
    { tag: 'path', attributes: { d: 'M9 18 3 21V6l6-3 6 3 6-3v15l-6 3z' } },
    { tag: 'path', attributes: { d: 'M9 3v15' } },
    { tag: 'path', attributes: { d: 'M15 6v15' } },
  ],
  'message-circle-plus': [
    { tag: 'path', attributes: { d: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 1 1 21 11.5z' } },
    { tag: 'path', attributes: { d: 'M12 8v7' } },
    { tag: 'path', attributes: { d: 'M8.5 11.5h7' } },
  ],
  'message-square': [
    { tag: 'path', attributes: { d: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } },
  ],
  'message-square-dot': [
    { tag: 'path', attributes: { d: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } },
    { tag: 'circle', attributes: { cx: '12', cy: '10', r: '1' } },
  ],
  'panel-right-close': [
    { tag: 'rect', attributes: { x: '3', y: '4', width: '18', height: '16', rx: '2' } },
    { tag: 'path', attributes: { d: 'M15 4v16' } },
    { tag: 'path', attributes: { d: 'm10 10-3 2 3 2' } },
  ],
  package: [
    { tag: 'path', attributes: { d: 'M12 2 3 7l9 5 9-5z' } },
    { tag: 'path', attributes: { d: 'M3 7v10l9 5 9-5V7' } },
    { tag: 'path', attributes: { d: 'M12 12v10' } },
  ],
  pencil: [
    { tag: 'path', attributes: { d: 'M17 3a2.8 2.8 0 0 1 4 4L7 21l-4 1 1-4z' } },
  ],
  plus: [
    { tag: 'path', attributes: { d: 'M12 5v14' } },
    { tag: 'path', attributes: { d: 'M5 12h14' } },
  ],
  'refresh-cw': [
    { tag: 'path', attributes: { d: 'M21 12a9 9 0 0 1-15.5 6.4L3 16' } },
    { tag: 'path', attributes: { d: 'M3 21v-5h5' } },
    { tag: 'path', attributes: { d: 'M3 12A9 9 0 0 1 18.5 5.6L21 8' } },
    { tag: 'path', attributes: { d: 'M21 3v5h-5' } },
  ],
  'rotate-ccw': [
    { tag: 'path', attributes: { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' } },
    { tag: 'path', attributes: { d: 'M3 3v5h5' } },
  ],
  search: [
    { tag: 'circle', attributes: { cx: '11', cy: '11', r: '8' } },
    { tag: 'path', attributes: { d: 'm21 21-4.3-4.3' } },
  ],
  'search-check': [
    { tag: 'circle', attributes: { cx: '11', cy: '11', r: '8' } },
    { tag: 'path', attributes: { d: 'm21 21-4.3-4.3' } },
    { tag: 'path', attributes: { d: 'm8 11 2 2 4-4' } },
  ],
  settings: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '3' } },
    { tag: 'path', attributes: { d: 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 3-.2-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21h-4v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.2.1-2-3 .1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-3 .2.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.2-.1 2 3-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v4h-.1a1.6 1.6 0 0 0-1.5 1z' } },
  ],
  'square-plus': [
    { tag: 'rect', attributes: { x: '3', y: '3', width: '18', height: '18', rx: '2' } },
    { tag: 'path', attributes: { d: 'M12 8v8' } },
    { tag: 'path', attributes: { d: 'M8 12h8' } },
  ],
  terminal: [
    { tag: 'path', attributes: { d: 'm4 17 6-6-6-6' } },
    { tag: 'path', attributes: { d: 'M12 19h8' } },
  ],
  'toggle-left': [
    { tag: 'rect', attributes: { x: '3', y: '7', width: '18', height: '10', rx: '5' } },
    { tag: 'circle', attributes: { cx: '8', cy: '12', r: '3' } },
  ],
  'toggle-right': [
    { tag: 'rect', attributes: { x: '3', y: '7', width: '18', height: '10', rx: '5' } },
    { tag: 'circle', attributes: { cx: '16', cy: '12', r: '3' } },
  ],
  trash: [
    { tag: 'path', attributes: { d: 'M3 6h18' } },
    { tag: 'path', attributes: { d: 'M8 6V4h8v2' } },
    { tag: 'path', attributes: { d: 'M6 6l1 16h10l1-16' } },
  ],
  'trash-2': [
    { tag: 'path', attributes: { d: 'M3 6h18' } },
    { tag: 'path', attributes: { d: 'M8 6V4h8v2' } },
    { tag: 'path', attributes: { d: 'M6 6l1 16h10l1-16' } },
    { tag: 'path', attributes: { d: 'M10 11v6' } },
    { tag: 'path', attributes: { d: 'M14 11v6' } },
  ],
  unlock: [
    { tag: 'rect', attributes: { x: '5', y: '11', width: '14', height: '10', rx: '2' } },
    { tag: 'path', attributes: { d: 'M8 11V7a4 4 0 0 1 7.4-2' } },
  ],
  wrench: [
    { tag: 'path', attributes: { d: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.8 2.8-2.1-2.1z' } },
  ],
  x: [
    { tag: 'path', attributes: { d: 'M18 6 6 18' } },
    { tag: 'path', attributes: { d: 'm6 6 12 12' } },
  ],
  'x-circle': [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attributes: { d: 'M15 9 9 15' } },
    { tag: 'path', attributes: { d: 'm9 9 6 6' } },
  ],
  zap: [
    { tag: 'path', attributes: { d: 'M13 2 3 14h8l-1 8 11-14h-8z' } },
  ],
};

function getIconSvgChildren(icon: string): InlineIconChild[] {
  return SIMPLE_ICON_CHILDREN[icon] ?? SIMPLE_ICON_CHILDREN.wrench;
}

function unquoteYamlValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseYamlValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value === '') return null;

  if (value.startsWith('{') && value.endsWith('}')) {
    try {
      return JSON.parse(value);
    } catch {
      return unquoteYamlValue(value);
    }
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(item => unquoteYamlValue(item.trim()))
      .filter(Boolean);
  }

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  const numberValue = Number(value);
  if (!Number.isNaN(numberValue)) {
    return numberValue;
  }

  return unquoteYamlValue(value);
}

export function parseYaml(yaml: string): unknown {
  if (!yaml.trim()) return null;

  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let currentArrayKey: string | null = null;
  let currentArray: unknown[] = [];
  let blockScalarKey: string | null = null;
  let blockScalarLines: string[] = [];

  const flushArray = (): void => {
    if (!currentArrayKey) return;
    result[currentArrayKey] = currentArray;
    currentArrayKey = null;
    currentArray = [];
  };

  const flushBlockScalar = (): void => {
    if (!blockScalarKey) return;
    result[blockScalarKey] = blockScalarLines.join('\n').trimEnd();
    blockScalarKey = null;
    blockScalarLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (blockScalarKey) {
      if (/^\S[^:]*:\s*/.test(line)) {
        flushBlockScalar();
      } else {
        blockScalarLines.push(line.replace(/^\s{2}/, ''));
        continue;
      }
    }

    if (currentArrayKey) {
      if (trimmed.startsWith('- ')) {
        currentArray.push(parseYamlValue(trimmed.slice(2)));
        continue;
      }
      flushArray();
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    const value = rawValue.trim();
    if (value === '|') {
      blockScalarKey = key;
      blockScalarLines = [];
      continue;
    }
    if (value === '') {
      currentArrayKey = key;
      currentArray = [];
      continue;
    }

    result[key] = parseYamlValue(value);
  }

  flushArray();
  flushBlockScalar();
  return result;
}
