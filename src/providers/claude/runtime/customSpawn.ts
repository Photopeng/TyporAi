import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';

import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessSpec, type ProcessTransportFactory } from '@/core/ports';
import { startDeferredNodeProcess } from '@/hosts/electron/NodeProcessSessionAdapter';

import { cliPathRequiresNode, findNodeExecutable } from '../../../utils/env';
import { resolveWindowsCmdShimSpawnSpec } from '../../../utils/windowsCmdShim';

export function createCustomSpawnFunction(
  enhancedPath: string,
  processTransport?: ProcessTransportFactory,
  executionPolicy: ExecutionPolicy = new DefaultExecutionPolicy(),
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    if (!processTransport) {
      throw new Error('Claude process transport is unavailable');
    }

    let { command } = options;
    let { args } = options;
    const { cwd, env, signal } = options;

    if (command === 'node' || cliPathRequiresNode(command)) {
      const nodeFullPath = findNodeExecutable(enhancedPath);
      if (command === 'node') {
        if (nodeFullPath) command = nodeFullPath;
      } else {
        args = [command, ...args];
        command = nodeFullPath ?? 'node';
      }
    }

    const resolvedSpawnSpec = resolveWindowsCmdShimSpawnSpec({ args, command });
    const processSpec: ProcessSpec = {
      executable: resolvedSpawnSpec.command,
      args: resolvedSpawnSpec.args,
      cwd: cwd ?? '.',
      envDelta: Object.fromEntries(Object.entries(env ?? {}).map(([key, value]) => [key, value ?? null])),
      stdioMode: 'pipe',
      ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    };
    executionPolicy.assertAllowed(processSpec);

    const child = startDeferredNodeProcess(processTransport, processSpec, signal);
    if (signal) {
      const killChild = (): void => { child.kill('SIGTERM'); };
      if (signal.aborted) killChild();
      else signal.addEventListener('abort', killChild, { once: true });
    }
    return child as unknown as SpawnedProcess;
  };
}
