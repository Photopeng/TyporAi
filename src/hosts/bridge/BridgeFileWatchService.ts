import type { FileChangeEvent, FileWatchService } from '@/core/ports';

import type { BridgeClient } from './BridgeClient';

interface WatchEvent extends FileChangeEvent { readonly watchId: string; }

export class BridgeFileWatchService implements FileWatchService {
  private readonly records = new Set<{ disposed: boolean; stop: () => void }>();

  constructor(private readonly client: BridgeClient) {}

  watch(path: string, listener: (event: FileChangeEvent) => void): () => void {
    let watchId: string | null = null;
    const unsubscribe = this.client.on('watch.changed', value => {
      const event = value as WatchEvent;
      if (event.watchId === watchId) listener({ path: event.path, type: event.type });
    });
    const record = {
      disposed: false,
      stop: () => {
        if (record.disposed) return;
        record.disposed = true;
        unsubscribe();
        this.records.delete(record);
        if (watchId) void this.client.call('watch.stop', { watchId });
      },
    };
    this.records.add(record);
    void this.client.call<{ watchId: string }>('watch.start', { path }).then(result => {
      watchId = result.watchId;
      if (record.disposed) void this.client.call('watch.stop', { watchId });
    }).catch(() => record.stop());
    return record.stop;
  }

  dispose(): void { [...this.records].forEach(record => record.stop()); }
}
