import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getEnhancedPath } from '@/utils/env';

export type ProbedProviderId = 'claude' | 'codex' | 'opencode' | 'typora';
export interface ProviderProbeResult { readonly available: boolean; readonly executable: string | null; readonly providerId: ProbedProviderId; }

/** Sidecar-owned CLI discovery; Browser Renderer never probes PATH or Node APIs. */
export class ProviderProbeService {
  async probe(providerId: ProbedProviderId, configuredExecutable?: string): Promise<ProviderProbeResult> {
    if (providerId === 'typora') return { available: true, executable: null, providerId };
    const executable = await this.resolveExecutable(configuredExecutable?.trim() || providerId);
    return { available: executable !== null, executable, providerId };
  }

  async list(configured: Partial<Record<ProbedProviderId, string>> = {}): Promise<readonly ProviderProbeResult[]> {
    return Promise.all((['claude', 'codex', 'opencode', 'typora'] as const)
      .map(providerId => this.probe(providerId, configured[providerId])));
  }

  private async resolveExecutable(value: string): Promise<string | null> {
    const expanded = value === '~'
      ? os.homedir()
      : value.startsWith(`~${path.sep}`) || value.startsWith('~/')
        ? path.join(os.homedir(), value.slice(2))
        : value;
    if (path.isAbsolute(expanded) || expanded.includes('/') || expanded.includes('\\')) {
      try { await access(expanded); return path.resolve(expanded); } catch { return null; }
    }
    return this.findExecutable(expanded);
  }

  private async findExecutable(name: string): Promise<string | null> {
    const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
    // Match the PATH used by provider processes. Typora is a GUI application
    // and commonly omits %APPDATA%\\npm, where npm-installed CLIs live.
    for (const directory of getEnhancedPath().split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        try { await access(candidate); return candidate; } catch { /* Continue PATH search. */ }
      }
    }
    return null;
  }
}
