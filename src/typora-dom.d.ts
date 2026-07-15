type TyporaDomClass = string | string[];

interface TyporaDomOptions {
  cls?: TyporaDomClass;
  text?: string;
  title?: string;
  placeholder?: string;
  attr?: Record<string, string | number | boolean>;
  type?: string;
  value?: string;
  href?: string;
}

interface Element {
  addClass(...classes: string[]): void;
  removeClass(...classes: string[]): void;
  toggleClass(className: string, value?: boolean): void;
  hasClass(className: string): boolean;
  setText(text: string): void;
  appendText(text: string): void;
  empty(): void;
  createDiv(options?: string | TyporaDomOptions, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
  createSpan(options?: string | TyporaDomOptions, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: string | TyporaDomOptions,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K];
  setCssProps(props: Record<string, string | number>): void;
  instanceOf<T extends Element>(type: { new (...args: any[]): T }): this is T;
}

declare function createDiv(
  options?: string | TyporaDomOptions,
  callback?: (el: HTMLDivElement) => void,
): HTMLDivElement;

declare function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: string | TyporaDomOptions,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K];
