/**
 * @jest-environment jsdom
 */

import path from 'node:path';

import { TyporaEditorApi } from '@/typora/editor-api';

describe('TyporaEditorApi', () => {
  let originalFile: unknown;
  let originalDocument: unknown;

  beforeEach(() => {
    originalFile = (window as any).File;
    originalDocument = (globalThis as any).document;
  });

  afterEach(() => {
    (window as any).File = originalFile;
    (globalThis as any).document = originalDocument;
    jest.restoreAllMocks();
  });

  it('reads markdown through Typora internal editor API', () => {
    (window as any).File = {
      editor: {
        getMarkdown: () => '# Current note',
      },
      filePath: path.join('C:', 'vault', 'note.md'),
    };

    expect(new TyporaEditorApi().getAllText()).toBe('# Current note');
  });

  it('derives workspace path from the current file path', () => {
    const filePath = path.join('C:', 'vault', 'folder', 'note.md');
    (window as any).File = { filePath };

    expect(new TyporaEditorApi().getWorkspacePath()).toBe(path.dirname(filePath));
  });

  it('reads selected text from the internal editor when available', () => {
    (window as any).File = {
      editor: {
        getSelection: () => 'selected paragraph',
      },
    };

    expect(new TyporaEditorApi().getSelection()).toBe('selected paragraph');
  });

  it('replaces the current selection through the internal editor', () => {
    const replaceSelection = jest.fn();
    (window as any).File = {
      editor: {
        getSelection: () => 'selected',
        replaceSelection,
      },
    };

    expect(new TyporaEditorApi().insertText('replacement')).toBe(true);
    expect(replaceSelection).toHaveBeenCalledWith('replacement');
  });

  it('inserts text at the cursor through the internal editor', () => {
    const insertAtCursor = jest.fn();
    (window as any).File = {
      editor: {
        getSelection: () => '',
        insertAtCursor,
      },
    };

    expect(new TyporaEditorApi().insertText('insertion')).toBe(true);
    expect(insertAtCursor).toHaveBeenCalledWith('insertion');
  });

  it('builds cursor context from the current markdown', () => {
    (window as any).File = {
      editor: {
        getMarkdown: () => 'first line\nsecond',
      },
    };

    expect(new TyporaEditorApi().getCursorContext()).toEqual({
      beforeCursor: 'first line\nsecond',
      afterCursor: '',
      isInbetween: false,
      line: 1,
      column: 6,
    });
  });
});
