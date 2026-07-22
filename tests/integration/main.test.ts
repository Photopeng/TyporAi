import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { injectRuntimeScript } from '@/bootstrap/inject';

describe('Typora runtime injection', () => {
  let directory: string;
  let windowHtmlPath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typorai-integration-'));
    windowHtmlPath = path.join(directory, 'window.html');
    fs.writeFileSync(windowHtmlPath, '<html><body><main>Typora</main></body></html>', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('injects the TyporAi runtime into Typora window.html', async () => {
    await expect(injectRuntimeScript({
      windowHtmlPath,
      scriptSrc: 'file:///plugins/typorai/typora-typorai.renderer.js',
      version: '2.0.27',
    })).resolves.toBe(true);

    expect(fs.readFileSync(windowHtmlPath, 'utf8')).toContain(
      '<script id="typora-ai-assistant-runtime" src="file:///plugins/typorai/typora-typorai.renderer.js" data-version="2.0.27"></script>',
    );
  });

  it('is idempotent for the installed version', async () => {
    const options = {
      windowHtmlPath,
      scriptSrc: 'file:///plugins/typorai/typora-typorai.renderer.js',
      version: '2.0.27',
    };
    await injectRuntimeScript(options);
    await expect(injectRuntimeScript(options)).resolves.toBe(false);
  });

  it('updates an existing TyporAi runtime tag during upgrade', async () => {
    await injectRuntimeScript({ windowHtmlPath, scriptSrc: 'old.js', version: '1.0.0' });
    await injectRuntimeScript({ windowHtmlPath, scriptSrc: 'typora-typorai.renderer.js', version: '2.0.27' });

    const html = fs.readFileSync(windowHtmlPath, 'utf8');
    expect(html).not.toContain('old.js');
    expect(html.match(/id="typora-ai-assistant-runtime"/g)).toHaveLength(1);
  });
});
