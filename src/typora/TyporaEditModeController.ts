import { ToastNoticeAdapter } from '../adapters/notice';
import { resolveEditModeProviderId } from '../core/providers/editModeRouting';
import { ProviderRegistry } from '../core/providers/ProviderRegistry';
import type {
  InlineEditResult,
  InlineEditService,
  ProviderId,
  ProviderServiceFactory,
} from '../core/providers/types';
import { isDocumentEditingAllowed } from '../core/security/documentEditing';
import { t } from '../i18n/i18n';
import type TyporAiPlugin from '../main';
import { TyporaEditorApi } from './editor-api';

export type EditBlockStatus = 'generating' | 'previewing' | 'accepted' | 'rejected';

export interface EditBlock {
  id: string;
  status: EditBlockStatus;
  anchorEl: HTMLElement;
  originalText: string;
  proposedText: string;
  instruction: string;
  suggestionEl: HTMLElement;
}

export interface TyporaEditModeState {
  activeBlockId: string | null;
  blocks: EditBlock[];
  error?: string;
  isPrompting: boolean;
}

interface PendingTarget {
  mode: 'selection' | 'cursor';
  originalText: string;
  range: Range | null;
}

const EDIT_BLOCK_ATTR = 'data-typorai-edit-id';

export class TyporaEditModeController {
  private readonly editor = new TyporaEditorApi();
  private service: InlineEditService | null = null;
  private serviceProviderId: ProviderId | null = null;
  private readonly blocks = new Map<string, EditBlock>();
  private promptEl: HTMLElement | null = null;
  private instructionInputEl: HTMLInputElement | null = null;
  private activeBlockId: string | null = null;
  private lastError: string | undefined;
  private generationInFlight: Promise<void> | null = null;
  private readonly pointerdownHandler = (event: PointerEvent) => this.handleDocumentPointerDown(event);

  constructor(
    private readonly plugin: TyporAiPlugin,
    private readonly mountEl: HTMLElement = document.body,
    private readonly resolveCurrentProviderId?: () => ProviderId | undefined,
    private readonly providerServiceFactory?: ProviderServiceFactory,
  ) {}

  start(instruction?: string): void {
    if (!this.ensureDocumentEditingAllowed()) return;
    const target = this.captureTarget();
    if (instruction?.trim()) {
      void this.generateBlock(instruction, target);
      return;
    }

    this.showPrompt(target);
  }

  async preview(instruction?: string): Promise<void> {
    if (!this.ensureDocumentEditingAllowed()) return;
    const target = this.captureTarget();
    await this.generateBlock(instruction ?? this.instructionInputEl?.value ?? '', target);
  }

  apply(blockId = this.activeBlockId ?? undefined): void {
    if (!this.ensureDocumentEditingAllowed()) return;
    if (blockId) {
      this.accept(blockId);
    }
  }

  discard(blockId = this.activeBlockId ?? undefined): void {
    if (blockId) {
      this.reject(blockId);
      return;
    }

    this.getService().cancel();
    this.closePrompt();
  }

  accept(blockId: string): void {
    if (!this.ensureDocumentEditingAllowed()) return;
    const block = this.blocks.get(blockId);
    if (!block || block.status !== 'previewing') {
      return;
    }

    this.syncBlockFromDom(block);
    block.status = 'accepted';
    block.anchorEl.replaceWith(document.createTextNode(block.proposedText));
    this.blocks.delete(blockId);
    this.activeBlockId = this.blocks.keys().next().value ?? null;
  }

  reject(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block) {
      return;
    }

    block.status = 'rejected';
    block.anchorEl.replaceWith(document.createTextNode(block.originalText));
    this.blocks.delete(blockId);
    this.activeBlockId = this.blocks.keys().next().value ?? null;
  }

  async refineBlock(blockId: string, instruction: string): Promise<void> {
    if (!this.ensureDocumentEditingAllowed()) return;
    const block = this.blocks.get(blockId);
    const trimmedInstruction = instruction.trim();
    if (!block || !trimmedInstruction) {
      return;
    }

    const selected = this.getSuggestionSelection(block);
    if (!selected) {
      this.lastError = t('inlineEdit.errors.selectSuggestionToRefine');
      return;
    }

    const result = await this.getService().editText({
      mode: 'selection',
      instruction: trimmedInstruction,
      notePath: this.editor.getSnapshot().currentFilePath ?? 'untitled.md',
      selectedText: selected.text,
    });
    if (!result.success) {
      this.lastError = result.error ?? t('inlineEdit.errors.refineFailed');
      return;
    }

    const refinedText = result.editedText ?? result.insertedText ?? result.clarification ?? '';
    if (!refinedText) {
      this.lastError = t('inlineEdit.errors.refineNoReplacement');
      return;
    }

    selected.range.deleteContents();
    selected.range.insertNode(document.createTextNode(refinedText));
    this.normalizeSuggestionTextNodes(block.suggestionEl);
    this.syncBlockFromDom(block);
  }

  destroy(): void {
    this.service?.cancel();
    this.closePrompt();
    for (const block of [...this.blocks.values()]) {
      block.anchorEl.remove();
    }
    this.blocks.clear();
    this.activeBlockId = null;
  }

  getState(): TyporaEditModeState {
    return {
      activeBlockId: this.activeBlockId,
      blocks: [...this.blocks.values()],
      error: this.lastError,
      isPrompting: !!this.promptEl,
    };
  }

  private async generateBlock(instruction: string, target: PendingTarget): Promise<void> {
    if (!this.ensureDocumentEditingAllowed()) return;
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      this.lastError = t('inlineEdit.errors.enterInstruction');
      this.surfaceError();
      return;
    }

    // Nested-edit mutex: if a generation is already in flight, refuse to
    // start a second one. The user can either wait for it to finish or
    // accept/reject the existing suggestion.
    if (this.generationInFlight) {
      this.lastError = t('inlineEdit.errors.generationFailed');
      this.surfaceError();
      return;
    }

    this.closePrompt();
    this.lastError = undefined;
    const id = this.createBlockId();
    const block = this.renderBlock({
      id,
      instruction: trimmedInstruction,
      originalText: target.originalText,
      proposedText: t('inlineEdit.generating'),
      range: target.range,
      status: 'generating',
    });

    const run = (async () => {
      let result: InlineEditResult;
      try {
        result = await this.requestEdit(trimmedInstruction, target);
      } catch (error) {
        this.lastError = (error as Error)?.message ?? t('inlineEdit.errors.generationFailed');
        block.status = 'previewing';
        block.proposedText = this.lastError;
        block.suggestionEl.textContent = this.lastError;
        this.surfaceError();
        return;
      }

      if (!result.success) {
        block.status = 'previewing';
        block.proposedText = result.error ?? t('inlineEdit.errors.generationFailed');
        block.suggestionEl.textContent = block.proposedText;
        this.lastError = block.proposedText;
        this.surfaceError();
        return;
      }

      const proposedText = result.editedText ?? result.insertedText ?? result.clarification ?? '';
      if (!proposedText) {
        block.status = 'previewing';
        block.proposedText = t('inlineEdit.errors.noReplacement');
        block.suggestionEl.textContent = block.proposedText;
        this.lastError = block.proposedText;
        this.surfaceError();
        return;
      }

      block.status = 'previewing';
      block.proposedText = proposedText;
      block.suggestionEl.textContent = proposedText;
    })();
    this.generationInFlight = run;
    try {
      await run;
    } finally {
      this.generationInFlight = null;
    }
  }

  private surfaceError(): void {
    const message = this.lastError;
    if (!message) {
      return;
    }
    // Surface through the same toast sink as `Notice` so users see the
    // error even if the host environment is not Typora. We instantiate
    // a fresh adapter per call so the surface is available without the
    // caller (e.g. the headless test environment) wiring a singleton.
    try {
      new ToastNoticeAdapter().show(message, 'error', 4000);
    } catch {
      // If the toast adapter throws (e.g. no `document.body` in a
      // headless test), the `lastError` field is still populated so the
      // next `getState()` can surface it to UI code.
    }
  }

  private ensureDocumentEditingAllowed(): boolean {
    if (isDocumentEditingAllowed(this.plugin.settings.permissionMode)) return true;
    this.lastError = t('inlineEdit.errors.documentEditingBlocked');
    this.surfaceError();
    return false;
  }

  private async requestEdit(instruction: string, target: PendingTarget): Promise<InlineEditResult> {
    const snapshot = this.editor.getSnapshot();
    const notePath = snapshot.currentFilePath ?? 'untitled.md';

    if (target.mode === 'selection') {
      return await this.getService().editText({
        mode: 'selection',
        instruction,
        notePath,
        selectedText: target.originalText,
      });
    }

    return await this.getService().editText({
      mode: 'cursor',
      instruction,
      notePath,
      cursorContext: this.editor.getCursorContext(),
    });
  }

  private captureTarget(): PendingTarget {
    // Data-source consistency fix (report §3.2): use the Typora-aware
    // `editor.getSelection()` as the single source of truth. It transparently
    // falls back to `window.getSelection().toString()` when the host file
    // API is not present, so the controller's behavior is identical to the
    // previous code path but no longer mixes two independent sources.
    const selectionText = this.editor.getSelection();
    const trimmed = selectionText.trim();

    if (!trimmed) {
      return { mode: 'cursor', originalText: '', range: null };
    }

    // Best-effort range cloning for in-place insertion. If the DOM
    // selection is empty (e.g. tests, or Typora's `selectionchange`
    // clearing during a paste), we still trust the editor-reported text
    // and the renderBlock will fall back to appending the wrapper at the
    // mount element — which matches the legacy fallback behavior
    // documented in report §2.4.
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).cloneRange()
      : null;
    return {
      mode: 'selection',
      originalText: selectionText,
      range,
    };
  }

  private showPrompt(target: PendingTarget): void {
    this.closePrompt();

    const prompt = document.createElement('form');
    prompt.className = 'typora-edit-mode-prompt';
    prompt.setAttribute('aria-label', t('inlineEdit.prompt.ariaLabel'));

    const input = document.createElement('input');
    input.className = 'typora-edit-mode-prompt-input';
    input.placeholder = t('inlineEdit.prompt.placeholder');
    input.type = 'text';

    const submit = document.createElement('button');
    submit.className = 'typora-edit-mode-prompt-submit';
    submit.type = 'submit';
    submit.textContent = t('inlineEdit.prompt.send');

    prompt.append(input, submit);
    prompt.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.generateBlock(input.value, target);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closePrompt();
      }
    });

    this.getPromptMountEl().appendChild(prompt);
    this.promptEl = prompt;
    this.instructionInputEl = input;
    document.addEventListener('pointerdown', this.pointerdownHandler, true);
    input.focus();
  }

  private closePrompt(): void {
    document.removeEventListener('pointerdown', this.pointerdownHandler, true);
    this.promptEl?.remove();
    this.promptEl = null;
    this.instructionInputEl = null;
  }

  private handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (!this.promptEl || (target && this.promptEl.contains(target))) {
      return;
    }

    this.closePrompt();
  }

  private renderBlock(options: {
    id: string;
    instruction: string;
    originalText: string;
    proposedText: string;
    range: Range | null;
    status: EditBlockStatus;
  }): EditBlock {
    const wrapper = document.createElement('section');
    wrapper.className = 'typora-edit-block';
    wrapper.setAttribute(EDIT_BLOCK_ATTR, options.id);

    const original = document.createElement('div');
    original.className = 'typora-edit-block-original';
    original.textContent = options.originalText || '(insert at cursor)';

    const suggestion = document.createElement('div');
    suggestion.className = 'typora-edit-block-suggestion';
    suggestion.contentEditable = 'true';
    suggestion.textContent = options.proposedText;

    const actions = document.createElement('div');
    actions.className = 'typora-edit-block-actions';
    const acceptButton = document.createElement('button');
    acceptButton.type = 'button';
    acceptButton.textContent = t('inlineEdit.actions.accept');
    acceptButton.addEventListener('click', () => this.accept(options.id));
    const refineButton = document.createElement('button');
    refineButton.type = 'button';
    refineButton.textContent = t('inlineEdit.actions.refine');
    refineButton.addEventListener('click', () => {
      const instruction = window.prompt?.(t('inlineEdit.actions.refinePrompt')) ?? '';
      void this.refineBlock(options.id, instruction);
    });
    const rejectButton = document.createElement('button');
    rejectButton.type = 'button';
    rejectButton.textContent = t('inlineEdit.actions.reject');
    rejectButton.addEventListener('click', () => this.reject(options.id));
    actions.append(acceptButton, refineButton, rejectButton);

    wrapper.append(original, suggestion, actions);

    const block: EditBlock = {
      id: options.id,
      status: options.status,
      anchorEl: wrapper,
      originalText: options.originalText,
      proposedText: options.proposedText,
      instruction: options.instruction,
      suggestionEl: suggestion,
    };

    suggestion.addEventListener('input', () => this.syncBlockFromDom(block));

    if (options.range) {
      options.range.deleteContents();
      options.range.insertNode(wrapper);
    } else {
      this.mountEl.appendChild(wrapper);
    }

    this.blocks.set(options.id, block);
    this.activeBlockId = options.id;
    return block;
  }

  private getSuggestionSelection(block: EditBlock): { range: Range; text: string } | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (
      !block.suggestionEl.contains(range.commonAncestorContainer)
      && range.commonAncestorContainer !== block.suggestionEl
    ) {
      return null;
    }

    const text = selection.toString();
    return text ? { range: range.cloneRange(), text } : null;
  }

  private syncBlockFromDom(block: EditBlock): void {
    block.proposedText = block.suggestionEl.innerText || block.suggestionEl.textContent || '';
  }

  private normalizeSuggestionTextNodes(element: HTMLElement): void {
    element.normalize();
  }

  private createBlockId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private getService(): InlineEditService {
    const providerId = resolveEditModeProviderId(
      this.plugin,
      this.resolveCurrentProviderId?.()
        ?? ProviderRegistry.resolveSettingsProviderId(this.plugin.settings as Record<string, unknown>),
    );
    if (!providerId) {
      throw new Error(t('inlineEdit.errors.noCliProvider'));
    }
    if (!this.service || this.serviceProviderId !== providerId) {
      this.service?.cancel();
      this.service = this.providerServiceFactory
        ? this.providerServiceFactory.createInlineEditService(this.plugin, providerId)
        : ProviderRegistry.createInlineEditService(this.plugin, providerId);
      this.serviceProviderId = providerId;
    }
    return this.service;
  }

  private getPromptMountEl(): HTMLElement {
    return document.body ?? this.mountEl;
  }
}
