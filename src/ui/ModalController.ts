import { DisposableBag } from './DisposableBag';

export interface ModalControllerOptions {
  dialogClass?: string;
  id?: string;
  onClose?: () => void;
  overlayClass?: string;
}

export class ModalController {
  private overlay: HTMLElement | null = null;
  private bag = new DisposableBag();
  private onClose: (() => void) | null = null;

  open(content: Node, label: string, options: ModalControllerOptions = {}): HTMLElement {
    this.close();
    this.bag = new DisposableBag();
    const overlay = document.createElement('div');
    overlay.className = options.overlayClass ?? 'typorai-modal-overlay';
    if (options.id) overlay.id = options.id;
    overlay.setAttribute('role', 'presentation');
    const dialog = document.createElement('section');
    dialog.className = options.dialogClass ?? 'typorai-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', label);
    dialog.tabIndex = -1;
    dialog.append(content);
    overlay.append(dialog);
    document.body.append(overlay);
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
    document.addEventListener('keydown', keydown);
    overlay.addEventListener('click', event => { if (event.target === overlay) this.close(); });
    this.bag.add(() => document.removeEventListener('keydown', keydown));
    this.overlay = overlay;
    this.onClose = options.onClose ?? null;
    dialog.focus();
    return dialog;
  }

  close(): void {
    if (!this.overlay) return;
    this.bag.dispose();
    this.overlay.remove();
    this.overlay = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
  }
}
