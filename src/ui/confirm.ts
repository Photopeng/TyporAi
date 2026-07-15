import { ModalController } from './ModalController';

export function confirmAction(message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.className = 'typorai-confirm-dialog';
    const text = document.createElement('p');
    text.textContent = message;
    const buttons = document.createElement('div');
    buttons.className = 'typorai-modal-buttons';
    const cancel = document.createElement('button');
    cancel.textContent = cancelLabel;
    const confirm = document.createElement('button');
    confirm.textContent = confirmLabel;
    confirm.className = 'mod-warning';
    buttons.append(cancel, confirm);
    content.append(text, buttons);
    const modal = new ModalController();
    let settled = false;
    const finish = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(confirmed);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    modal.open(content, message, { onClose: () => finish(false) });
  });
}
