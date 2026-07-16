import { ConnectionStateMachine } from '@/bridge/client/ConnectionStateMachine';
import { SubscriptionManager } from '@/bridge/client/SubscriptionManager';
import { type RpcSocket,WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';

describe('Bridge client primitives', () => {
  it('enforces the explicit connection state machine', () => {
    const machine = new ConnectionStateMachine();
    machine.transition('connecting');
    machine.transition('authenticating');
    machine.transition('ready');
    expect(() => machine.transition('authenticating')).toThrow('Invalid connection transition');
  });

  it('deduplicates event envelopes per stream and preserves resume positions', () => {
    const subscriptions = new SubscriptionManager();
    expect(subscriptions.consume({ connectionId: 'c', streamId: 's', seq: 1, event: 'chat.chunk', payload: {}, timestamp: 1 })).toBe(true);
    expect(subscriptions.consume({ connectionId: 'c', streamId: 's', seq: 1, event: 'chat.chunk', payload: {}, timestamp: 2 })).toBe(false);
    expect(subscriptions.resumePositions()).toEqual({ s: 1 });
  });

  it('sends notifications only after the client is ready', async () => {
    const socket = new FakeSocket();
    const client = new WebSocketRpcClient('ws://127.0.0.1/rpc', { socketFactory: () => socket });
    const connecting = client.connect();
    socket.emit('open');
    await connecting;
    client.markReady();
    client.notify('watch.resubscribe', { watchIds: [] });
    expect(socket.sent[0]).toContain('watch.resubscribe');
  });

  it('forwards each stream event once', async () => {
    const socket = new FakeSocket();
    const client = new WebSocketRpcClient('ws://127.0.0.1/rpc', { socketFactory: () => socket });
    const connecting = client.connect();
    socket.emit('open');
    await connecting;
    client.markReady();
    const events: unknown[] = [];
    client.onEvent(event => events.push(event));
    const event = { connectionId: 'c', streamId: 's', seq: 1, event: 'chat.chunk', payload: { type: 'text' }, timestamp: 1 };
    socket.emit('message', JSON.stringify({ jsonrpc: '2.0', method: 'stream.event', params: event }));
    socket.emit('message', JSON.stringify({ jsonrpc: '2.0', method: 'stream.event', params: event }));
    expect(events).toEqual([event]);
  });

  it('only enters ready after the protocol initialize response', async () => {
    const socket = new FakeSocket();
    const client = new WebSocketRpcClient('ws://127.0.0.1/rpc', { socketFactory: () => socket });
    const connecting = client.connect();
    socket.emit('open');
    await connecting;
    const initializing = client.initialize({ clientId: 'client', lastConnectionId: null, platform: 'windows', protocol: { min: 1, max: 1 }, rendererVersion: '2.0.27', token: 'token' });
    socket.emit('message', JSON.stringify({ jsonrpc: '2.0', id: 'rpc-1', result: { protocolVersion: 1 } }));
    await initializing;
    expect(client.state).toBe('ready');
  });

  it('enters incompatible when initialize has no compatible protocol', async () => {
    const socket = new FakeSocket();
    const client = new WebSocketRpcClient('ws://127.0.0.1/rpc', { socketFactory: () => socket });
    const connecting = client.connect();
    socket.emit('open');
    await connecting;
    const initializing = client.initialize({ clientId: 'client', lastConnectionId: null, platform: 'windows', protocol: { min: 2, max: 2 }, rendererVersion: '2.0.27', token: 'token' });
    socket.emit('message', JSON.stringify({ jsonrpc: '2.0', id: 'rpc-1', error: { code: 'PROTOCOL_VERSION_MISMATCH', message: 'No compatible protocol version exists.' } }));
    await expect(initializing).rejects.toThrow('PROTOCOL_VERSION_MISMATCH');
    expect(client.state).toBe('incompatible');
  });
});

class FakeSocket implements RpcSocket {
  readonly readyState = 1;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: { readonly data?: unknown }) => void>>();

  addEventListener(type: 'close' | 'error' | 'message' | 'open', listener: (event: { readonly data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(): void { this.emit('close'); }
  send(data: string): void { this.sent.push(data); }
  emit(type: 'close' | 'error' | 'message' | 'open', data?: unknown): void { this.listeners.get(type)?.forEach(listener => listener({ data })); }
}
