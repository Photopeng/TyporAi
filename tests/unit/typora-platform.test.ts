import { JSDOM } from 'jsdom';

import type { DropdownComponent, TextAreaComponent, ToggleComponent } from '@/typora/platform';
import { MarkdownRenderer, Notice, parseYaml, setIcon, setNoticeHandler, Setting, TextComponent } from '@/typora/platform';

describe('Typora platform settings controls', () => {
  let originalDocument: typeof globalThis.document | undefined;
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    const dom = new JSDOM('<!doctype html><body></body>');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: dom.window.document,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: dom.window,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  it('renders settings and wires text input changes', () => {
    const container = document.createElement('div');
    const onChange = jest.fn();

    new Setting(container)
      .setName('API key')
      .setDesc('Key used by API mode')
      .addText((text) => {
        text.setValue('old').onChange(onChange);
      });

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'new';
    input.dispatchEvent(new window.Event('input'));

    expect(container.querySelector('.setting-item-name')?.textContent).toBe('API key');
    expect(container.querySelector('.setting-item-description')?.textContent).toBe('Key used by API mode');
    expect(onChange).toHaveBeenCalledWith('new');
  });

  it('wires toggle, dropdown, and textarea changes', () => {
    const container = document.createElement('div');
    const toggleChange = jest.fn();
    const dropdownChange = jest.fn();
    const textAreaChange = jest.fn();

    new Setting(container).addToggle((toggle: ToggleComponent) => {
      toggle.setValue(false).onChange(toggleChange);
    });
    new Setting(container).addDropdown((dropdown: DropdownComponent) => {
      dropdown
        .addOption('api', 'API')
        .addOption('cli', 'CLI')
        .setValue('api')
        .onChange(dropdownChange);
    });
    new Setting(container).addTextArea((textArea: TextAreaComponent) => {
      textArea.setValue('a').onChange(textAreaChange);
    });

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event('change'));

    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'cli';
    select.dispatchEvent(new window.Event('change'));

    const textArea = container.querySelector('textarea') as HTMLTextAreaElement;
    textArea.value = 'b';
    textArea.dispatchEvent(new window.Event('input'));

    expect(toggleChange).toHaveBeenCalledWith(true);
    expect(dropdownChange).toHaveBeenCalledWith('cli');
    expect(textAreaChange).toHaveBeenCalledWith('b');
  });

  it('can construct standalone components for compatibility', () => {
    const text = new TextComponent();
    text.setValue('value');

    expect(text.getValue()).toBe('value');
  });

  it('renders data-icon shims as inline SVG icons', () => {
    const button = document.createElement('button');

    setIcon(button, 'copy');
    expect(button.getAttribute('data-icon')).toBe('copy');
    expect(button.classList.contains('typorai-icon-rendered')).toBe(true);
    expect(button.querySelectorAll('svg.typorai-inline-icon')).toHaveLength(1);

    setIcon(button, 'unknown-icon');
    expect(button.getAttribute('data-icon')).toBe('unknown-icon');
    expect(button.querySelectorAll('svg.typorai-inline-icon')).toHaveLength(1);
    expect(button.querySelector('svg.typorai-inline-icon path')).not.toBeNull();
  });

  it('renders basic markdown into DOM nodes', async () => {
    const container = document.createElement('div');

    await MarkdownRenderer.renderMarkdown('# Title\n\n- **bold**\n\n```ts\nconst x = 1;\n```', container, '', {});

    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code.language-ts')?.textContent).toBe('const x = 1;');
  });

  it('renders markdown tables into table elements', async () => {
    const container = document.createElement('div');

    await MarkdownRenderer.renderMarkdown(
      '| 条目 | 旧版 | 新版 |\n| --- | --- | --- |\n| 风格 | 分析式 | 标准条目列表 |',
      container,
      '',
      {},
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect([...container.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(['条目', '旧版', '新版']);
    expect([...container.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['风格', '分析式', '标准条目列表']);
  });

  it('parses common frontmatter YAML values', () => {
    expect(parseYaml(`description: "Reviews code"
enabled: true
steps: 3
tools: {"write":false,"edit":false}
allowed-tools:
  - Read
  - Write
notes: |
  first line
  second line`)).toEqual({
      description: 'Reviews code',
      enabled: true,
      steps: 3,
      tools: { write: false, edit: false },
      'allowed-tools': ['Read', 'Write'],
      notes: 'first line\nsecond line',
    });
  });

  it('Notice delegates to the active handler when set (report §3.1)', () => {
    const handler = jest.fn();
    setNoticeHandler(handler);
    try {
      new Notice('hello world', 4000);
      expect(handler).toHaveBeenCalledWith('hello world', 4000);
      // The DOM-fallback path must NOT execute when a handler is installed.
      expect(document.querySelectorAll('.typorai-platform-notice')).toHaveLength(0);
    } finally {
      setNoticeHandler(null);
    }
  });

  it('Notice falls back to a DOM node when no handler is set', () => {
    const notice = new Notice('dom fallback', 2000);
    const el = document.querySelector('.typorai-platform-notice');
    expect(el?.textContent).toBe('dom fallback');
    notice.hide();
  });
});
