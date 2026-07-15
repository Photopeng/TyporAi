import { joinPosixPath, joinWindowsPath } from '../../../utils/portablePath';

const OPENCODE_APP_NAME = 'opencode';
const DEFAULT_DATABASE_NAME = 'opencode.db';
const DATABASE_NAME_PATTERN = /^opencode(?:-[a-z0-9._-]+)?\.db$/i;

export interface OpencodePathFileSystem {
  exists(path: string): boolean;
  readDirectory(path: string): string[];
}

interface OpencodePathOptions {
  platform?: 'win32' | 'linux' | 'darwin';
  home?: string;
  fileSystem?: OpencodePathFileSystem;
}

function getRuntimeEnv(): NodeJS.ProcessEnv {
  return (globalThis as { process?: { env?: NodeJS.ProcessEnv } }).process?.env ?? {};
}

function getPlatform(
  options?: OpencodePathOptions,
  env: NodeJS.ProcessEnv = getRuntimeEnv(),
): 'win32' | 'linux' | 'darwin' {
  if (options?.platform) return options.platform;
  if (env.XDG_DATA_HOME?.startsWith('/') || env.HOME?.startsWith('/')) return 'linux';
  return options?.platform
    ?? (globalThis as { process?: { platform?: string } }).process?.platform as 'win32' | 'linux' | 'darwin' | undefined
    ?? 'linux';
}

function joinPath(platform: 'win32' | 'linux' | 'darwin', ...parts: string[]): string {
  return platform === 'win32' ? joinWindowsPath(...parts) : joinPosixPath(...parts);
}

function isAbsolutePath(value: string, platform: 'win32' | 'linux' | 'darwin'): boolean {
  return platform === 'win32'
    ? /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
    : value.startsWith('/');
}

export function resolveOpencodeDataDir(
  env: NodeJS.ProcessEnv = getRuntimeEnv(),
  options: OpencodePathOptions = {},
): string {
  const platform = getPlatform(options, env);
  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) {
    return joinPath(platform, xdgDataHome, OPENCODE_APP_NAME);
  }

  const home = options.home || env.HOME || env.USERPROFILE || '';
  if (platform === 'win32') {
    const appData = env.APPDATA || env.LOCALAPPDATA || joinPath(platform, home, 'AppData', 'Roaming');
    return joinPath(platform, appData, OPENCODE_APP_NAME);
  }

  return joinPath(platform, home, '.local', 'share', OPENCODE_APP_NAME);
}

export function resolveOpencodeDatabasePath(
  env: NodeJS.ProcessEnv = getRuntimeEnv(),
  options: OpencodePathOptions = {},
): string | null {
  const platform = getPlatform(options, env);
  const override = env.OPENCODE_DB?.trim();
  if (override) {
    if (override === ':memory:' || isAbsolutePath(override, platform)) {
      return override;
    }
    return joinPath(platform, resolveOpencodeDataDir(env, options), override);
  }

  const candidates = getOpencodeDatabasePathCandidates(env, options);
  const fileSystem = options.fileSystem;
  for (const candidate of candidates) {
    if (fileSystem?.exists(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

export function resolveExistingOpencodeDatabasePath(
  preferredPath?: string | null,
  env: NodeJS.ProcessEnv = getRuntimeEnv(),
  options: OpencodePathOptions = {},
): string | null {
  const preferred = preferredPath?.trim();
  if (preferred) {
    if (preferred === ':memory:') {
      return preferred;
    }
    if (options.fileSystem?.exists(preferred)) {
      return preferred;
    }
  }

  const resolved = resolveOpencodeDatabasePath(env, options);
  if (resolved && (resolved === ':memory:' || options.fileSystem?.exists(resolved))) {
    return resolved;
  }

  return preferred ?? resolved;
}

function getOpencodeDatabasePathCandidates(
  env: NodeJS.ProcessEnv,
  options: OpencodePathOptions,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const platform = getPlatform(options, env);
  const home = options.home || env.HOME || env.USERPROFILE || '';
  const dataDirs = [
    resolveOpencodeDataDir(env, options),
    joinPath(platform, home, 'Library', 'Application Support', OPENCODE_APP_NAME),
  ];

  for (const dataDir of dataDirs) {
    pushCandidate(candidates, seen, joinPath(platform, dataDir, DEFAULT_DATABASE_NAME));
    try {
      const matches = options.fileSystem?.readDirectory(dataDir)
        ?.filter((entry) => DATABASE_NAME_PATTERN.test(entry))
        .sort((left, right) => {
          if (left === DEFAULT_DATABASE_NAME) return -1;
          if (right === DEFAULT_DATABASE_NAME) return 1;
          return left.localeCompare(right);
        }) ?? [];

      for (const entry of matches) {
        pushCandidate(candidates, seen, joinPath(platform, dataDir, entry));
      }
    } catch {
      // Ignore missing dirs and unreadable locations.
    }
  }

  return candidates;
}

function pushCandidate(
  candidates: string[],
  seen: Set<string>,
  candidate: string,
): void {
  if (seen.has(candidate)) {
    return;
  }

  seen.add(candidate);
  candidates.push(candidate);
}
