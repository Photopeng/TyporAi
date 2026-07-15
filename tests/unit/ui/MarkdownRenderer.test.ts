/** @jest-environment jsdom */

import { renderMarkdown } from '@/ui/MarkdownRenderer';

describe('renderMarkdown', () => {
  it('renders fenced code, tables, inline and block math, and safe embedded HTML', async () => {
    const target = document.createElement('div');
    await renderMarkdown([
      '# Title',
      '',
      '| Name | Value |',
      '| --- | ---: |',
      '| alpha | 1 |',
      '',
      'Inline $x^2$ and **bold**.',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      '```ts',
      'const value = 1;',
      '```',
      '',
      '<mark onclick="alert(1)">safe</mark><script>alert(1)</script>',
    ].join('\n'), target);

    expect(target.querySelector('h1')?.textContent).toBe('Title');
    expect(target.querySelectorAll('table th')).toHaveLength(2);
    expect(target.querySelector('table td')?.textContent).toBe('alpha');
    expect(target.querySelector<HTMLElement>('.typorai-markdown-math-inline')?.dataset.math).toBe('x^2');
    expect(target.querySelector<HTMLElement>('.typorai-markdown-math-block')?.dataset.math).toBe('E = mc^2');
    expect(target.querySelector('pre code')?.textContent).toBe('const value = 1;');
    expect(target.querySelector('mark')?.getAttribute('onclick')).toBeNull();
    expect(target.querySelector('script')).toBeNull();
  });
});
