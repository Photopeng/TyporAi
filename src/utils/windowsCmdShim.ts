import { existsSync } from 'node:fs';
import path from 'node:path';

const WINDOWS_CMD_ARGUMENT_CHARS = /[\s"&<>|{}^=;!'+,`~()%@]/u;

export interface WindowsCmdShimSpawnSpec {
  args: string[];
  command: string;
  /** Environment inherited by the child; used to find npm's .cmd shims. */
  env?: NodeJS.ProcessEnv;
  killProcessTree?: boolean;
  windowsVerbatimArguments?: boolean;
}

interface KillableProcess {
  kill(signal?: NodeJS.Signals | number): boolean;
  pid?: number;
}

interface ErrorEmitterLike {
  on(event: 'error', listener: (error: Error) => void): unknown;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: { stdio: 'ignore'; windowsHide: true },
) => unknown;

export function resolveWindowsCmdShimSpawnSpec(
  spec: Pick<WindowsCmdShimSpawnSpec, 'args' | 'command' | 'env'>,
): WindowsCmdShimSpawnSpec {
  const configuredCommand = spec.command.trim();
  if (!configuredCommand || process.platform !== 'win32') {
    return {
      args: spec.args,
      command: spec.command,
    };
  }

  const command = configuredCommand.toLowerCase().endsWith('.cmd')
    ? configuredCommand
    : findWindowsCmdShim(configuredCommand, spec.env);
  if (!command) {
    return {
      args: spec.args,
      command: spec.command,
    };
  }

  const shellCommand = [command, ...spec.args]
    .map(value => quoteWindowsShellArgument(value))
    .join(' ');

  return {
    args: ['/d', '/s', '/c', `"${shellCommand}"`],
    command: environmentValue(spec.env, 'ComSpec') || environmentValue(process.env, 'ComSpec') || 'cmd.exe',
    killProcessTree: true,
    windowsVerbatimArguments: true,
  };
}

/**
 * npm exposes global commands as .cmd shims on Windows. Node can resolve an
 * executable, but it does not reliably execute a bare .cmd command without a
 * shell. Resolve the shim against the exact child PATH before deciding how to
 * spawn it.
 */
function findWindowsCmdShim(command: string, environment?: NodeJS.ProcessEnv): string | null {
  if (path.extname(command) || command.includes('/') || command.includes('\\')) {
    return null;
  }

  const configuredPath = environmentValue(environment, 'PATH')
    || environmentValue(process.env, 'PATH')
    || '';
  for (const directory of configuredPath.split(';').map(value => value.trim()).filter(Boolean)) {
    for (const extension of ['.cmd', '.bat']) {
      const candidate = path.join(stripQuotes(directory), `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function environmentValue(environment: NodeJS.ProcessEnv | undefined, name: string): string | undefined {
  if (!environment) return undefined;
  const direct = environment[name];
  if (direct) return direct;
  const key = Object.keys(environment).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? environment[key] : undefined;
}

function stripQuotes(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

export function terminateSpawnedProcess(
  proc: KillableProcess,
  signal: NodeJS.Signals | number | undefined,
  spawnProcess: SpawnProcess,
  spawnSpec?: WindowsCmdShimSpawnSpec | null,
): boolean {
  if (
    process.platform !== 'win32'
    || !spawnSpec?.killProcessTree
    || typeof proc.pid !== 'number'
  ) {
    return proc.kill(signal);
  }

  try {
    const taskkill = spawnProcess('taskkill.exe', ['/pid', String(proc.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (isErrorEmitterLike(taskkill)) {
      taskkill.on('error', () => {});
    }
    return true;
  } catch {
    return proc.kill(signal);
  }
}

function isErrorEmitterLike(value: unknown): value is ErrorEmitterLike {
  return value !== null
    && typeof value === 'object'
    && typeof (value as { on?: unknown }).on === 'function';
}

function requiresWindowsShellQuoting(value: string): boolean {
  return WINDOWS_CMD_ARGUMENT_CHARS.test(value)
    || value.includes('[')
    || value.includes(']');
}

function quoteWindowsShellArgument(value: string): string {
  if (!value.length) {
    return '""';
  }

  if (!requiresWindowsShellQuoting(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
