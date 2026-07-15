import type { NotificationService } from '@/core/ports';

import { DisposableBag } from './DisposableBag';

export class NoticeAdapter implements NotificationService {
  show(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (typeof document === 'undefined' || !document.body) return;
    const notice = document.createElement('div');
    notice.className = `typorai-notice typorai-notice--${level}`;
    notice.setAttribute('role', level === 'error' ? 'alert' : 'status');
    notice.textContent = message;
    document.body.append(notice);
    const bag = new DisposableBag();
    const timer = window.setTimeout(() => { bag.dispose(); notice.remove(); }, 4000);
    bag.add(() => window.clearTimeout(timer));
    notice.addEventListener('click', () => { bag.dispose(); notice.remove(); }, { once: true });
  }
}
