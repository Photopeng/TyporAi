import type { WatchBackend } from '@/application/watch/WatchRegistry';
import type { FileChangeEvent } from '@/core/ports';

import { electronRequire } from './electronRequire';

type FsModule = {
  existsSync(path: string): boolean;
  watch(path: string, options: { persistent: boolean }, listener: (eventType: string) => void): { close(): void };
};

/** Electron fs.watch adapter. A rename event is classified by checking whether
 * the watched path still exists; this is the only reliable distinction fs.watch
 * exposes for a single watched file on Windows/Linux. */
export class ElectronWatchBackend implements WatchBackend {
  watch(path: string, listener: (event: FileChangeEvent) => void): () => void {
    const fs = electronRequire('fs') as FsModule;
    const watcher = fs.watch(path, { persistent: false }, eventType => {
      if (eventType === 'change') {
        listener({ path, type: 'modified' });
        return;
      }
      listener({ path, type: fs.existsSync(path) ? 'renamed' : 'deleted' });
    });
    return () => watcher.close();
  }
}
