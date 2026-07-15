import { setIcon } from './Icon';

export class ContextMenuItem {
  private title = '';
  private icon = '';
  private click: (() => void) | null = null;
  setTitle(title: string): this { this.title = title; return this; }
  setIcon(icon: string): this { this.icon = icon; return this; }
  onClick(callback: () => void): this { this.click = callback; return this; }
  render(owner: Document, close: () => void): HTMLButtonElement {
    const button = owner.createElement('button');
    button.type = 'button';
    button.className = 'typorai-context-menu-item';
    if (this.icon) setIcon(button, this.icon);
    const label = owner.createElement('span');
    label.textContent = this.title;
    button.append(label);
    button.addEventListener('click', () => { close(); this.click?.(); });
    return button;
  }
}

export class ContextMenu {
  private readonly items: ContextMenuItem[] = [];
  private element: HTMLElement | null = null;
  private cleanup: (() => void) | null = null;
  addItem(configure: (item: ContextMenuItem) => void): this {
    const item = new ContextMenuItem();
    configure(item);
    this.items.push(item);
    return this;
  }
  showAtMouseEvent(event: MouseEvent): void {
    this.hide();
    const owner = (event.currentTarget as Node | null)?.ownerDocument ?? document;
    const menu = owner.createElement('div');
    menu.className = 'typorai-context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    for (const item of this.items) menu.append(item.render(owner, () => this.hide()));
    owner.body.append(menu);
    const dismiss = (dismissEvent: Event): void => {
      if (dismissEvent instanceof KeyboardEvent && dismissEvent.key !== 'Escape') return;
      if (typeof PointerEvent !== 'undefined' && dismissEvent instanceof PointerEvent
        && menu.contains(dismissEvent.target as Node)) return;
      this.hide();
    };
    owner.addEventListener('keydown', dismiss);
    owner.addEventListener('pointerdown', dismiss);
    this.cleanup = () => {
      owner.removeEventListener('keydown', dismiss);
      owner.removeEventListener('pointerdown', dismiss);
    };
    this.element = menu;
  }
  hide(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.element?.remove();
    this.element = null;
  }
}
