import type { StreamChunk } from '@/core/types';
import {
  CodexSidecarRuntime,
  createCodexSidecarLaunchSpec,
} from '@/sidecar/providers/codex/CodexSidecarRuntime';

describe('CodexSidecarRuntime', () => {
  it('refuses a turn before starting a process when the workspace has not been granted', async () => {
    const runtime = new CodexSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => null,
      processes: { start: jest.fn() },
    });
    const chunks: StreamChunk[] = [];

    await runtime.startTurn('connection', 'turn', 'hello', event => chunks.push(event.payload));

    expect(chunks).toEqual([
      { type: 'error', content: 'WORKSPACE_NOT_GRANTED' },
      { type: 'done' },
    ]);
  });

  it('builds a sidecar-owned native app-server launch specification', () => {
    const spec = createCodexSidecarLaunchSpec({
      providerConfigs: {
        codex: {
          cliPath: 'custom-codex',
          environmentVariables: 'CODEX_TEST=value',
        },
      },
    }, '/workspace');

    expect(spec.command).toBe('custom-codex');
    expect(spec.args).toEqual(['app-server', '--listen', 'stdio://']);
    expect(spec.spawnCwd).toBe('/workspace');
    expect(spec.env.CODEX_TEST).toBe('value');
  });
});
