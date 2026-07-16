import type { StreamChunk } from '@/core/types';
import { ClaudeSidecarRuntime } from '@/sidecar/providers/claude/ClaudeSidecarRuntime';

describe('ClaudeSidecarRuntime', () => {
  it('refuses an ungranted workspace without starting the Claude SDK', async () => {
    const start = jest.fn();
    const runtime = new ClaudeSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => null,
      processes: { start },
      requestApproval: async () => 'deny',
    });
    const chunks: StreamChunk[] = [];

    await runtime.startTurn('connection', 'turn', 'hello', event => chunks.push(event.payload));

    expect(chunks).toEqual([
      { type: 'error', content: 'WORKSPACE_NOT_GRANTED' },
      { type: 'done' },
    ]);
    expect(start).not.toHaveBeenCalled();
  });

  it('can be disposed before a query is created', async () => {
    const runtime = new ClaudeSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => '/workspace',
      processes: { start: jest.fn() },
      requestApproval: async () => 'deny',
    });

    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
