import { createMockEl } from '@test/helpers/mockElement';

import { setTyporAiTooltip } from '@/ui/Tooltip';

describe('setTyporAiTooltip', () => {
  it('uses only the custom tooltip attribute and clears native browser title', () => {
    const el = createMockEl();
    el.title = 'native tooltip';
    el.setAttribute('title', 'native tooltip');

    setTyporAiTooltip(el, 'Unified tooltip');

    expect(el.getAttribute('data-typorai-tooltip')).toBe('Unified tooltip');
    expect(el.getAttribute('title')).toBeNull();
    expect(el.title).toBe('');
  });

  it('removes custom and native tooltip state when cleared', () => {
    const el = createMockEl();
    setTyporAiTooltip(el, 'Unified tooltip');

    setTyporAiTooltip(el, null);

    expect(el.getAttribute('data-typorai-tooltip')).toBeNull();
    expect(el.getAttribute('title')).toBeNull();
    expect(el.title).toBe('');
  });
});
