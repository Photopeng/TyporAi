import { JSDOM } from 'jsdom';

import { SettingBuilder } from '@/ui/SettingBuilder';

describe('SettingBuilder', () => {
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    originalDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body><section id="settings"></section></body></html>');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });

  it('renders native setting-item structure and emits field changes', () => {
    const changes: boolean[] = [];
    const container = document.getElementById('settings')!;
    const builder = new SettingBuilder(container);
    builder.heading('Display');
    const toggle = builder.toggle('Auto scroll', true, value => changes.push(value), 'Keep at bottom');

    toggle.checked = false;
    toggle.dispatchEvent(new container.ownerDocument.defaultView!.Event('change'));

    expect(container.querySelectorAll('.setting-item')).toHaveLength(2);
    expect(container.querySelector('.setting-item-description')?.textContent).toBe('Keep at bottom');
    expect(changes).toEqual([false]);
  });

  it('emits native textarea input changes', () => {
    const changes: string[] = [];
    const container = document.getElementById('settings')!;
    const input = new SettingBuilder(container).textarea('Prompt', 'Initial', value => changes.push(value));

    input.value = 'Updated';
    input.dispatchEvent(new container.ownerDocument.defaultView!.Event('input'));

    expect(input.tagName).toBe('TEXTAREA');
    expect(changes).toEqual(['Updated']);
  });

  it('renders select options and emits its selected value', () => {
    const changes: string[] = [];
    const container = document.getElementById('settings')!;
    const input = new SettingBuilder(container).select(
      'Language',
      'en',
      [{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }],
      value => changes.push(value),
    );

    input.value = 'zh';
    input.dispatchEvent(new container.ownerDocument.defaultView!.Event('change'));

    expect(input.options).toHaveLength(2);
    expect(changes).toEqual(['zh']);
  });

  it('keeps a range output in sync with its native input', () => {
    const changes: number[] = [];
    const container = document.getElementById('settings')!;
    const input = new SettingBuilder(container).range(
      'Max tabs', 3, { min: 3, max: 10, step: 1 }, value => changes.push(value),
    );

    input.value = '7';
    input.dispatchEvent(new container.ownerDocument.defaultView!.Event('input'));

    expect(container.querySelector('output')?.textContent).toBe('7');
    expect(changes).toEqual([7]);
  });
});
