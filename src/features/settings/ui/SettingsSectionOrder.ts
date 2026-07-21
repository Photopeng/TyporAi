/** Keeps provider-owned settings content in a consistent visual order. */
export function orderSettingsSections(container: HTMLElement, labels: readonly string[]): void {
  const sections = new Map<string, HTMLElement[]>();
  let current: HTMLElement[] | null = null;
  for (const child of [...container.children] as HTMLElement[]) {
    if (child.classList.contains('setting-item-heading')) {
      const label = child.querySelector('.setting-item-name')?.textContent ?? '';
      current = [];
      sections.set(label, current);
    }
    current?.push(child);
  }

  const ordered = document.createDocumentFragment();
  for (const label of labels) {
    for (const child of sections.get(label) ?? []) ordered.append(child);
    sections.delete(label);
  }
  for (const section of sections.values()) {
    for (const child of section) ordered.append(child);
  }
  container.append(ordered);
}
