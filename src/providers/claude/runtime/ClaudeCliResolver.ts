import type { FileProbe } from '../../../core/ports';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../../core/types/settings';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { findClaudeCLIPath } from '../cli/findClaudeCLIPath';
import { getClaudeProviderSettings } from '../settings';

export class ClaudeCliResolver {
  private resolvedPath: string | null = null;
  private lastHostnamePath = '';
  private lastLegacyPath = '';
  private lastEnvText = '';
  private readonly cachedHostname = getHostnameKey();

  constructor(private fileProbe?: FileProbe) {}

  setFileProbe(fileProbe?: FileProbe): void {
    this.fileProbe = fileProbe;
    this.reset();
  }

  /**
   * Resolves CLI path with priority: device-specific -> legacy -> auto-detect.
   * @param settings Full app settings bag
   */
  resolveFromSettings(settings: Record<string, unknown>): string | null {
    const hostnameKey = this.cachedHostname;
    const claudeSettings = getClaudeProviderSettings(settings);

    const hostnamePath = (claudeSettings.cliPathsByHost[hostnameKey] ?? '').trim();
    const normalizedLegacy = claudeSettings.cliPath.trim();
    const normalizedEnv = getRuntimeEnvironmentText(settings, 'claude');

    if (
      this.resolvedPath &&
      hostnamePath === this.lastHostnamePath &&
      normalizedLegacy === this.lastLegacyPath &&
      normalizedEnv === this.lastEnvText
    ) {
      return this.resolvedPath;
    }

    this.lastHostnamePath = hostnamePath;
    this.lastLegacyPath = normalizedLegacy;
    this.lastEnvText = normalizedEnv;

    this.resolvedPath = resolveClaudeCliPath(hostnamePath, normalizedLegacy, normalizedEnv, this.fileProbe);
    return this.resolvedPath;
  }

  resolve(
    hostnamePaths: HostnameCliPaths | undefined,
    legacyPath: string | undefined,
    envText: string,
  ): string | null {
    return this.resolveFromSettings({
      sharedEnvironmentVariables: envText,
      providerConfigs: {
        claude: {
          cliPath: legacyPath ?? '',
          cliPathsByHost: hostnamePaths ?? {},
        },
      },
    });
  }

  reset(): void {
    this.resolvedPath = null;
    this.lastHostnamePath = '';
    this.lastLegacyPath = '';
    this.lastEnvText = '';
  }
}

function resolveConfiguredPath(rawPath: string | undefined, fileProbe?: FileProbe): string | null {
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) return null;
  try {
    const expanded = expandHomePath(trimmed);
    if (!fileProbe || (fileProbe.exists(expanded) && fileProbe.isFile(expanded))) {
      return expanded;
    }
  } catch {
    // Fall through
  }
  return null;
}

export function resolveClaudeCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string,
  fileProbe?: FileProbe,
): string | null {
  return (
    resolveConfiguredPath(hostnamePath, fileProbe) ??
    resolveConfiguredPath(legacyPath, fileProbe) ??
    findClaudeCLIPath(parseEnvironmentVariables(envText || '').PATH, { fileProbe })
  );
}
