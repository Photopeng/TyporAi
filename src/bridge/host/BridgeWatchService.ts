import type { FileChangeEvent, FileWatchService } from '@/core/ports';

import type { WebSocketRpcClient } from '../client/WebSocketRpcClient';

interface WatchChangedPayload extends FileChangeEvent { readonly watchId: string; }

/** Maps Sidecar watch streams back onto the existing synchronous Host contract. */
export class BridgeWatchService implements FileWatchService {
  private readonly listeners = new Map<string, (event: FileChangeEvent) => void>();
  private readonly unsubscribeEvents: () => void;

  constructor(private readonly rpc: WebSocketRpcClient) {
    this.unsubscribeEvents = rpc.onEvent(event => {
      if (event.event !== 'watch.changed' || !isWatchChange(event.payload)) return;
      this.listeners.get(event.payload.watchId)?.({ path: event.payload.path, type: event.payload.type });
    });
  }

  watch(path: string, listener: (event: FileChangeEvent) => void): () => void {
    let disposed = false;
    let watchId: string | null = null;
    void this.rpc.request<{ watchId: string }>('watch.subscribe', { path }).then(result => {
      if (disposed) { void this.rpc.request('watch.unsubscribe', { watchId: result.watchId }); return; }
      watchId = result.watchId;
      this.listeners.set(watchId, listener);
    });
    return () => {
      disposed = true;
      if (!watchId) return;
      this.listeners.delete(watchId);
      void this.rpc.request('watch.unsubscribe', { watchId });
    };
  }

  dispose(): void { this.listeners.clear(); this.unsubscribeEvents(); }
}

function isWatchChange(value: unknown): value is WatchChangedPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.watchId === 'string' && typeof candidate.path === 'string'
    && (candidate.type === 'modified' || candidate.type === 'renamed' || candidate.type === 'deleted');
}
