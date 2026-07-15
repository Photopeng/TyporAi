import path from 'node:path';

import type { CursorContext } from '../utils/editor';

type TyporaFileApi = {
  editor?: {
    getMarkdown?: () => string;
    getSelection?: () => string;
    replaceSelection?: (text: string) => void;
    insertAtCursor?: (text: string) => void;
    insertText?: (text: string) => void;
  };
  filePath?: string;
  currentFilePath?: string;
  bundle?: { filePath?: string };
  getFilePath?: () => string;
};

type TyporaWindow = Window & {
  File?: TyporaFileApi;
};

export interface TyporaEditorSnapshot {
  workspacePath: string;
  currentFilePath: string | null;
  currentDocument: string;
  selection: string;
}

export class TyporaEditorApi {
  getWorkspacePath(): string {
    const currentFilePath = this.getCurrentFilePath();
    if (currentFilePath) {
      return path.dirname(currentFilePath);
    }
    return process.cwd();
  }

  getCurrentFilePath(): string | null {
    const fileApi = this.getTyporaFileApi();
    const candidates = [
      fileApi?.filePath,
      fileApi?.currentFilePath,
      fileApi?.bundle?.filePath,
      fileApi?.getFilePath?.(),
      globalThis.document?.body?.getAttribute('data-path') ?? undefined,
    ];
    return candidates.find(value => typeof value === 'string' && value.trim().length > 0) ?? null;
  }

  getAllText(): string {
    const editor = this.getTyporaFileApi()?.editor;
    if (typeof editor?.getMarkdown === 'function') {
      return editor.getMarkdown();
    }
    const source = this.getVisibleWriteElement()
      ?? globalThis.document?.querySelector('.typora-sourceview-on');
    return source?.textContent ?? '';
  }

  getSelection(): string {
    const editor = this.getTyporaFileApi()?.editor;
    if (typeof editor?.getSelection === 'function') {
      const typoraSelection = editor.getSelection();
      if (typoraSelection.trim()) {
        return typoraSelection;
      }
      return window.getSelection()?.toString() ?? typoraSelection;
    }
    return window.getSelection()?.toString() ?? '';
  }

  getSnapshot(): TyporaEditorSnapshot {
    return {
      workspacePath: this.getWorkspacePath(),
      currentFilePath: this.getCurrentFilePath(),
      currentDocument: this.getAllText(),
      selection: this.getSelection(),
    };
  }

  getCursorContext(): CursorContext {
    const documentText = this.getAllText();
    const lines = documentText.split(/\r?\n/);
    const lastLine = lines[lines.length - 1] ?? '';
    return {
      beforeCursor: documentText,
      afterCursor: '',
      isInbetween: lastLine.trim().length === 0,
      line: Math.max(0, lines.length - 1),
      column: lastLine.length,
    };
  }

  replaceSelection(text: string): boolean {
    const editor = this.getTyporaFileApi()?.editor;
    if (typeof editor?.replaceSelection === 'function') {
      editor.replaceSelection(text);
      return true;
    }
    return this.insertWithDocumentCommand(text);
  }

  insertAtCursor(text: string): boolean {
    const editor = this.getTyporaFileApi()?.editor;
    if (typeof editor?.insertAtCursor === 'function') {
      editor.insertAtCursor(text);
      return true;
    }
    if (typeof editor?.insertText === 'function') {
      editor.insertText(text);
      return true;
    }
    return this.insertWithDocumentCommand(text);
  }

  insertText(text: string): boolean {
    return this.getSelection() ? this.replaceSelection(text) : this.insertAtCursor(text);
  }

  private insertWithDocumentCommand(text: string): boolean {
    const activeElement = globalThis.document?.activeElement as HTMLElement | null;
    if (activeElement) activeElement.focus();
    return globalThis.document?.execCommand('insertText', false, text) ?? false;
  }

  private getTyporaFileApi(): TyporaFileApi | undefined {
    return (window as TyporaWindow).File;
  }

  private getVisibleWriteElement(): HTMLElement | null {
    const candidates = Array.from(globalThis.document?.querySelectorAll<HTMLElement>('#write') ?? []);
    return candidates.find(candidate => !this.hasHiddenAncestor(candidate))
      ?? candidates.sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
      ?? null;
  }

  private hasHiddenAncestor(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== globalThis.document?.body) {
      const style = globalThis.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }
}
