import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface DiscoveredAgent {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly provider: 'claude' | 'codex' | 'opencode';
}

/** Sidecar-owned discovery for workspace skills and agent definitions. */
export class WorkspaceDiscoveryService {
  constructor(private readonly getWorkspaceRoot: () => string | null) {}

  async listSkills(): Promise<readonly DiscoveredSkill[]> {
    const root = this.requireRoot();
    const roots = ['.claude/skills', '.codex/skills', '.agents/skills'];
    const entries = await Promise.all(roots.map(async relative => this.readDirectories(path.join(root, relative))));
    return entries.flatMap((names, index) => names.map(name => ({
      id: `${roots[index]}:${name}`,
      name,
      path: path.join(root, roots[index], name, 'SKILL.md'),
    }))).sort((left, right) => left.name.localeCompare(right.name));
  }

  async readSkill(id: string): Promise<{ readonly content: string; readonly path: string }> {
    const skill = (await this.listSkills()).find(value => value.id === id);
    if (!skill) throw new Error('Skill not found.');
    return { content: await readFile(skill.path, 'utf8'), path: skill.path };
  }

  async listAgents(): Promise<readonly DiscoveredAgent[]> {
    const root = this.requireRoot();
    const locations: ReadonlyArray<readonly ['claude' | 'codex' | 'opencode', string, string]> = [
      ['claude', '.claude/agents', '.md'], ['codex', '.codex/agents', '.toml'], ['opencode', '.opencode/agents', '.md'],
    ];
    const values = await Promise.all(locations.map(async ([provider, relative, extension]) => (await this.readFiles(path.join(root, relative)))
      .filter(name => name.endsWith(extension)).map(name => ({ id: `${provider}:${name}`, name: name.slice(0, -extension.length), path: path.join(root, relative, name), provider }))));
    return values.flat().sort((left, right) => left.name.localeCompare(right.name));
  }

  private requireRoot(): string {
    const root = this.getWorkspaceRoot();
    if (!root) throw new Error('Workspace is not granted.');
    return root;
  }

  private async readDirectories(directory: string): Promise<readonly string[]> {
    try { return (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
    catch { return []; }
  }

  private async readFiles(directory: string): Promise<readonly string[]> {
    try { return (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name); }
    catch { return []; }
  }
}
