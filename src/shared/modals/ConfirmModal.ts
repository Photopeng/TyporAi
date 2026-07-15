import { NativeModal } from '@/ui/NativeModal';

import { t } from '../../i18n/i18n';

export function confirmDelete(_app: unknown, message: string): Promise<boolean> {
  return new Promise(resolve => {
    new ConfirmModal(message, resolve).open();
  });
}

export function confirm(_app: unknown, message: string, confirmText: string): Promise<boolean> {
  return new Promise(resolve => {
    new ConfirmModal(message, resolve, confirmText).open();
  });
}

class ConfirmModal extends NativeModal {
  private message: string;
  private resolve: (confirmed: boolean) => void;
  private resolved = false;
  private confirmText: string;

  constructor(message: string, resolve: (confirmed: boolean) => void, confirmText?: string) {
    super();
    this.message = message;
    this.resolve = resolve;
    this.confirmText = confirmText ?? t('common.delete');
  }

  onOpen() {
    this.setTitle(t('common.confirm'));
    this.modalEl.classList.add('typorai-confirm-modal');
    const messageEl = document.createElement('p');
    messageEl.textContent = this.message;
    const actions = document.createElement('div');
    actions.className = 'typorai-modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('common.cancel');
    cancel.addEventListener('click', () => this.close());
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'mod-warning';
    confirmButton.textContent = this.confirmText;
    confirmButton.addEventListener('click', () => {
      this.resolved = true;
      this.resolve(true);
      this.close();
    });
    actions.append(cancel, confirmButton);
    this.contentEl.append(messageEl, actions);
  }

  onClose() {
    if (!this.resolved) {
      this.resolve(false);
    }
    this.contentEl.replaceChildren();
  }
}
