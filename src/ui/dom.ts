export function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  options: {
    attributes?: Record<string, string>;
    className?: string;
    text?: string;
    type?: string;
    value?: string;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = parent.ownerDocument.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type && tag === 'input') (element as HTMLInputElement).type = options.type;
  if (options.value !== undefined && 'value' in element) element.value = options.value;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  parent.append(element);
  return element;
}
