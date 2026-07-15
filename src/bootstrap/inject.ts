import * as fs from 'node:fs';

export interface InjectRuntimeOptions {
  windowHtmlPath: string;
  scriptSrc: string;
  version: string;
  scriptId?: string;
}

export async function injectRuntimeScript(options: InjectRuntimeOptions): Promise<boolean> {
  const scriptId = options.scriptId ?? 'typora-ai-assistant-runtime';
  const html = await fs.promises.readFile(options.windowHtmlPath, 'utf8');
  const scriptPattern = new RegExp(
    `<script\\b[^>]*id=["']${escapeRegExp(scriptId)}["'][^>]*><\\/script>`,
    'i',
  );
  const nextScript = `<script id="${scriptId}" src="${options.scriptSrc}" data-version="${options.version}"></script>`;

  if (scriptPattern.test(html)) {
    const existing = html.match(scriptPattern)?.[0] ?? '';
    if (existing.includes(`data-version="${options.version}"`) && existing.includes(`src="${options.scriptSrc}"`)) {
      return false;
    }
    await fs.promises.writeFile(options.windowHtmlPath, html.replace(scriptPattern, nextScript), 'utf8');
    return true;
  }

  const patched = html.replace('</body>', `  ${nextScript}\n</body>`);
  if (patched === html) {
    throw new Error('Could not find </body> in Typora window.html.');
  }

  await fs.promises.writeFile(options.windowHtmlPath, patched, 'utf8');
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
