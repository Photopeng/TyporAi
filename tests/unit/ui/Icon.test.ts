/** @jest-environment jsdom */

import { setIcon } from '@/ui/Icon';

describe('setIcon', () => {
  it('renders distinct SVG geometry for user-visible actions', () => {
    const names = ['copy', 'git-fork', 'list-clock', 'terminal', 'trash-2', 'settings'];
    const geometries = names.map((name) => {
      const element = document.createElement('button');
      setIcon(element, name);
      return element.querySelector('svg')?.innerHTML;
    });

    expect(new Set(geometries).size).toBe(names.length);
    expect(geometries.every(Boolean)).toBe(true);
  });

  it('replaces a previous icon without leaving duplicated SVG elements', () => {
    const element = document.createElement('button');
    setIcon(element, 'copy');
    setIcon(element, 'check');
    expect(element.querySelectorAll('svg')).toHaveLength(1);
    expect(element.dataset.icon).toBe('check');
  });
});
