import type { FileProbe } from '../../../core/ports';
import { parsePathEntries, resolveNvmDefaultBin } from '../../../utils/path';
import { basenamePortable, dirnamePortable, joinPosixPath, joinWindowsPath } from '../../../utils/portablePath';

const CLAUDE_CODE_PACKAGE_SEGMENTS = ['node_modules', '@anthropic-ai', 'claude-code'];
const CLAUDE_CODE_NODE_ENTRYPOINTS = ['cli-wrapper.cjs', 'cli.js'];

export interface ClaudeCliDiscoveryOptions {
  environment?: Record<string, string | undefined>;
  homeDirectory?: string;
  platform?: 'win32' | 'linux' | 'darwin';
  fileProbe?: FileProbe;
}

function runtimeEnvironment(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function runtimePlatform(): 'win32' | 'linux' | 'darwin' {
  const platform = (globalThis as { process?: { platform?: string } }).process?.platform;
  return platform === 'win32' || platform === 'darwin' ? platform : 'linux';
}

function joinPath(platform: 'win32' | 'linux' | 'darwin', ...parts: string[]): string {
  return platform === 'win32' ? joinWindowsPath(...parts) : joinPosixPath(...parts);
}

function dedupePaths(entries: string[], isWindows: boolean): string[] {
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = isWindows ? entry.toLowerCase() : entry;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidatePathVariants(filePath: string, platform: 'win32' | 'linux' | 'darwin'): string[] {
  if (platform !== 'win32') {
    return [filePath];
  }

  const variants = [
    filePath,
    filePath.replace(/\\/g, '/'),
    filePath.replace(/\//g, '\\'),
  ];
  return dedupePaths(variants, true);
}

function findExistingFilePath(filePath: string, fileProbe: FileProbe | undefined, platform: 'win32' | 'linux' | 'darwin'): string | null {
  if (!fileProbe) return null;
  for (const candidate of candidatePathVariants(filePath, platform)) {
    try {
      if (fileProbe.exists(candidate) && fileProbe.isFile(candidate)) {
        return candidate;
      }
    } catch {
      // Try the next separator-normalized variant.
    }
  }
  return null;
}

function findFirstExistingPath(entries: string[], candidates: string[], options: ClaudeCliDiscoveryOptions): string | null {
  const platform = options.platform ?? runtimePlatform();
  for (const dir of entries) {
    if (!dir) continue;
    for (const candidate of candidates) {
      const fullPath = joinPath(platform, dir, candidate);
      const existingPath = findExistingFilePath(fullPath, options.fileProbe, platform);
      if (existingPath) {
        return existingPath;
      }
    }
  }
  return null;
}

function findClaudeCodeNodeEntrypoint(packageRoot: string, options: ClaudeCliDiscoveryOptions): string | null {
  const platform = options.platform ?? runtimePlatform();
  for (const entrypoint of CLAUDE_CODE_NODE_ENTRYPOINTS) {
    const candidate = joinPath(platform, packageRoot, entrypoint);
    const existingPath = findExistingFilePath(candidate, options.fileProbe, platform);
    if (existingPath) {
      return existingPath;
    }
  }

  return null;
}

function resolveClaudeCodeEntrypointNearPathEntry(entry: string, isWindows: boolean, options: ClaudeCliDiscoveryOptions): string | null {
  const platform = options.platform ?? runtimePlatform();
  const directCandidate = findClaudeCodeNodeEntrypoint(
    joinPath(platform, entry, ...CLAUDE_CODE_PACKAGE_SEGMENTS), options
  );
  if (directCandidate) {
    return directCandidate;
  }

  const baseName = basenamePortable(entry).toLowerCase();
  if (baseName === 'bin') {
    const prefix = dirnamePortable(entry);
    const packageParent = isWindows ? prefix : joinPath(platform, prefix, 'lib');
    const candidate = findClaudeCodeNodeEntrypoint(
      joinPath(platform, packageParent, ...CLAUDE_CODE_PACKAGE_SEGMENTS), options
    );
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function resolveClaudeCodeEntrypointFromPathEntries(entries: string[], isWindows: boolean, options: ClaudeCliDiscoveryOptions): string | null {
  for (const entry of entries) {
    const candidate = resolveClaudeCodeEntrypointNearPathEntry(entry, isWindows, options);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function resolveClaudeFromPathEntries(
  entries: string[],
  isWindows: boolean,
  options: ClaudeCliDiscoveryOptions,
): string | null {
  if (entries.length === 0) {
    return null;
  }

  if (!isWindows) {
    const unixCandidate = findFirstExistingPath(entries, ['claude'], options);
    return unixCandidate;
  }

  const exeCandidate = findFirstExistingPath(entries, ['claude.exe', 'claude'], options);
  if (exeCandidate) {
    return exeCandidate;
  }

  const packageEntrypoint = resolveClaudeCodeEntrypointFromPathEntries(entries, isWindows, options);
  if (packageEntrypoint) {
    return packageEntrypoint;
  }

  return null;
}

function getNpmGlobalPrefix(options: ClaudeCliDiscoveryOptions): string | null {
  const env = options.environment ?? runtimeEnvironment();
  if (env.npm_config_prefix) {
    return env.npm_config_prefix;
  }

  if ((options.platform ?? runtimePlatform()) === 'win32') {
    const appDataNpm = env.APPDATA
      ? joinWindowsPath(env.APPDATA, 'npm')
      : null;
    if (appDataNpm) {
      try {
        if (options.fileProbe?.exists(appDataNpm)) return appDataNpm;
      } catch {
        // Continue without an npm prefix when the host cannot inspect it.
      }
    }
  }

  return null;
}

function addClaudeCodeEntrypointPaths(paths: string[], packageParent: string, options: ClaudeCliDiscoveryOptions): void {
  const packageRoot = joinPath(options.platform ?? runtimePlatform(), packageParent, ...CLAUDE_CODE_PACKAGE_SEGMENTS);
  for (const entrypoint of CLAUDE_CODE_NODE_ENTRYPOINTS) {
    paths.push(joinPath(options.platform ?? runtimePlatform(), packageRoot, entrypoint));
  }
}

function getNpmClaudeCodeEntrypointPaths(options: ClaudeCliDiscoveryOptions): string[] {
  const env = options.environment ?? runtimeEnvironment();
  const platform = options.platform ?? runtimePlatform();
  const homeDir = options.homeDirectory ?? env.HOME ?? env.USERPROFILE ?? '';
  const isWindows = platform === 'win32';
  const entrypointPaths: string[] = [];

  if (isWindows) {
    addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, homeDir, 'AppData', 'Roaming', 'npm'), options);

    const npmPrefix = getNpmGlobalPrefix(options);
    if (npmPrefix) {
      addClaudeCodeEntrypointPaths(entrypointPaths, npmPrefix, options);
    }

    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, programFiles, 'nodejs', 'node_global'), options);
    addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, programFilesX86, 'nodejs', 'node_global'), options);
    addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, 'D:', 'Program Files', 'nodejs', 'node_global'), options);
  } else {
    addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, homeDir, '.npm-global', 'lib'), options);
    addClaudeCodeEntrypointPaths(entrypointPaths, '/usr/local/lib', options);
    addClaudeCodeEntrypointPaths(entrypointPaths, '/usr/lib', options);

    if (env.npm_config_prefix) {
      addClaudeCodeEntrypointPaths(entrypointPaths, joinPath(platform, env.npm_config_prefix, 'lib'), options);
    }
  }

  return entrypointPaths;
}

export function findClaudeCLIPath(pathValue?: string, options: ClaudeCliDiscoveryOptions = {}): string | null {
  const env = options.environment ?? runtimeEnvironment();
  const platform = options.platform ?? runtimePlatform();
  const isWindows = platform === 'win32';
  const homeDir = options.homeDirectory ?? env.HOME ?? env.USERPROFILE ?? '';
  const resolvedOptions = { ...options, platform, environment: env, homeDirectory: homeDir };

  const customEntries = dedupePaths(parsePathEntries(pathValue), isWindows);

  if (customEntries.length > 0) {
    const customResolution = resolveClaudeFromPathEntries(customEntries, isWindows, resolvedOptions);
    if (customResolution) {
      return customResolution;
    }
  }

  // On Windows, prefer native .exe, then Node-backed package entrypoints. Avoid .cmd fallback
  // because it requires shell: true and breaks SDK stdio streaming.
  if (isWindows) {
    const exePaths: string[] = [
      joinPath(platform, homeDir, '.claude', 'local', 'claude.exe'),
      joinPath(platform, homeDir, 'AppData', 'Local', 'Claude', 'claude.exe'),
      joinPath(platform, env.ProgramFiles || 'C:\\Program Files', 'Claude', 'claude.exe'),
      joinPath(platform, env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Claude', 'claude.exe'),
      joinPath(platform, homeDir, '.local', 'bin', 'claude.exe'),
    ];

    for (const p of exePaths) {
      const existingPath = findExistingFilePath(p, resolvedOptions.fileProbe, platform);
      if (existingPath) {
        return existingPath;
      }
    }

    const packageEntrypointPaths = getNpmClaudeCodeEntrypointPaths(resolvedOptions);
    for (const p of packageEntrypointPaths) {
      const existingPath = findExistingFilePath(p, resolvedOptions.fileProbe, platform);
      if (existingPath) {
        return existingPath;
      }
    }

  }

  const commonPaths: string[] = [
    joinPath(platform, homeDir, '.claude', 'local', 'claude'),
    joinPath(platform, homeDir, '.local', 'bin', 'claude'),
    joinPath(platform, homeDir, '.volta', 'bin', 'claude'),
    joinPath(platform, homeDir, '.asdf', 'shims', 'claude'),
    joinPath(platform, homeDir, '.asdf', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    joinPath(platform, homeDir, 'bin', 'claude'),
    joinPath(platform, homeDir, '.npm-global', 'bin', 'claude'),
  ];

  const npmPrefix = getNpmGlobalPrefix(resolvedOptions);
  if (npmPrefix) {
    commonPaths.push(joinPath(platform, npmPrefix, 'bin', 'claude'));
  }

  // NVM: resolve default version bin when NVM_BIN env var is not available (GUI apps)
  const nvmBin = resolveNvmDefaultBin(homeDir);
  if (nvmBin) {
    commonPaths.push(joinPath(platform, nvmBin, 'claude'));
  }

  for (const p of commonPaths) {
    const existingPath = findExistingFilePath(p, resolvedOptions.fileProbe, platform);
    if (existingPath) {
      return existingPath;
    }
  }

  if (!isWindows) {
    const packageEntrypointPaths = getNpmClaudeCodeEntrypointPaths(resolvedOptions);
    for (const p of packageEntrypointPaths) {
      const existingPath = findExistingFilePath(p, resolvedOptions.fileProbe, platform);
      if (existingPath) {
        return existingPath;
      }
    }
  }

  const envEntries = dedupePaths(parsePathEntries(env.PATH), isWindows);
  if (envEntries.length > 0) {
    const envResolution = resolveClaudeFromPathEntries(envEntries, isWindows, resolvedOptions);
    if (envResolution) {
      return envResolution;
    }
  }

  return null;
}
