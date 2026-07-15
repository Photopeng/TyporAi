import type { NoticeType } from '../shared/types';

export interface NoticeAdapter {
  show(message: string, type?: NoticeType, durationMs?: number): void;
  dispose?(): void;
}

export class ToastNoticeAdapter implements NoticeAdapter {
  private container: HTMLElement | null = null;

  show(message: string, type: NoticeType = 'info', durationMs = 3000): void {
    const toast = document.createElement('div');
    toast.className = `typora-ai-toast typora-ai-toast-${type}`;
    toast.textContent = message;
    this.getContainer().appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
      if (this.container && this.container.childElementCount === 0) {
        this.container.remove();
        this.container = null;
      }
    }, durationMs);
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
  }

  private getContainer(): HTMLElement {
    if (this.container) return this.container;

    const container = document.createElement('div');
    container.className = 'typora-ai-toast-container';
    document.body.appendChild(container);
    this.container = container;
    return container;
  }
}
