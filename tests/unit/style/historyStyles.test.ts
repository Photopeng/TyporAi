import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('history menu styles', () => {
  it('keeps the header history menu anchored to its relative container', () => {
    const historyCss = readFileSync(resolve('src/style/components/history.css'), 'utf8');
    const shellCss = readFileSync(resolve('src/style/editorial-shell.css'), 'utf8');

    expect(historyCss).toMatch(/\.typorai-history-menu\s*{[\s\S]*?position:\s*absolute;/);
    expect(shellCss).not.toMatch(/\.typorai-history-menu[^{]*{[\s\S]*?position:\s*fixed;/);
  });
});
