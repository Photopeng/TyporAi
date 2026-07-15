/**
 * @jest-environment jsdom
 */

import { ToastNoticeAdapter } from '@/adapters/notice';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { InlineEditResult, InlineEditService } from '@/core/providers/types';
import { setLocale } from '@/i18n/i18n';
import { TyporaEditModeController } from '@/typora/TyporaEditModeController';

jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    createInlineEditService: jest.fn(),
    getCapabilities: jest.fn(() => ({
      providerId: 'typora',
      supportsPersistentRuntime: false,
      supportsNativeHistory: false,
      supportsPlanMode: false,
      supportsRewind: false,
      supportsFork: true,
      supportsProviderCommands: false,
      supportsImageAttachments: false,
      supportsInstructionMode: true,
      supportsMcpTools: false,
      reasoningControl: 'none',
    })),
    hasProvider: jest.fn((providerId) => Boolean(providerId)),
    resolveSettingsProviderId: jest.fn(() => 'typora'),
  },
}));

const createInlineEditService = ProviderRegistry.createInlineEditService as jest.MockedFunction<
  typeof ProviderRegistry.createInlineEditService
>;

describe('TyporaEditModeController', () => {
  let originalFile: unknown;
  let service: jest.Mocked<InlineEditService>;

  beforeEach(() => {
    originalFile = (window as any).File;
    document.body.innerHTML = '';
    service = {
      cancel: jest.fn(),
      continueConversation: jest.fn(),
      editText: jest.fn(),
      resetConversation: jest.fn(),
    };
    createInlineEditService.mockReturnValue(service);
  });

  afterEach(() => {
    (window as any).File = originalFile;
    setLocale('en');
    jest.clearAllMocks();
  });

  it('blocks inline document edits while SAFE is enabled', async () => {
    setupTyporaSelection('protected text');
    const toastSpy = jest.spyOn(ToastNoticeAdapter.prototype, 'show').mockImplementation(() => undefined);
    try {
      const controller = new TyporaEditModeController(createPlugin('normal'), document.body);
      controller.start('Replace this text');
      await flushPromises();

      expect(service.editText).not.toHaveBeenCalled();
      expect(controller.getState().blocks).toHaveLength(0);
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('SAFE'), 'error', 4000);
      controller.destroy();
    } finally {
      toastSpy.mockRestore();
    }
  });

  it('keeps other edit blocks stable when accepting one of multiple blocks', async () => {
    setupTyporaSelection('first');
    service.editText
      .mockResolvedValueOnce({ success: true, editedText: 'FIRST' })
      .mockResolvedValueOnce({ success: true, editedText: 'SECOND' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);

    controller.start('Improve first');
    await flushPromises();
    setupTyporaSelection('second');
    controller.start('Improve second');
    await flushPromises();

    const [first, second] = controller.getState().blocks;
    controller.accept(first.id);

    expect(document.body.textContent).toContain('FIRST');
    expect(document.body.textContent).toContain('second');
    expect(second.anchorEl.isConnected).toBe(true);
    expect(second.suggestionEl.textContent).toBe('SECOND');
    expect(controller.getState().blocks).toHaveLength(1);
  });

  it('accepts the manually edited suggestion text instead of the original AI output', async () => {
    setupTyporaSelection('old text');
    service.editText.mockResolvedValue({ success: true, editedText: 'ai output' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);
    controller.start('Improve');
    await flushPromises();

    const [block] = controller.getState().blocks;
    block.suggestionEl.textContent = 'human edited output';
    block.suggestionEl.dispatchEvent(new InputEvent('input'));
    controller.accept(block.id);

    expect(document.body.textContent).toContain('human edited output');
    expect(document.body.textContent).not.toContain('ai output');
  });

  it('refines only the selected subrange inside a suggestion block', async () => {
    setupTyporaSelection('old text');
    service.editText
      .mockResolvedValueOnce({ success: true, editedText: 'alpha beta gamma' })
      .mockResolvedValueOnce({ success: true, editedText: 'BETA' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);
    controller.start('Improve');
    await flushPromises();

    const [block] = controller.getState().blocks;
    selectTextInside(block.suggestionEl.firstChild as Text, 6, 10);
    await controller.refineBlock(block.id, 'Uppercase selected word');

    expect(block.proposedText).toBe('alpha BETA gamma');
    expect(block.suggestionEl.textContent).toBe('alpha BETA gamma');
  });

  it('creates EditBlocks from both selected text and dialog instruction entry paths', async () => {
    setupTyporaSelection('selected text');
    service.editText
      .mockResolvedValueOnce({ success: true, editedText: 'selected result' })
      .mockResolvedValueOnce({ success: true, insertedText: 'cursor result' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);

    controller.start('Edit selection');
    await flushPromises();
    setupTyporaSelection('');
    controller.start();
    const input = document.querySelector<HTMLInputElement>('.typora-edit-mode-prompt-input');
    input!.value = 'Edit cursor';
    input!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const blocks = controller.getState().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      originalText: 'selected text',
      proposedText: 'selected result',
    });
    expect(blocks[1]).toMatchObject({
      originalText: '',
      proposedText: 'cursor result',
    });
  });

  it('closes the edit instruction prompt when clicking outside it', () => {
    setupTyporaSelection('');
    const controller = new TyporaEditModeController(createPlugin(), document.body);

    controller.start();
    expect(document.querySelector('.typora-edit-mode-prompt')).not.toBeNull();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.querySelector('.typora-edit-mode-prompt')).toBeNull();
    expect(controller.getState().isPrompting).toBe(false);
    controller.destroy();
  });

  it('mounts the edit instruction prompt on the document body outside the panel root', () => {
    document.body.innerHTML = '<section id="typorai-typora-root"></section>';
    setupTyporaSelection('');
    const panelRoot = document.getElementById('typorai-typora-root')!;
    const controller = new TyporaEditModeController(createPlugin(), panelRoot);

    controller.start();

    const prompt = document.querySelector<HTMLElement>('.typora-edit-mode-prompt');
    expect(prompt).not.toBeNull();
    expect(prompt?.parentElement).toBe(document.body);
    expect(panelRoot.querySelector('.typora-edit-mode-prompt')).toBeNull();
    controller.destroy();
  });

  it('localizes edit block action buttons', async () => {
    setLocale('zh-CN');
    setupTyporaSelection('old text');
    service.editText.mockResolvedValue({ success: true, editedText: 'new text' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);
    controller.start('Improve');
    await flushPromises();

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.typora-edit-block-actions button')];
    expect(buttons.map(button => button.textContent)).toEqual(['接受', '优化', '拒绝']);
    controller.destroy();
  });

  it('uses editor.getSelection() as the sole data source for captureTarget', async () => {
    setupTyporaSelection('hello world');
    service.editText.mockResolvedValue({ success: true, editedText: 'HELLO WORLD' });

    const controller = new TyporaEditModeController(createPlugin(), document.body);
    controller.start('uppercase');
    await flushPromises();

    const [block] = controller.getState().blocks;
    expect(block.originalText).toBe('hello world');
    controller.destroy();
  });

  it('surfaces generation failure via ToastNoticeAdapter when editText throws', async () => {
    setupTyporaSelection('hello');
    service.editText.mockRejectedValue(new Error('CLI crashed'));

    const toastSpy = jest.spyOn(ToastNoticeAdapter.prototype, 'show').mockImplementation(() => undefined);
    try {
      const controller = new TyporaEditModeController(createPlugin(), document.body);
      controller.start('improve');
      await flushPromises();
      await flushPromises();
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('CLI crashed'), 'error', 4000);
      controller.destroy();
    } finally {
      toastSpy.mockRestore();
    }
  });

  it('surfaces an inline error when the response has no replacement text', async () => {
    setupTyporaSelection('hello');
    service.editText.mockResolvedValue({ success: true });

    const toastSpy = jest.spyOn(ToastNoticeAdapter.prototype, 'show').mockImplementation(() => undefined);
    try {
      const controller = new TyporaEditModeController(createPlugin(), document.body);
      controller.start('improve');
      await flushPromises();
      await flushPromises();
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('replacement'), 'error', 4000);
      controller.destroy();
    } finally {
      toastSpy.mockRestore();
    }
  });

  it('rejects nested generation requests while a generation is in flight', async () => {
    setupTyporaSelection('hello');
    let resolveFirst!: (value: InlineEditResult) => void;
    service.editText.mockImplementationOnce(() => new Promise<InlineEditResult>((r) => { resolveFirst = r; }));
    service.editText.mockResolvedValue({ success: true, editedText: 'SECOND' });

    const toastSpy = jest.spyOn(ToastNoticeAdapter.prototype, 'show').mockImplementation(() => undefined);
    try {
      const controller = new TyporaEditModeController(createPlugin(), document.body);
      controller.start('first');
      await flushPromises();
      // First generation is still pending (resolveFirst hasn't been called).
      const callCountAfterFirst = service.editText.mock.calls.length;
      expect(callCountAfterFirst).toBe(1);

      // Second start must be rejected by the nested-edit mutex.
      controller.start('second');
      await flushPromises();
      expect(service.editText.mock.calls.length).toBe(callCountAfterFirst);

      resolveFirst({ success: true, editedText: 'FIRST' });
      await flushPromises();
      controller.destroy();
    } finally {
      toastSpy.mockRestore();
    }
  });
});

function setupTyporaSelection(selection: string): void {
  (window as any).File = {
    editor: {
      getMarkdown: () => selection ? `before ${selection} after` : 'before\n',
      getSelection: () => selection,
    },
    filePath: 'C:\\workspace\\note.md',
  };
  window.getSelection()?.removeAllRanges();
}

function selectTextInside(textNode: Text, start: number, end: number): void {
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function createPlugin(permissionMode = 'yolo'): any {
  return {
    settings: { permissionMode },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
