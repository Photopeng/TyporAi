/**
 * @jest-environment jsdom
 */

import { injectBootstrapStyles } from '@/bootstrap/mount';

jest.mock('@/typora/typora-host', () => ({
  mountRealTyporAiInTypora: jest.fn().mockResolvedValue(undefined),
  unmountRealTyporAiInTypora: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/typora/TyporaEditModeController', () => ({
  TyporaEditModeController: jest.fn(),
}));

describe('bootstrap styles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('keeps hidden quick action surfaces visually hidden despite toolbar display styles', () => {
    injectBootstrapStyles();

    const toolbar = document.createElement('div');
    toolbar.className = 'typora-quick-actions-toolbar';
    toolbar.hidden = true;
    document.body.appendChild(toolbar);

    const result = document.createElement('div');
    result.className = 'typora-quick-actions-result';
    result.hidden = true;
    document.body.appendChild(result);

    expect(window.getComputedStyle(toolbar).display).toBe('none');
    expect(window.getComputedStyle(result).display).toBe('none');
  });

  it('positions the edit instruction prompt outside the Typora side panel when the panel is visible', () => {
    injectBootstrapStyles();

    const style = document.getElementById('typora-ai-assistant-bootstrap-styles');
    expect(style?.textContent).toContain('body:not(.typorai-typora-panel-hidden) .typora-edit-mode-prompt');
    expect(style?.textContent).toContain('right: calc(var(--typorai-typora-panel-width, 430px) + 18px)');
  });
});
