import type { JsonRpcRequest, JsonRpcResponse, RpcEventEnvelope, SystemInitializeResult } from '@/protocol';

import { type ConnectionState,ConnectionStateMachine } from './ConnectionStateMachine';
import { reconnectDelayMs } from './reconnect';
import { SubscriptionManager } from './SubscriptionManager';

export interface RpcSocket {
  readonly readyState: number;
  close(code?: number): void;
  send(data: string): void;
  addEventListener(type: 'close' | 'error' | 'message' | 'open', listener: (event: { readonly data?: unknown }) => void, options?: { readonly once?: boolean }): void;
}

export interface WebSocketRpcClientOptions {
  readonly requestTimeoutMs?: number;
  readonly socketFactory: (endpoint: string) => RpcSocket;
}

export interface InitializeParams {
  readonly clientId: string;
  readonly lastConnectionId: string | null;
  readonly platform: 'windows' | 'macos';
  readonly protocol: { readonly min: number; readonly max: number };
  readonly rendererVersion: string;
  readonly token: string;
}

export class WebSocketRpcClient {
  private readonly stateMachine = new ConnectionStateMachine();
  private readonly subscriptions = new SubscriptionManager();
  private readonly eventListeners = new Set<(event: RpcEventEnvelope<unknown>) => void>();
  private readonly pending = new Map<string, { reject(error: Error): void; resolve(result: unknown): void; timeout: ReturnType<typeof setTimeout> }>();
  private socket: RpcSocket | null = null;
  private sequence = 0;
  private connectionId: string | null = null;

  constructor(private readonly endpoint: string, private readonly options: WebSocketRpcClientOptions) {}

  get state(): ConnectionState { return this.stateMachine.state; }

  async connect(): Promise<void> {
    this.stateMachine.transition(this.state === 'reconnecting' ? 'connecting' : 'connecting');
    const socket = this.options.socketFactory(this.endpoint);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Unable to connect to Sidecar.')), { once: true });
    });
    socket.addEventListener('message', event => this.handleMessage(String(event.data)));
    socket.addEventListener('close', () => this.handleClose());
    this.stateMachine.transition('authenticating');
  }

  async reconnect(attempt: number): Promise<void> {
    if (this.state !== 'reconnecting') throw new Error('Sidecar client is not reconnecting.');
    await new Promise<void>(resolve => setTimeout(resolve, reconnectDelayMs(attempt)));
    await this.connect();
  }

  markReady(): void { this.stateMachine.transition('ready'); }

  get lastConnectionId(): string | null { return this.connectionId; }

  async initialize(params: InitializeParams): Promise<SystemInitializeResult> {
    try {
      const result = await this.request<SystemInitializeResult>('system.initialize', params);
      this.connectionId = result.connectionId;
      this.markReady();
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('PROTOCOL_VERSION_MISMATCH')) this.stateMachine.transition('incompatible');
      throw error;
    }
  }

  onEvent(listener: (event: RpcEventEnvelope<unknown>) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  notify(method: string, params?: unknown): void {
    if (!this.socket || this.state !== 'ready') throw new Error('Sidecar is not ready.');
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
  }

  request<TResult>(method: string, params?: unknown, signal?: AbortSignal): Promise<TResult> {
    const isInitialize = method === 'system.initialize' && this.state === 'authenticating';
    if (!this.socket || (this.state !== 'ready' && !isInitialize)) return Promise.reject(new Error('Sidecar is not ready.'));
    const id = `rpc-${++this.sequence}`;
    const timeoutMs = this.options.requestTimeoutMs ?? 10_000;
    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => this.rejectPending(id, new Error(`Sidecar request timed out: ${method}`)), timeoutMs);
      this.pending.set(id, { reject, resolve, timeout });
      signal?.addEventListener('abort', () => this.rejectPending(id, new Error('Sidecar request cancelled.')), { once: true });
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.socket?.send(JSON.stringify(request));
    });
  }

  dispose(): void {
    if (this.state !== 'disposed') this.stateMachine.transition('disposed');
    this.socket?.close(1000);
    this.socket = null;
    this.rejectAll(new Error('Sidecar client disposed.'));
  }

  private handleMessage(raw: string): void {
    let response: JsonRpcResponse | { method?: unknown; params?: unknown };
    try { response = JSON.parse(raw) as JsonRpcResponse | { method?: unknown; params?: unknown }; } catch { return; }
    const event = 'method' in response && response.method === 'stream.event' ? response.params : undefined;
    if (isEventEnvelope(event)) {
      if (this.subscriptions.consume(event)) this.eventListeners.forEach(listener => listener(event));
      return;
    }
    if (!('id' in response)) return;
    const pending = this.pending.get(String(response.id));
    if (!pending) return;
    this.pending.delete(String(response.id));
    clearTimeout(pending.timeout);
    if ('error' in response) pending.reject(new Error(`${response.error.code}: ${response.error.message}`)); else pending.resolve(response.result);
  }

  private handleClose(): void {
    if (this.state === 'disposed') return;
    this.stateMachine.transition('reconnecting');
    this.rejectAll(new Error('Sidecar disconnected.'));
  }

  private rejectPending(id: string, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private rejectAll(error: Error): void { for (const id of [...this.pending.keys()]) this.rejectPending(id, error); }
}

function isEventEnvelope(value: unknown): value is RpcEventEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.connectionId === 'string' && typeof event.streamId === 'string' && typeof event.seq === 'number' && typeof event.event === 'string' && typeof event.timestamp === 'number' && 'payload' in event;
}
