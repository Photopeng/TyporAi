import type { ProcessTransportFactory } from '../../../core/ports';
import type { ProviderId } from '../../../core/providers/types';
import type TyporAiPlugin from '../../../main';
import { getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import type { InitializeResult } from './codexAppServerTypes';
import { parseDefaultWslDistroListOutput } from './CodexExecutionTargetResolver';
import { buildCodexLaunchSpec } from './CodexLaunchSpecBuilder';
import type { CodexLaunchSpec } from './codexLaunchTypes';
import type { CodexRpcTransport } from './CodexRpcTransport';

const CODEX_APP_SERVER_CLIENT_INFO = Object.freeze({
  name: 'typorai',
  version: '1.0.0',
});

const WSL_DISCOVERY_TIMEOUT_MS = 5_000;

export function getCodexAppServerWorkingDirectory(plugin: TyporAiPlugin): string {
  return getVaultPath(plugin.app) ?? process.cwd();
}

export function buildCodexAppServerEnvironment(
  plugin: TyporAiPlugin,
  providerId: ProviderId = 'codex',
): Record<string, string> {
  const customEnv = parseEnvironmentVariables(plugin.getActiveEnvironmentVariables(providerId));
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const enhancedPath = getEnhancedPath(customEnv.PATH);

  return {
    ...baseEnv,
    ...customEnv,
    PATH: enhancedPath,
  };
}

async function discoverDefaultWslDistro(
  processTransport: ProcessTransportFactory | undefined,
  cwd: string,
): Promise<string | undefined> {
  if (!processTransport || process.platform !== 'win32') return undefined;

  try {
    const session = await processTransport.start({
      executable: 'wsl.exe',
      args: ['--list', '--verbose'],
      cwd,
      stdioMode: 'pipe',
    });
    let output = '';
    const removeStdout = session.onStdout(chunk => { output += chunk; });
    let removeExit: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await new Promise<'exit' | 'timeout'>(resolve => {
        removeExit = session.onExit(() => resolve('exit'));
        timeout = setTimeout(() => resolve('timeout'), WSL_DISCOVERY_TIMEOUT_MS);
      });
      if (outcome === 'timeout') {
        await session.terminate({ gracePeriodMs: 0, reason: 'timeout' });
      }
      return parseDefaultWslDistroListOutput(output);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      removeExit();
      removeStdout();
      await session.dispose();
    }
  } catch {
    return undefined;
  }
}

export async function resolveCodexAppServerLaunchSpec(
  plugin: TyporAiPlugin,
  providerId: ProviderId = 'codex',
  processTransport?: ProcessTransportFactory,
): Promise<CodexLaunchSpec> {
  const cwd = getCodexAppServerWorkingDirectory(plugin);
  const defaultWslDistro = await discoverDefaultWslDistro(processTransport, cwd);
  return buildCodexLaunchSpec({
    settings: plugin.settings,
    resolvedCliCommand: plugin.getResolvedProviderCliPath(providerId),
    hostVaultPath: cwd,
    env: buildCodexAppServerEnvironment(plugin, providerId),
    resolveDefaultWslDistro: defaultWslDistro ? () => defaultWslDistro : undefined,
  });
}

export async function initializeCodexAppServerTransport(
  transport: CodexRpcTransport,
): Promise<InitializeResult> {
  const result = await transport.request<InitializeResult>('initialize', {
    clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
    capabilities: { experimentalApi: true },
  });

  transport.notify('initialized');
  return result;
}
