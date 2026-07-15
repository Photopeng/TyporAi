import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeWorkspaceTool } from '@/engines/api-engine/workspaceTools';

describe('executeWorkspaceTool', () => {
  let workspacePath: string;
  let outsidePath: string;

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-typora-tools-'));
    workspacePath = path.join(root, 'workspace');
    await fs.mkdir(workspacePath);
    outsidePath = path.join(root, 'outside.txt');
    await fs.writeFile(path.join(workspacePath, 'note.md'), 'hello from workspace\nneedle line', 'utf8');
    await fs.writeFile(path.join(workspacePath, 'other.txt'), 'plain text', 'utf8');
    await fs.mkdir(path.join(workspacePath, 'folder'));
    await fs.writeFile(outsidePath, 'secret outside workspace', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(workspacePath), { recursive: true, force: true });
  });

  it('reads a workspace-relative file', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'read_file', input: { path: 'note.md' } },
      ),
    ).resolves.toContain('hello from workspace');
  });

  it('keeps the legacy read_local_file alias working', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'read_local_file', input: { path: 'note.md' } },
      ),
    ).resolves.toContain('hello from workspace');
  });

  it('writes a workspace-relative file and backs up existing content', async () => {
    await executeWorkspaceTool(
      { workspacePath },
      { name: 'write_file', input: { path: 'note.md', content: 'new content' } },
    );

    await expect(fs.readFile(path.join(workspacePath, 'note.md'), 'utf8')).resolves.toBe('new content');
    await expect(fs.readFile(path.join(workspacePath, 'note.md.typorai.bak'), 'utf8'))
      .resolves.toContain('hello from workspace');
  });

  it('asks for approval before writing a workspace file', async () => {
    const requestApproval = jest.fn().mockResolvedValue('deny');

    await expect(
      executeWorkspaceTool(
        { workspacePath, requestApproval },
        { name: 'write_file', input: { path: 'note.md', content: 'new content' } },
      ),
    ).rejects.toThrow(/user approval/i);

    expect(requestApproval).toHaveBeenCalledWith(
      'write_file',
      { path: 'note.md', content: 'new content' },
      'Write workspace file: note.md',
      expect.objectContaining({
        decisionReason: expect.stringContaining('Typora workspace write access'),
      }),
    );
    await expect(fs.readFile(path.join(workspacePath, 'note.md'), 'utf8'))
      .resolves.toContain('hello from workspace');
  });

  it('lists files and directories inside the workspace', async () => {
    const result = await executeWorkspaceTool(
      { workspacePath },
      { name: 'list_directory', input: { path: '.' } },
    );

    expect(result).toContain('file note.md');
    expect(result).toContain('dir folder');
  });

  it('searches text files inside the workspace', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'search_workspace', input: { query: 'needle' } },
      ),
    ).resolves.toBe('note.md:2');
  });

  it('keeps the legacy search_vault alias working', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'search_vault', input: { query: 'needle' } },
      ),
    ).resolves.toBe('note.md:2');
  });

  it('returns current Typora document context', async () => {
    await expect(
      executeWorkspaceTool(
        {
          workspacePath,
          currentDocument: '# Active',
          currentFilePath: 'note.md',
          selection: 'Active',
        },
        { name: 'get_current_document', input: {} },
      ),
    ).resolves.toBe(JSON.stringify({
      currentFilePath: 'note.md',
      selection: 'Active',
      content: '# Active',
    }, null, 2));
  });

  it('replaces the current Typora selection', async () => {
    const replaceSelection = jest.fn(() => true);

    await expect(
      executeWorkspaceTool(
        { workspacePath, replaceSelection },
        { name: 'replace_selection', input: { text: 'replacement' } },
      ),
    ).resolves.toBe('Replaced current Typora selection.');
    expect(replaceSelection).toHaveBeenCalledWith('replacement');
  });

  it('asks for approval before replacing the current Typora selection', async () => {
    const replaceSelection = jest.fn(() => true);
    const requestApproval = jest.fn().mockResolvedValue('cancel');

    await expect(
      executeWorkspaceTool(
        { workspacePath, replaceSelection, requestApproval },
        { name: 'replace_selection', input: { text: 'replacement' } },
      ),
    ).rejects.toThrow(/user approval/i);

    expect(replaceSelection).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledWith(
      'replace_selection',
      { text: 'replacement' },
      'Replace the current Typora selection.',
      expect.any(Object),
    );
  });

  it('blocks absolute paths outside the workspace', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'read_file', input: { path: outsidePath } },
      ),
    ).rejects.toThrow(/absolute paths/i);
  });

  it('blocks relative traversal outside the workspace', async () => {
    await expect(
      executeWorkspaceTool(
        { workspacePath },
        { name: 'read_file', input: { path: '../outside.txt' } },
      ),
    ).rejects.toThrow(/escapes workspace root/i);
  });
});
