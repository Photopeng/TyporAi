import { JSDOM } from 'jsdom';

import { installTyporaEditorDomRecovery, repairTyporaEditorDom } from '@/typora/TyporaEditorDomRecovery';

function createDocument(): Document {
  return new JSDOM('<!doctype html><html><body><content><div id="write">Document body</div></content></body></html>').window.document;
}

describe('TyporaEditorDomRecovery', () => {
  it('moves #write out of the hidden image-folder dialog immediately', () => {
    const document = createDocument();
    const content = document.querySelector('content')!;
    const write = document.getElementById('write')!;
    const modal = document.createElement('div');
    modal.id = 'image-create-folder-confirm';
    modal.style.display = 'none';
    content.append(modal);
    modal.append(write);

    expect(repairTyporaEditorDom(document)).toBe(true);
    expect(write.parentElement).toBe(content);
  });

  it('repairs a post-mount move into the hidden dialog', async () => {
    const document = createDocument();
    const content = document.querySelector('content')!;
    const write = document.getElementById('write')!;
    const modal = document.createElement('div');
    modal.id = 'image-create-folder-confirm';
    modal.style.display = 'none';
    content.append(modal);
    const dispose = installTyporaEditorDomRecovery(document);

    modal.append(write);
    await new Promise(resolve => document.defaultView!.setTimeout(resolve, 10));

    expect(write.parentElement).toBe(content);
    dispose();
  });
});
