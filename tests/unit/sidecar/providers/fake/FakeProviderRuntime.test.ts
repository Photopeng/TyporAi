import type { StreamChunk } from '@/core/types';
import { FakeProviderRuntime } from '@/sidecar/providers/fake/FakeProviderRuntime';

describe('FakeProviderRuntime', () => {
  it('provides a normalized stream and an approval marker', async () => {
    const runtime = new FakeProviderRuntime();
    const chunks: StreamChunk[] = [];
    for await (const chunk of runtime.startTurn({ id: 'turn-1', prompt: 'approval' })) chunks.push(chunk);
    expect(chunks).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'notice' }), expect.objectContaining({ type: 'done' })]));
  });

  it('serializes active turns', async () => {
    const runtime = new FakeProviderRuntime();
    const stream = runtime.startTurn({ id: 'turn-1', prompt: 'one' });
    await stream.next();
    await expect(runtime.startTurn({ id: 'turn-2', prompt: 'two' }).next()).rejects.toThrow('TURN_ALREADY_ACTIVE');
    await stream.return(undefined);
  });
});
