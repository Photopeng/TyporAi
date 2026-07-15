import { t } from '../../../i18n/i18n';
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
  type ScheduledAnimationFrame,
} from '../../../utils/animationFrame';
import { formatConversationDirectoryTitle } from '../utils/conversationDirectoryTitle';

type MessageRailEntry = {
  userEl: HTMLElement;
  title: string;
  prompt: string;
  response: string;
  files: string[];
  markerEl: HTMLButtonElement;
};

/** Message-level overview rail for jumping between user turns. */
export class NavigationSidebar {
  private readonly container: HTMLElement;
  private readonly railEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private entries: MessageRailEntry[] = [];
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pendingRefreshFrame: ScheduledAnimationFrame | null = null;
  private pendingScrollFrame: ScheduledAnimationFrame | null = null;
  private activeEntryIndex = -1;
  private previewEntryIndex = -1;

  constructor(
    private readonly parentEl: HTMLElement,
    private readonly messagesEl: HTMLElement,
  ) {
    this.container = this.parentEl.createDiv({ cls: 'typorai-message-rail' });
    this.container.setAttribute('aria-label', t('chat.nav.messageRail'));
    this.railEl = this.container.createDiv({ cls: 'typorai-message-rail-track' });
    this.previewEl = this.container.createDiv({ cls: 'typorai-message-rail-preview' });
    this.previewEl.setAttribute('role', 'tooltip');
    this.previewEl.setAttribute('aria-hidden', 'true');

    this.messagesEl.addEventListener('scroll', this.handleScroll, { passive: true });
    this.container.addEventListener('mouseleave', this.hidePreview);

    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => this.scheduleRefresh());
      this.mutationObserver.observe(this.messagesEl, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-toc-title', 'data-message-id', 'data-role'],
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
      this.resizeObserver.observe(this.messagesEl);
    }

    this.refresh();
  }

  updateVisibility(): void {
    this.scheduleRefresh();
  }

  private readonly handleScroll = (): void => {
    if (this.pendingScrollFrame !== null) return;
    this.pendingScrollFrame = scheduleAnimationFrame(() => {
      this.pendingScrollFrame = null;
      this.updateActiveEntry();
    }, this.messagesEl.ownerDocument.defaultView ?? null);
  };

  private readonly hidePreview = (): void => {
    this.previewEntryIndex = -1;
    this.container.classList.remove('typorai-message-rail--previewing');
    this.previewEl.setAttribute('aria-hidden', 'true');
  };

  private scheduleRefresh(): void {
    if (this.pendingRefreshFrame !== null) return;
    this.pendingRefreshFrame = scheduleAnimationFrame(() => {
      this.pendingRefreshFrame = null;
      this.refresh();
    }, this.messagesEl.ownerDocument.defaultView ?? null);
  }

  private refresh(): void {
    this.hidePreview();
    this.railEl.empty();
    const userElements = Array.from(
      this.messagesEl.querySelectorAll<HTMLElement>('.typorai-message-user, [data-role="user"]'),
    );
    const allMessages = Array.from(
      this.messagesEl.querySelectorAll<HTMLElement>('.typorai-message, [data-role]'),
    );

    this.entries = userElements.map((userEl, index) => {
      const prompt = this.getMessageText(userEl);
      const title = (userEl.getAttribute('data-toc-title') ?? '').trim()
        || formatConversationDirectoryTitle(prompt)
        || t('chat.nav.untitledMessage');
      const response = this.findResponseText(userEl, allMessages);
      const files = this.findFileNames(userEl);
      const markerEl = this.railEl.createEl('button', {
        cls: 'typorai-message-rail-marker',
        attr: {
          type: 'button',
          'aria-label': t('chat.nav.jumpToMessage', { index: index + 1, title }),
          'data-message-index': `${index}`,
        },
      });
      markerEl.createSpan({ cls: 'typorai-message-rail-line' });
      markerEl.addEventListener('click', () => this.scrollToElement(userEl));
      markerEl.addEventListener('mouseenter', () => this.showPreview(index));
      markerEl.addEventListener('focus', () => this.showPreview(index));
      markerEl.addEventListener('blur', (event) => {
        if (!this.container.contains(event.relatedTarget as Node | null)) this.hidePreview();
      });
      return { userEl, title, prompt, response, files, markerEl };
    });

    this.container.classList.toggle('typorai-message-rail--visible', this.entries.length > 0);
    this.updateActiveEntry();
  }

  private getMessageText(element: HTMLElement, excludeAuxiliary = false): string {
    const contentEl = element.querySelector<HTMLElement>('.typorai-message-content') ?? element;
    const readableEl = excludeAuxiliary ? contentEl.cloneNode(true) as HTMLElement : contentEl;
    if (excludeAuxiliary) {
      readableEl.querySelectorAll([
        '.typorai-thinking',
        '.typorai-thinking-block',
        '.typorai-tool-call',
        '.typorai-subagent-block',
        '.typorai-message-footer',
        '.typorai-baked-duration',
      ].join(',')).forEach(auxiliaryEl => auxiliaryEl.remove());
    }
    return (readableEl.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findResponseText(userEl: HTMLElement, allMessages: HTMLElement[]): string {
    const userIndex = allMessages.indexOf(userEl);
    if (userIndex < 0) return '';
    for (let index = userIndex + 1; index < allMessages.length; index++) {
      const candidate = allMessages[index];
      const role = candidate.getAttribute('data-role');
      if (role === 'user' || candidate.classList.contains('typorai-message-user')) break;
      if (role === 'assistant' || candidate.classList.contains('typorai-message-assistant')) {
        return this.getMessageText(candidate, true);
      }
    }
    return '';
  }

  private findFileNames(userEl: HTMLElement): string[] {
    const scope = userEl.closest<HTMLElement>('.typorai-message-user-stack') ?? userEl;
    return Array.from(scope.querySelectorAll<HTMLElement>('.typorai-file-chip, .typorai-message-image'))
      .map(element => (
        element.getAttribute('data-file-name')
        ?? element.getAttribute('alt')
        ?? element.textContent
        ?? ''
      ).trim())
      .filter(Boolean);
  }

  private showPreview(index: number): void {
    const entry = this.entries[index];
    if (!entry) return;
    this.previewEntryIndex = index;
    this.previewEl.empty();
    this.previewEl.createDiv({ cls: 'typorai-message-rail-preview-title', text: entry.title });
    if (entry.prompt && entry.prompt !== entry.title) {
      this.previewEl.createDiv({ cls: 'typorai-message-rail-preview-prompt', text: entry.prompt });
    }
    this.previewEl.createDiv({
      cls: 'typorai-message-rail-preview-response',
      text: entry.response || t('chat.nav.awaitingResponse'),
    });
    if (entry.files.length > 0) {
      const filesEl = this.previewEl.createDiv({ cls: 'typorai-message-rail-preview-files' });
      filesEl.createSpan({ cls: 'typorai-message-rail-preview-file', text: entry.files[0] });
      if (entry.files.length > 1) {
        filesEl.createSpan({
          cls: 'typorai-message-rail-preview-file-count',
          text: t('chat.nav.moreFiles', { count: entry.files.length - 1 }),
        });
      }
    }

    const markerTop = entry.markerEl.offsetTop + (entry.markerEl.offsetHeight / 2);
    const previewHeight = this.previewEl.offsetHeight || 112;
    const containerTop = this.container.getBoundingClientRect().top;
    const viewportHeight = this.messagesEl.ownerDocument.defaultView?.innerHeight
      ?? this.messagesEl.clientHeight
      ?? 320;
    const minimumTop = 8 - containerTop;
    const maximumTop = viewportHeight - containerTop - previewHeight - 8;
    const previewTop = Math.max(minimumTop, Math.min(markerTop - (previewHeight / 2), maximumTop));
    this.previewEl.style.top = `${previewTop}px`;
    this.previewEl.setAttribute('aria-hidden', 'false');
    this.container.classList.add('typorai-message-rail--previewing');
  }

  private updateActiveEntry(): void {
    if (this.entries.length === 0) return;
    const readingLine = this.messagesEl.scrollTop + Math.min(this.messagesEl.clientHeight * 0.24, 180);
    let activeIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;
    this.entries.forEach((entry, index) => {
      const distance = Math.abs(entry.userEl.offsetTop - readingLine);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        activeIndex = index;
      }
    });
    if (activeIndex === this.activeEntryIndex) return;
    this.entries[this.activeEntryIndex]?.markerEl.classList.remove('typorai-message-rail-marker--active');
    this.activeEntryIndex = activeIndex;
    this.entries[activeIndex]?.markerEl.classList.add('typorai-message-rail-marker--active');
    this.container.setAttribute('data-active-message-index', `${activeIndex}`);
  }

  private scrollToElement(element: HTMLElement): void {
    this.messagesEl.scrollTo({
      top: Math.max(element.offsetTop - 16, 0),
      behavior: 'smooth',
    });
  }

  destroy(): void {
    if (this.pendingRefreshFrame !== null) cancelScheduledAnimationFrame(this.pendingRefreshFrame);
    if (this.pendingScrollFrame !== null) cancelScheduledAnimationFrame(this.pendingScrollFrame);
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.messagesEl.removeEventListener('scroll', this.handleScroll);
    this.container.removeEventListener('mouseleave', this.hidePreview);
    this.container.remove();
  }
}
