const IMAGE_FOLDER_MODAL_ID = 'image-create-folder-confirm';
const RECOVERY_DELAYS_MS = [0, 100, 350, 800] as const;

/**
 * Restores Typora's document surface if its #write node is accidentally moved
 * into the hidden image-folder dialog. This can happen after a document has
 * loaded, so callers should also install the observer below.
 */
export function repairTyporaEditorDom(documentRef: Document = document): boolean {
  const content = documentRef.querySelector<HTMLElement>('content');
  const view = documentRef.defaultView;
  if (!content || !view) return false;

  const misplaced = Array.from(documentRef.querySelectorAll<HTMLElement>('#write'))
    .filter(write => isInsideHiddenEditorContainer(write, content, view));
  if (misplaced.length === 0) return false;

  for (const write of misplaced) content.appendChild(write);
  return true;
}

/** Watches Typora's DOM because the malformed move can occur after mount. */
export function installTyporaEditorDomRecovery(documentRef: Document = document): () => void {
  const view = documentRef.defaultView;
  if (!view) return () => {};

  const timers: number[] = [];
  const refresh = (): void => {
    repairTyporaEditorDom(documentRef);
    for (const editor of documentRef.querySelectorAll<HTMLElement>('#write .md-fences .CodeMirror, #write .CodeMirror')) {
      (editor as HTMLElement & { CodeMirror?: { refresh?: () => void } }).CodeMirror?.refresh?.();
    }
  };
  const schedule = (): void => {
    while (timers.length > 0) view.clearTimeout(timers.pop());
    for (const delay of RECOVERY_DELAYS_MS) timers.push(view.setTimeout(refresh, delay));
  };
  const observer = view.MutationObserver
    ? new view.MutationObserver((mutations) => {
      const affected = mutations.some(mutation => {
        if (mutation.target instanceof view.Element && mutation.target.closest(`#${IMAGE_FOLDER_MODAL_ID}`)) return true;
        return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some(node =>
          node instanceof view.Element && (node.matches('#write') || Boolean(node.querySelector('#write'))));
      });
      if (affected) schedule();
    })
    : null;

  refresh();
  observer?.observe(documentRef.documentElement, { childList: true, subtree: true });
  schedule();
  return () => {
    observer?.disconnect();
    while (timers.length > 0) view.clearTimeout(timers.pop());
  };
}

function isInsideHiddenEditorContainer(write: HTMLElement, content: HTMLElement, view: Window): boolean {
  for (let parent = write.parentElement; parent && parent !== content; parent = parent.parentElement) {
    if (parent.id === IMAGE_FOLDER_MODAL_ID) return true;
    const style = view.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}
