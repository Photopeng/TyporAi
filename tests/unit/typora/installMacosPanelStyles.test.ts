/**
 * @jest-environment jsdom
 */

import { installMacosPanelStyles } from '@/typora/installMacosPanelStyles';

describe('installMacosPanelStyles', () => {
  it('installs a scoped fixed sidebar layout once', () => {
    installMacosPanelStyles();
    installMacosPanelStyles();

    const style = document.getElementById('typorai-macos-panel-styles');
    expect(style?.textContent).toContain('#typorai-typora-root');
    expect(style?.textContent).toContain('position: fixed');
    expect(document.querySelectorAll('#typorai-macos-panel-styles')).toHaveLength(1);
  });
});
