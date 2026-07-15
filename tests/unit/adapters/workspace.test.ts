import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSettingsStorageAdapter } from '@/adapters/settingsStorage';
import { NodeWorkspaceAdapter } from '@/adapters/workspace';

describe('NodeWorkspaceAdapter', () => {
  let tempRoot: string;
  let configPath: string;
  let workspace: NodeWorkspaceAdapter;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'typora-ai-workspace-'));
    configPath = path.join(tempRoot, 'home-config.json');
    const settings = new FileSettingsStorageAdapter({ configPath });
    workspace = new NodeWorkspaceAdapter(settings);
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('persists explicit workspace roots separately from workspace files', async () => {
    const root = path.join(tempRoot, 'vault');
    await workspace.setRoot(root);

    expect(workspace.getRoot()).toBe(root);
    await expect(fs.promises.stat(path.join(root, '.typora-ai-assistant', 'root.json'))).resolves.toBeTruthy();

    const saved = JSON.parse(await fs.promises.readFile(configPath, 'utf8')) as { workspaceRoot?: string };
    expect(saved.workspaceRoot).toBe(root);
  });

  it('can adopt a fallback root without persisting it or creating a marker', async () => {
    const root = path.join(tempRoot, 'fallback-vault');
    await fs.promises.mkdir(root, { recursive: true });

    await workspace.adoptRoot(root);

    expect(workspace.getRoot()).toBe(root);
    await expect(fs.promises.stat(path.join(root, '.typora-ai-assistant'))).rejects.toThrow();
    await expect(fs.promises.readFile(configPath, 'utf8')).rejects.toThrow();
  });

  it('detects a root by walking upward to the marker directory', async () => {
    const root = path.join(tempRoot, 'vault');
    const nestedFile = path.join(root, 'folder', 'note.md');
    await fs.promises.mkdir(path.dirname(nestedFile), { recursive: true });
    await fs.promises.mkdir(path.join(root, '.typora-ai-assistant'), { recursive: true });
    await fs.promises.writeFile(nestedFile, '# Note', 'utf8');

    await expect(workspace.detectRoot(nestedFile)).resolves.toBe(root);
  });

  it('keeps file operations inside the selected root', async () => {
    const root = path.join(tempRoot, 'vault');
    await workspace.setRoot(root);
    await workspace.writeFile('notes/a.md', '# A');

    await expect(workspace.readFile('notes/a.md')).resolves.toBe('# A');
    await expect(workspace.writeFile('../escape.md', 'nope')).rejects.toThrow(/escapes workspace root/i);
    await expect(workspace.resolvePath('../escape.md')).rejects.toThrow(/escapes workspace root/i);
  });
});
