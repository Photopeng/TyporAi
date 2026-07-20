import { type RpcSocket,WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';

describe('WebSocketRpcClient', () => {
  it('refreshes its endpoint before opening a connection', async () => {
    const endpoints: string[] = [];
    const client = new WebSocketRpcClient('ws://stale/rpc', {
      endpointResolver: async () => 'ws://refreshed/rpc',
      socketFactory: endpoint => {
        endpoints.push(endpoint);
        return new OpeningSocket();
      },
    });

    await client.connect();

    expect(endpoints).toEqual(['ws://refreshed/rpc']);
    client.dispose();
  });
});

class OpeningSocket implements RpcSocket {
  readonly readyState = 1;
  private readonly listeners = new Map<string, Array<(event: { readonly data?: unknown }) => void>>();

  constructor() { queueMicrotask(() => this.emit('open')); }

  addEventListener(type: 'close' | 'error' | 'message' | 'open', listener: (event: { readonly data?: unknown }) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  close(): void { this.emit('close'); }
  send(): void {}

  private emit(type: string): void { this.listeners.get(type)?.forEach(listener => listener({})); }
}
