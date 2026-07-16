import { BridgeFileStore, type RpcRequester } from '@/bridge/host/BridgeFileStore';

describe('BridgeFileStore', () => {
  it('uses RPC methods and an idempotency key for writes', async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const rpc: RpcRequester = { request: async (method, params) => {
      requests.push({ method, params: params as Record<string, unknown> });
      return undefined as never;
    } };
    const files = new BridgeFileStore(rpc);
    await files.writeAtomic('/workspace/note.md', 'hello');
    await files.rename('/workspace/note.md', '/workspace/renamed.md');
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'fs.writeText', params: expect.objectContaining({ idempotencyKey: expect.any(String) }) }),
      expect.objectContaining({ method: 'fs.rename', params: expect.objectContaining({ idempotencyKey: expect.any(String) }) }),
    ]));
  });
});
