const STYLE_ID = 'typorai-macos-panel-styles';

export function installMacosPanelStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :root { --typorai-macos-panel-width: 430px; }
    #typorai-typora-root {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 9999;
      width: var(--typorai-macos-panel-width);
      min-width: 320px;
      max-width: min(48vw, 640px);
      overflow: hidden;
      background: var(--bg-color, #ffffff);
      border-left: 1px solid var(--control-border-color, rgba(0, 0, 0, 0.12));
      box-sizing: border-box;
    }
    body > content { right: var(--typorai-macos-panel-width) !important; }
    #typorai-typora-root .typorai-container {
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
    }
    #typorai-typora-root .typorai-macos-provider-select {
      margin-inline-start: auto;
      max-width: 150px;
      min-height: 28px;
    }
    #typorai-typora-root .typorai-macos-chat .typorai-header-action-btn {
      width: auto;
      min-width: 46px;
      height: 30px;
      padding: 0 9px;
      border: 1px solid var(--background-modifier-border, rgba(0, 0, 0, 0.15));
      background: transparent;
      color: var(--text-normal, inherit);
    }
    #typorai-typora-root .typorai-macos-chat .typorai-input-toolbar { gap: 6px; }
  `;
  document.head.append(style);
}
