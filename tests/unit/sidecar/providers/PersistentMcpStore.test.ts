import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PersistentMcpStore } from '@/sidecar/services/providers/PersistentMcpStore';

describe('PersistentMcpStore', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'typorai-mcp-')); });
  afterEach(() => { rmSync(root, { force: true, recursive: true }); });

  it('persists valid managed MCP configuration and rejects invalid entries', async () => {
    const target = path.join(root, 'mcp.json');
    const store = await PersistentMcpStore.open(target);
    await expect(store.save([
      { name: 'docs', config: { command: 'npx', args: ['-y', 'docs-mcp'] }, enabled: true, contextSaving: false },
      { name: '../outside', config: { command: 'bad' }, enabled: true, contextSaving: true },
    ])).resolves.toEqual([expect.objectContaining({ name: 'docs', contextSaving: false })]);
    await expect((await PersistentMcpStore.open(target)).list()).toEqual([expect.objectContaining({ name: 'docs' })]);
  });
});
