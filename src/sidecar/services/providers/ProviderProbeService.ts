import { access } from 'node:fs/promises';
import path from 'node:path';

export type ProbedProviderId = 'claude' | 'codex' | 'opencode' | 'typora';
export interface ProviderProbeResult { readonly available: boolean; readonly executable: string | null; readonly providerId: ProbedProviderId; }

/** Sidecar-owned CLI discovery; Browser Renderer never probes PATH or Node APIs. */
export class ProviderProbeService {
  async probe(providerId: ProbedProviderId): Promise<ProviderProbeResult> {
    if (providerId === 'typora') return { available: true, executable: null, providerId };
    const executable = await this.findExecutable(providerId);
    return { available: executable !== null, executable, providerId };
  }

  async list(): Promise<readonly ProviderProbeResult[]> { return Promise.all((['claude', 'codex', 'opencode', 'typora'] as const).map(providerId => this.probe(providerId))); }

  private async findExecutable(name: string): Promise<string | null> {
    const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
    for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        try { await access(candidate); return candidate; } catch { /* Continue PATH search. */ }
      }
    }
    return null;
  }
}
