import { type RpcEvent, type RpcRequest, type RpcResponse, SIDECAR_PROTOCOL_VERSION, type SidecarBootstrap } from '@/sidecar/protocol';

type EventListener = (params: unknown) => void;

export class BridgeClient {
  private readonly eventListeners = new Map<string, Set<EventListener>>();
  private readonly pending = new Map<string, { reject(error: Error): void; resolve(value: unknown): void }>();
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;

  constructor(private readonly bootstrap: SidecarBootstrap) {}

  async call<T>(method: string, params?: unknown): Promise<T> {
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('TyporAi sidecar is not connected');
    const id = crypto.randomUUID();
    const result = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: value => resolve(value as T), reject }));
    const request: RpcRequest = { id, method, params };
    socket.send(JSON.stringify(request));
    return result;
  }

  on(event: string, listener: EventListener): () => void {
    const listeners = this.eventListeners.get(event) ?? new Set<EventListener>();
    listeners.add(listener);
    this.eventListeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  dispose(): void {
    this.socket?.close();
    this.socket = null;
    this.connecting = null;
    for (const pending of this.pending.values()) pending.reject(new Error('TyporAi sidecar disconnected'));
    this.pending.clear();
    this.eventListeners.clear();
  }

  private async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (!this.connecting) this.connecting = this.open();
    try { await this.connecting; } finally { this.connecting = null; }
  }

  private async open(): Promise<void> {
    const socket = new WebSocket(this.bootstrap.endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Unable to connect to TyporAi sidecar')), { once: true });
    });
    socket.addEventListener('message', event => this.handleMessage(String(event.data)));
    socket.addEventListener('close', () => this.rejectPending(new Error('TyporAi sidecar disconnected')));
    this.socket = socket;
    await this.call<{ protocolVersion: number }>('system.handshake', { protocolVersion: SIDECAR_PROTOCOL_VERSION, token: this.bootstrap.token });
  }

  private handleMessage(raw: string): void {
    const value = JSON.parse(raw) as RpcResponse | RpcEvent;
    if ('type' in value && value.type === 'event') {
      this.eventListeners.get(value.event)?.forEach(listener => listener(value.params));
      return;
    }
    const response = value as RpcResponse;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.error) pending.reject(new Error(response.error.message)); else pending.resolve(response.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
