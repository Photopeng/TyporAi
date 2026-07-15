export function updateContextRowHasContent(contextRowEl: HTMLElement): void {
  const browserIndicator = contextRowEl.querySelector('.typorai-browser-selection-indicator');
  const canvasIndicator = contextRowEl.querySelector('.typorai-canvas-indicator');
  const fileIndicator = contextRowEl.querySelector('.typorai-file-indicator');
  const imagePreview = contextRowEl.querySelector('.typorai-image-preview');

  const hasBrowserSelection = !!browserIndicator && !browserIndicator.hasClass('typorai-hidden');
  const hasCanvasSelection = !!canvasIndicator && !canvasIndicator.hasClass('typorai-hidden');
  const hasFileChips = !!fileIndicator && fileIndicator.hasClass('typorai-visible-flex');
  const hasImageChips = !!imagePreview && imagePreview.hasClass('typorai-visible-flex');

  contextRowEl.classList.toggle(
    'has-content',
    hasBrowserSelection || hasCanvasSelection || hasFileChips || hasImageChips
  );
}
