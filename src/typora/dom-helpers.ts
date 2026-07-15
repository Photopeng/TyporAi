import { setIcon } from '@/ui/Icon';

import { setTyporAiTooltip } from '../ui/Tooltip';

type TyporaDomClass = string | string[];

type TyporaDomOptions = {
  cls?: TyporaDomClass;
  text?: string;
  title?: string;
  placeholder?: string;
  attr?: Record<string, string | number | boolean>;
  type?: string;
  value?: string;
  href?: string;
};

declare global {
  interface Window {
    lucide?: {
      createIcons?: () => void;
    };
  }
}

function normalizeClasses(classes: TyporaDomClass | undefined): string[] {
  if (!classes) return [];
  return Array.isArray(classes) ? classes.flatMap(cls => cls.split(/\s+/)) : classes.split(/\s+/);
}

function applyOptions(el: HTMLElement, options?: string | TyporaDomOptions): void {
  if (!options) return;

  if (typeof options === 'string') {
    for (const cls of normalizeClasses(options)) {
      if (cls) el.classList.add(cls);
    }
    return;
  }

  for (const cls of normalizeClasses(options.cls)) {
    if (cls) el.classList.add(cls);
  }
  if (options.text !== undefined) el.textContent = options.text;
  if (options.title !== undefined) setTyporAiTooltip(el, options.title);
  if (options.placeholder !== undefined && 'placeholder' in el) {
    (el as HTMLInputElement | HTMLTextAreaElement).placeholder = options.placeholder;
  }
  if (options.type !== undefined && 'type' in el) {
    (el as HTMLInputElement | HTMLButtonElement).type = options.type;
  }
  if (options.value !== undefined && 'value' in el) {
    (el as HTMLInputElement | HTMLTextAreaElement).value = options.value;
  }
  if (options.href !== undefined && el instanceof HTMLAnchorElement) {
    el.href = options.href;
  }
  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      el.setAttribute(key, String(value));
    }
  }
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  owner: Document,
  tag: K,
  options?: string | TyporaDomOptions,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  const el = owner.createElement(tag);
  applyOptions(el, options);
  callback?.(el);
  return el;
}

export function installTyporaDomHelpers(): void {
  const proto = Element.prototype as Element & Record<string, unknown>;
  if (typeof proto.createDiv === 'function') return;

  proto.addClass = function addClass(...classes: string[]): void {
    for (const entry of classes) {
      for (const cls of normalizeClasses(entry)) {
        if (cls) this.classList.add(cls);
      }
    }
  };
  proto.removeClass = function removeClass(...classes: string[]): void {
    for (const entry of classes) {
      for (const cls of normalizeClasses(entry)) {
        if (cls) this.classList.remove(cls);
      }
    }
  };
  proto.toggleClass = function toggleClass(className: string, value?: boolean): void {
    this.classList.toggle(className, value);
  };
  proto.hasClass = function hasClass(className: string): boolean {
    return this.classList.contains(className);
  };
  proto.setText = function setText(text: string): void {
    this.textContent = text;
  };
  proto.appendText = function appendText(text: string): void {
    this.append(document.createTextNode(text));
  };
  proto.empty = function empty(): void {
    this.replaceChildren();
  };
  proto.createDiv = function createDiv(
    options?: string | TyporaDomOptions,
    callback?: (el: HTMLDivElement) => void,
  ): HTMLDivElement {
    const el = createElement(this.ownerDocument, 'div', options, callback);
    this.appendChild(el);
    return el;
  };
  proto.createSpan = function createSpan(
    options?: string | TyporaDomOptions,
    callback?: (el: HTMLSpanElement) => void,
  ): HTMLSpanElement {
    const el = createElement(this.ownerDocument, 'span', options, callback);
    this.appendChild(el);
    return el;
  };
  proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: string | TyporaDomOptions,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K] {
    const el = createElement(this.ownerDocument, tag, options, callback);
    this.appendChild(el);
    return el;
  };
  proto.setCssProps = function setCssProps(props: Record<string, string | number>): void {
    for (const [key, value] of Object.entries(props)) {
      (this as unknown as HTMLElement).style.setProperty(key, String(value));
    }
  };
  (proto as unknown as { instanceOf: (type: new (...args: any[]) => Element) => boolean }).instanceOf = function instanceOf(type): boolean {
    return this instanceof type;
  };

  const doc = document as Document & Record<string, unknown>;
  doc.createDiv = (options?: string | TyporaDomOptions, callback?: (el: HTMLDivElement) => void) =>
    createElement(document, 'div', options, callback);
  doc.createEl = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: string | TyporaDomOptions,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ) => createElement(document, tag, options, callback);

  (window as unknown as Record<string, unknown>).createDiv = doc.createDiv;
  (window as unknown as Record<string, unknown>).createEl = doc.createEl;
}

export function installTyporaIconShim(): void {
  setIcon(document.createElement('span'), 'bot');
}
