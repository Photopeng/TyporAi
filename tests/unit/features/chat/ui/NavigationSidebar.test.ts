/** @jest-environment jsdom */

import { NavigationSidebar } from '@/features/chat/ui/NavigationSidebar';
import { installTyporaDomHelpers } from '@/typora/dom-helpers';

describe('NavigationSidebar message rail', () => {
  let parentEl: HTMLElement;
  let messagesEl: HTMLElement;
  let sidebar: NavigationSidebar | null;
  let scrollTo: jest.Mock;

  beforeAll(() => installTyporaDomHelpers());

  beforeEach(() => {
    parentEl = document.createElement('div');
    messagesEl = document.createElement('div');
    parentEl.append(messagesEl);
    document.body.append(parentEl);
    scrollTo = jest.fn(({ top }: { top: number }) => {
      Object.defineProperty(messagesEl, 'scrollTop', { configurable: true, value: top, writable: true });
    });
    Object.defineProperties(messagesEl, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1800 },
      scrollTop: { configurable: true, value: 0, writable: true },
      scrollTo: { configurable: true, value: scrollTo },
    });
    sidebar = null;
  });

  afterEach(() => {
    sidebar?.destroy();
    document.body.empty();
  });

  function addMessage(role: 'user' | 'assistant', text: string, offsetTop: number): HTMLElement {
    const element = messagesEl.createDiv({
      cls: `typorai-message typorai-message-${role}`,
      attr: { 'data-role': role },
    });
    Object.defineProperty(element, 'offsetTop', { configurable: true, value: offsetTop });
    element.createDiv({ cls: 'typorai-message-content', text });
    if (role === 'user') element.setAttribute('data-toc-title', text.split('\n')[0]);
    return element;
  }

  it('creates one quiet marker for every user message and no assistant marker', () => {
    addMessage('user', 'First question', 100);
    addMessage('assistant', 'First answer', 220);
    addMessage('user', 'Second question', 700);
    addMessage('assistant', 'Second answer', 820);

    sidebar = new NavigationSidebar(parentEl, messagesEl);

    expect(parentEl.querySelectorAll('.typorai-message-rail-marker')).toHaveLength(2);
    expect(parentEl.querySelector('.typorai-message-rail-marker--active')).not.toBeNull();
  });

  it('shows the prompt and paired answer only while a marker is hovered', () => {
    addMessage('user', 'How does this work?', 100);
    const assistant = addMessage('assistant', 'It uses a message-level overview rail.', 220);
    assistant.querySelector('.typorai-message-content')?.prepend(
      Object.assign(document.createElement('div'), {
        className: 'typorai-thinking-block',
        textContent: 'Internal reasoning must not appear in the preview.',
      }),
    );
    assistant.querySelector('.typorai-message-content')?.append(
      Object.assign(document.createElement('div'), {
        className: 'typorai-baked-duration',
        textContent: 'Baked for 5s',
      }),
    );
    sidebar = new NavigationSidebar(parentEl, messagesEl);

    const marker = parentEl.querySelector<HTMLButtonElement>('.typorai-message-rail-marker')!;
    marker.dispatchEvent(new MouseEvent('mouseenter'));

    const rail = parentEl.querySelector('.typorai-message-rail')!;
    expect(rail.classList.contains('typorai-message-rail--previewing')).toBe(true);
    expect(parentEl.querySelector('.typorai-message-rail-preview-title')?.textContent).toBe('How does this work?');
    expect(parentEl.querySelector('.typorai-message-rail-preview-response')?.textContent)
      .toBe('It uses a message-level overview rail.');

    rail.dispatchEvent(new MouseEvent('mouseleave'));
    expect(rail.classList.contains('typorai-message-rail--previewing')).toBe(false);
  });

  it('smoothly jumps to the selected user turn', () => {
    addMessage('user', 'First question', 100);
    addMessage('assistant', 'First answer', 220);
    addMessage('user', 'Second question', 700);
    sidebar = new NavigationSidebar(parentEl, messagesEl);

    const markers = parentEl.querySelectorAll<HTMLButtonElement>('.typorai-message-rail-marker');
    markers[1].click();

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 684, behavior: 'smooth' });
  });

  it('removes all rail DOM and listeners on destroy', () => {
    addMessage('user', 'Question', 100);
    sidebar = new NavigationSidebar(parentEl, messagesEl);
    sidebar.destroy();
    sidebar = null;
    expect(parentEl.querySelector('.typorai-message-rail')).toBeNull();
  });
});
