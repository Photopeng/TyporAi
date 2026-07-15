import { ModalController } from './ModalController';

export abstract class NativeModal {
  protected contentEl!: HTMLElement;
  protected modalEl!: HTMLElement;

  private readonly controller = new ModalController();
  private title = 'TyporAi';

  open(): void {
    this.contentEl = document.createElement('div');
    this.modalEl = this.controller.open(this.contentEl, this.title, {
      onClose: () => this.onClose(),
    });
    this.onOpen();
  }

  close(): void {
    this.controller.close();
  }

  protected setTitle(title: string): void {
    this.title = title;
    if (!this.contentEl) return;
    this.modalEl.setAttribute('aria-label', title);
    const heading = document.createElement('h2');
    heading.className = 'typorai-modal-title';
    heading.textContent = title;
    this.contentEl.prepend(heading);
  }

  protected abstract onOpen(): void;
  protected abstract onClose(): void;
}
