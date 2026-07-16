import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { FakeChatService } from '@/sidecar/providers/fake/FakeChatService';

describe('FakeChatService', () => {
  it('envelopes normalized chunks and replays missed events', async () => {
    const service = new FakeChatService();
    const events: RpcEventEnvelope<StreamChunk>[] = [];
    await service.startTurn('connection-1', 'turn-1', 'hello', event => events.push(event));
    expect(events.map(event => event.seq)).toEqual([1, 2, 3]);
    expect(service.replay('turn-1', 1)).toEqual(events.slice(1));
  });

  it('ends a cancelled turn with a stable cancellation chunk', async () => {
    const service = new FakeChatService();
    service.cancelTurn('turn-1');
    const events: RpcEventEnvelope<StreamChunk>[] = [];
    await service.startTurn('connection-1', 'turn-1', 'hello', event => events.push(event));
    expect(events.map(event => event.payload)).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'REQUEST_CANCELLED', type: 'error' })]));
  });
});
