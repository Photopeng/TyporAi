import type { StreamChunk } from '@/core/types';
import { OpencodeSidecarRuntime } from '@/sidecar/providers/opencode/OpencodeSidecarRuntime';

describe('OpencodeSidecarRuntime', () => {
  it('refuses an ungranted workspace before creating an ACP subprocess', async () => {
    const start = jest.fn();
    const runtime = new OpencodeSidecarRuntime({
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

  it('can be disposed before an ACP connection is created', async () => {
    const runtime = new OpencodeSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => '/workspace',
      processes: { start: jest.fn() },
      requestApproval: async () => 'deny',
    });

    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
