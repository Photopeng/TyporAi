import { type BridgeChatClient,BridgeChatRuntime } from '@/bridge/chat/BridgeChatRuntime';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';

describe('BridgeChatRuntime', () => {
  it('maps streamed protocol chunks to the existing async generator', async () => {
    let listener: ((event: RpcEventEnvelope<unknown>) => void) | undefined;
    const client: BridgeChatClient = {
      onEvent: next => { listener = next; return () => { listener = undefined; }; },
      request: async method => {
        if (method === 'chat.startTurn') queueMicrotask(() => listener?.({ connectionId: 'c', streamId: '00000000-0000-0000-0000-000000000001', seq: 1, event: 'chat.chunk', payload: { type: 'done' }, timestamp: 1 }));
        return { streamId: '00000000-0000-0000-0000-000000000001' } as never;
      },
    };
    const runtime = new BridgeChatRuntime(client);
    const turn = runtime.prepareTurn({ text: 'hello' });
    const randomId = jest.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');
    const chunks: StreamChunk[] = [];
    for await (const chunk of runtime.query(turn)) chunks.push(chunk);
    randomId.mockRestore();
    expect(chunks).toEqual([{ type: 'done' }]);
  });

  it('cancels the active Sidecar turn without requiring the caller to know its id', async () => {
    const requests: Array<{ method: string; params?: unknown }> = [];
    const client: BridgeChatClient = { onEvent: () => () => undefined, request: async (method, params) => { requests.push({ method, params }); return {} as never; } };
    const runtime = new BridgeChatRuntime(client);
    const randomId = jest.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');
    const generator = runtime.query(runtime.prepareTurn({ text: 'hello' }));
    void generator.next();
    await Promise.resolve();
    await runtime.cancel();
    randomId.mockRestore();
    expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({ method: 'chat.cancelTurn', params: { turnId: '00000000-0000-0000-0000-000000000001' } })]));
  });
});
