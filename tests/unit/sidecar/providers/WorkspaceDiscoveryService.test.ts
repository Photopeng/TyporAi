import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WorkspaceDiscoveryService } from '@/sidecar/services/providers/WorkspaceDiscoveryService';

describe('WorkspaceDiscoveryService', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'typorai-discovery-')); });
  afterEach(() => { rmSync(root, { force: true, recursive: true }); });

  it('discovers and reads skills from all supported workspace roots', async () => {
    const skillPath = path.join(root, '.codex', 'skills', 'review', 'SKILL.md');
    mkdirSync(path.dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, '# Review', 'utf8');
    const service = new WorkspaceDiscoveryService(() => root);

    await expect(service.listSkills()).resolves.toEqual([expect.objectContaining({ id: '.codex/skills:review', name: 'review' })]);
    await expect(service.readSkill('.codex/skills:review')).resolves.toEqual({ content: '# Review', path: skillPath });
  });

  it('discovers provider-owned agent definitions without exposing paths outside the workspace', async () => {
    const agentPath = path.join(root, '.claude', 'agents', 'reviewer.md');
    mkdirSync(path.dirname(agentPath), { recursive: true });
    writeFileSync(agentPath, '---\nname: reviewer\n---', 'utf8');

    await expect(new WorkspaceDiscoveryService(() => root).listAgents()).resolves.toEqual([
      expect.objectContaining({ id: 'claude:reviewer.md', name: 'reviewer', path: agentPath, provider: 'claude' }),
    ]);
  });

  it('rejects discovery until the Sidecar owns a workspace grant', async () => {
    await expect(new WorkspaceDiscoveryService(() => null).listSkills()).rejects.toThrow('Workspace is not granted.');
  });

  it('writes and removes provider agent definitions beneath the granted workspace only', async () => {
    const service = new WorkspaceDiscoveryService(() => root);
    await expect(service.saveAgent('codex', 'reviewer', 'name = "reviewer"')).resolves.toEqual(expect.objectContaining({ id: 'codex:reviewer.toml' }));
    await expect(service.listAgents()).resolves.toEqual([expect.objectContaining({ provider: 'codex', name: 'reviewer' })]);
    await expect(service.deleteAgent('codex', 'reviewer')).resolves.toBeUndefined();
    await expect(service.listAgents()).resolves.toEqual([]);
    await expect(service.saveAgent('claude', '../escape', 'bad')).rejects.toThrow('Invalid agent definition.');
  });
});
