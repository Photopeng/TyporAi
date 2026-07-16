import type { ChatTurnRequest, PreparedChatTurn } from '@/core/runtime/types';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';

export interface BridgeChatClient {
  onEvent(listener: (event: RpcEventEnvelope<unknown>) => void): () => void;
  request<TResult>(method: string, params?: unknown, signal?: AbortSignal): Promise<TResult>;
}

export interface BridgeChatRuntimeOptions {
  readonly providerId?: string;
  readonly runtimeId?: string;
}

export class BridgeChatRuntime {
  private activeTurnId: string | null = null;
  private readonly providerId: string;
  private readonly runtimeId: string;

  constructor(private readonly client: BridgeChatClient, options: BridgeChatRuntimeOptions = {}) {
    this.providerId = options.providerId ?? 'fake';
    this.runtimeId = options.runtimeId ?? crypto.randomUUID();
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return { request, persistedContent: request.text, prompt: request.text, isCompact: /^\/compact(?:\s|$)/i.test(request.text), mcpMentions: request.enabledMcpServers ?? new Set() };
  }

  async *query(turn: PreparedChatTurn, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const turnId = crypto.randomUUID();
    this.activeTurnId = turnId;
    const queue = new StreamQueue();
    const unsubscribe = this.client.onEvent(event => {
      if (event.streamId !== turnId || event.event !== 'chat.chunk' || !isStreamChunk(event.payload)) return;
      queue.push(event.payload);
    });
    try {
      await this.client.request('chat.createRuntime', { providerId: this.providerId, runtimeId: this.runtimeId }, signal);
      await this.client.request('chat.startTurn', { prompt: turn.prompt, turnId, providerId: this.providerId, runtimeId: this.runtimeId }, signal);
      for (;;) {
        const chunk = await queue.next(signal);
        if (!chunk) return;
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') return;
      }
    } finally {
      unsubscribe();
      queue.close();
      if (this.activeTurnId === turnId) this.activeTurnId = null;
    }
  }

  cancel(): Promise<void> {
    if (!this.activeTurnId) return Promise.resolve();
    return this.client.request('chat.cancelTurn', { turnId: this.activeTurnId });
  }

  dispose(): Promise<unknown> { return this.client.request('chat.disposeRuntime', { providerId: this.providerId, runtimeId: this.runtimeId }); }
}

class StreamQueue {
  private readonly chunks: StreamChunk[] = [];
  private readonly waiters: Array<(chunk: StreamChunk | null) => void> = [];
  private closed = false;
  push(chunk: StreamChunk): void { const waiter = this.waiters.shift(); if (waiter) waiter(chunk); else this.chunks.push(chunk); }
  close(): void { this.closed = true; this.waiters.splice(0).forEach(waiter => waiter(null)); }
  next(signal?: AbortSignal): Promise<StreamChunk | null> {
    const chunk = this.chunks.shift();
    if (chunk) return Promise.resolve(chunk);
    if (this.closed || signal?.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
      this.waiters.push(resolve);
      signal?.addEventListener('abort', () => resolve(null), { once: true });
    });
  }
}

function isStreamChunk(value: unknown): value is StreamChunk {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return typeof (value as { type?: unknown }).type === 'string';
}
