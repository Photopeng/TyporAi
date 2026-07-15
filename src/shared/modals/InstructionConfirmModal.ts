/**
 * TyporAi - Instruction modal
 *
 * Unified modal that handles all instruction mode states:
 * - Loading (initial processing)
 * - Clarification (agent asks question)
 * - Confirmation (final instruction review)
 */

import { t } from '../../i18n/i18n';
import { appendElement } from '../../ui/dom';
import { NativeModal } from '../../ui/NativeModal';

export type InstructionDecision = 'accept' | 'reject';

type ModalState = 'loading' | 'clarification' | 'confirmation';

export interface InstructionModalCallbacks {
  onAccept: (finalInstruction: string) => void;
  onReject: () => void;
  onClarificationSubmit: (response: string) => Promise<void>;
}

export class InstructionModal extends NativeModal {
  private rawInstruction: string;
  private callbacks: InstructionModalCallbacks;
  private state: ModalState = 'loading';
  private resolved = false;

  // UI elements
  private contentSectionEl: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private clarificationEl: HTMLElement | null = null;
  private confirmationEl: HTMLElement | null = null;
  private buttonsEl: HTMLElement | null = null;

  // Clarification state
  private clarificationTextEl: HTMLElement | null = null;
  private responseTextarea: HTMLTextAreaElement | null = null;
  private isSubmitting = false;

  // Confirmation state
  private refinedInstruction: string = '';
  private editTextarea: HTMLTextAreaElement | null = null;
  private isEditing = false;
  private refinedDisplayEl: HTMLElement | null = null;
  private editContainerEl: HTMLElement | null = null;
  private editBtnEl: HTMLButtonElement | null = null;

  constructor(
    _app: unknown,
    rawInstruction: string,
    callbacks: InstructionModalCallbacks
  ) {
    super();
    this.rawInstruction = rawInstruction;
    this.callbacks = callbacks;
  }

  protected onOpen() {
    const { contentEl } = this;
    contentEl.classList.add('typorai-instruction-modal');
    this.setTitle(t('modal.instruction.titleAdd'));

    // User input section (always visible)
    const inputSection = appendElement(contentEl, 'div', { className: 'typorai-instruction-section' });
    appendElement(inputSection, 'div', { className: 'typorai-instruction-label', text: t('modal.instruction.yourInput') });
    appendElement(inputSection, 'div', { className: 'typorai-instruction-original', text: this.rawInstruction });

    // Main content section (changes based on state)
    this.contentSectionEl = appendElement(contentEl, 'div', { className: 'typorai-instruction-content-section' });

    // Loading state
    this.loadingEl = appendElement(this.contentSectionEl, 'div', { className: 'typorai-instruction-loading' });
    appendElement(this.loadingEl, 'div', { className: 'typorai-instruction-spinner' });
    appendElement(this.loadingEl, 'span', { text: t('modal.instruction.processing') });

    // Clarification state (hidden initially)
    this.clarificationEl = appendElement(this.contentSectionEl, 'div', { className: 'typorai-instruction-clarification-section typorai-hidden' });
    this.clarificationTextEl = appendElement(this.clarificationEl, 'div', { className: 'typorai-instruction-clarification' });

    const responseSection = appendElement(this.clarificationEl, 'div', { className: 'typorai-instruction-section' });
    appendElement(responseSection, 'div', { className: 'typorai-instruction-label', text: t('modal.instruction.yourResponse') });

    this.responseTextarea = appendElement(responseSection, 'textarea', { className: 'typorai-instruction-response-textarea', attributes: { placeholder: t('modal.instruction.placeholder'), rows: '3' } });

    this.responseTextarea.addEventListener('keydown', (e) => {
      // Check !e.isComposing for IME support (Chinese, Japanese, Korean, etc.)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !this.isSubmitting) {
        e.preventDefault();
        void this.submitClarification();
      }
    });

    // Confirmation state (hidden initially)
    this.confirmationEl = appendElement(this.contentSectionEl, 'div', { className: 'typorai-instruction-confirmation-section typorai-hidden' });

    // Refined instruction display/edit
    const refinedSection = appendElement(this.confirmationEl, 'div', { className: 'typorai-instruction-section' });
    appendElement(refinedSection, 'div', { className: 'typorai-instruction-label', text: t('modal.instruction.refinedSnippet') });

    this.refinedDisplayEl = appendElement(refinedSection, 'div', { className: 'typorai-instruction-refined' });
    this.editContainerEl = appendElement(refinedSection, 'div', { className: 'typorai-instruction-edit-container typorai-hidden' });

    this.editTextarea = appendElement(this.editContainerEl, 'textarea', { className: 'typorai-instruction-edit-textarea', attributes: { rows: '4' } });

    // Buttons (changes based on state)
    this.buttonsEl = appendElement(contentEl, 'div', { className: 'typorai-instruction-buttons' });
    this.updateButtons();

    this.showState('loading');
  }

  showClarification(clarification: string) {
    if (this.clarificationTextEl) {
      this.clarificationTextEl.textContent = clarification;
    }
    if (this.responseTextarea) {
      this.responseTextarea.value = '';
    }
    this.isSubmitting = false;
    this.showState('clarification');
    this.responseTextarea?.focus();
  }

  showConfirmation(refinedInstruction: string) {
    this.refinedInstruction = refinedInstruction;

    if (this.refinedDisplayEl) {
      this.refinedDisplayEl.textContent = refinedInstruction;
    }
    if (this.editTextarea) {
      this.editTextarea.value = refinedInstruction;
    }

    this.showState('confirmation');
  }

  showError(error: string) {
    // Just close - the error notice will be shown by caller
    this.resolved = true;
    this.close();
  }

  showClarificationLoading() {
    this.isSubmitting = true;
    if (this.loadingEl) {
      this.loadingEl.querySelector('.typorai-instruction-spinner');
      const text = this.loadingEl.querySelector('span');
      if (text) text.textContent = t('modal.instruction.processingInline');
    }
    this.showState('loading');
  }

  private showState(state: ModalState) {
    this.state = state;

    if (this.loadingEl) {
      this.loadingEl.classList.toggle('typorai-hidden', state !== 'loading');
    }
    if (this.clarificationEl) {
      this.clarificationEl.classList.toggle('typorai-hidden', state !== 'clarification');
    }
    if (this.confirmationEl) {
      this.confirmationEl.classList.toggle('typorai-hidden', state !== 'confirmation');
    }

    this.updateButtons();
  }

  private updateButtons() {
    if (!this.buttonsEl) return;
    this.buttonsEl.replaceChildren();

    const cancelBtn = appendElement(this.buttonsEl, 'button', {
      text: t('modal.instruction.cancel'),
      className: 'typorai-instruction-btn typorai-instruction-reject-btn',
      attributes: { 'aria-label': t('modal.instruction.cancelAria') },
    });
    cancelBtn.addEventListener('click', () => this.handleReject());

    if (this.state === 'clarification') {
      const submitBtn = appendElement(this.buttonsEl, 'button', {
        text: t('modal.instruction.submit'),
        className: 'typorai-instruction-btn typorai-instruction-accept-btn',
        attributes: { 'aria-label': t('modal.instruction.submitAria') },
      });
      submitBtn.addEventListener('click', () => {
        void this.submitClarification();
      });
    } else if (this.state === 'confirmation') {
      this.editBtnEl = appendElement(this.buttonsEl, 'button', {
        text: t('modal.instruction.edit'),
        className: 'typorai-instruction-btn typorai-instruction-edit-btn',
        attributes: { 'aria-label': t('modal.instruction.editAria') },
      });
      this.editBtnEl.addEventListener('click', () => this.toggleEdit());

      const acceptBtn = appendElement(this.buttonsEl, 'button', {
        text: t('modal.instruction.accept'),
        className: 'typorai-instruction-btn typorai-instruction-accept-btn',
        attributes: { 'aria-label': t('modal.instruction.acceptAria') },
      });
      acceptBtn.addEventListener('click', () => this.handleAccept());
      acceptBtn.focus();
    }
  }

  private async submitClarification() {
    const response = this.responseTextarea?.value.trim();
    if (!response || this.isSubmitting) return;

    this.showClarificationLoading();

    try {
      await this.callbacks.onClarificationSubmit(response);
    } catch {
      // On error, go back to clarification state
      this.isSubmitting = false;
      this.showState('clarification');
    }
  }

  private toggleEdit() {
    this.isEditing = !this.isEditing;

    if (this.isEditing) {
      this.refinedDisplayEl?.classList.add('typorai-hidden');
      this.editContainerEl?.classList.remove('typorai-hidden');
      if (this.editBtnEl) this.editBtnEl.textContent = t('modal.instruction.preview');
      this.editTextarea?.focus();
    } else {
      const edited = this.editTextarea?.value || this.refinedInstruction;
      this.refinedInstruction = edited;
      if (this.refinedDisplayEl) {
        this.refinedDisplayEl.textContent = edited;
        this.refinedDisplayEl.classList.remove('typorai-hidden');
      }
      this.editContainerEl?.classList.add('typorai-hidden');
      if (this.editBtnEl) this.editBtnEl.textContent = t('modal.instruction.edit');
    }
  }

  private handleAccept() {
    if (this.resolved) return;
    this.resolved = true;

    const finalInstruction = this.isEditing
      ? (this.editTextarea?.value || this.refinedInstruction)
      : this.refinedInstruction;

    this.callbacks.onAccept(finalInstruction);
    this.close();
  }

  private handleReject() {
    if (this.resolved) return;
    this.resolved = true;
    this.callbacks.onReject();
    this.close();
  }

  protected onClose() {
    if (!this.resolved) {
      this.resolved = true;
      this.callbacks.onReject();
    }
    this.contentEl.replaceChildren();
  }
}
