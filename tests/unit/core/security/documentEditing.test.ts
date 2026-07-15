import {
  getDocumentMutationToolsForMode,
  isDocumentEditingAllowed,
  isDocumentMutationTool,
} from '@/core/security/documentEditing';

describe('document editing safety gate', () => {
  it('allows document editing only in YOLO mode', () => {
    expect(isDocumentEditingAllowed('yolo')).toBe(true);
    expect(isDocumentEditingAllowed('normal')).toBe(false);
    expect(isDocumentEditingAllowed('plan')).toBe(false);
  });

  it('blocks built-in and mutating MCP tools in SAFE mode', () => {
    expect(getDocumentMutationToolsForMode('normal')).toEqual(expect.arrayContaining(['Write', 'Edit', 'Bash', 'apply_patch']));
    expect(isDocumentMutationTool('write_file')).toBe(true);
    expect(isDocumentMutationTool('edit')).toBe(true);
    expect(isDocumentMutationTool('mcp__notes__replace_document')).toBe(true);
    expect(isDocumentMutationTool('mcp__notes__read_document')).toBe(false);
  });

  it('does not add document mutation restrictions in YOLO mode', () => {
    expect(getDocumentMutationToolsForMode('yolo')).toEqual([]);
  });
});
