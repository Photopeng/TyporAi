import type { StreamChunk } from '@/core/types';
import { TyporaApiRuntime } from '@/sidecar/providers/typora/TyporaApiRuntime';

describe('TyporaApiRuntime', () => {
  it('runs entirely in Sidecar and rejects an ungranted workspace before any API call', async () => {
    const runtime = new TyporaApiRuntime({ getSettings: () => ({}), getWorkspacePath: () => null, requestApproval: async () => 'deny' });
    const chunks: StreamChunk[] = [];
    await runtime.startTurn('connection', 'turn', 'hello', event => chunks.push(event.payload));
    expect(chunks).toEqual([{ type: 'error', content: 'WORKSPACE_NOT_GRANTED' }, { type: 'done' }]);
  });

  it('releases its API engine when Sidecar disposes the runtime', () => {
    const runtime = new TyporaApiRuntime({ getSettings: () => ({}), getWorkspacePath: () => '/workspace', requestApproval: async () => 'deny' });
    expect(() => runtime.dispose()).not.toThrow();
  });
});
