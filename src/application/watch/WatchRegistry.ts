import type { FileChangeEvent, FileWatchService } from '@/core/ports';

export type WatchEvent = FileChangeEvent;
export interface WatchBackend { watch(path: string, listener: (event: WatchEvent) => void): () => void; }

export class WatchRegistry implements FileWatchService {
  private readonly records = new Map<string, { listeners: Set<(event: WatchEvent) => void>; stop: () => void }>();
  constructor(private readonly backend: WatchBackend) {}

  watch(path: string, listener: (event: WatchEvent) => void): () => void {
    let record = this.records.get(path);
    if (!record) {
      const listeners = new Set<(event: WatchEvent) => void>();
      record = { listeners, stop: this.backend.watch(path, event => listeners.forEach(value => value(event))) };
      this.records.set(path, record);
    }
    record.listeners.add(listener);
    return () => {
      record?.listeners.delete(listener);
      if (record && record.listeners.size === 0) { record.stop(); this.records.delete(path); }
    };
  }
  dispose(): void { this.records.forEach(record => record.stop()); this.records.clear(); }
}
