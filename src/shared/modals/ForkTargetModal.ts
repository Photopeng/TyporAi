import { NativeModal } from '@/ui/NativeModal';

import { t } from '../../i18n/i18n';

export type ForkTarget = 'new-tab' | 'current-tab';

export function chooseForkTarget(_app?: unknown): Promise<ForkTarget | null> {
  return new Promise(resolve => {
    new ForkTargetModal(resolve).open();
  });
}

class ForkTargetModal extends NativeModal {
  private resolve: (target: ForkTarget | null) => void;
  private resolved = false;

  constructor(resolve: (target: ForkTarget | null) => void) {
    super();
    this.resolve = resolve;
  }

  onOpen() {
    this.setTitle(t('chat.fork.chooseTarget'));
    this.modalEl.classList.add('typorai-fork-target-modal');

    const list = document.createElement('div');
    list.className = 'typorai-fork-target-list';
    this.contentEl.append(list);

    this.createOption(list, 'current-tab', t('chat.fork.targetCurrentTab'));
    this.createOption(list, 'new-tab', t('chat.fork.targetNewTab'));
  }

  private createOption(container: HTMLElement, target: ForkTarget, label: string): void {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'typorai-fork-target-option';
    item.textContent = label;
    container.append(item);
    item.addEventListener('click', () => {
      this.resolved = true;
      this.resolve(target);
      this.close();
    });
  }

  onClose() {
    if (!this.resolved) {
      this.resolve(null);
    }
    this.contentEl.replaceChildren();
  }
}
