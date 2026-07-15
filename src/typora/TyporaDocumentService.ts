import type { ActivityScheduler, DocumentService, DocumentSnapshot, FileWatchService, ScheduledTask } from '@/core/ports';

import type { TyporaEditorApi } from './editor-api';

const ACTIVE_DOCUMENT_POLL_MS = 250;

/**
 * Bridges Typora's mutable current-document surface to the application port.
 * Typora does not expose a general file-open event, so a single scheduled poll
 * detects path switches while FileWatchService observes real external writes.
 */
export class TyporaDocumentService implements DocumentService {
  private readonly listeners = new Set<(document: DocumentSnapshot | null) => void>();
  private activePath: string | null = null;
  private stopWatch: (() => void) | null = null;
  private pollTask: ScheduledTask | null = null;

  constructor(
    private readonly editor: TyporaEditorApi,
    private readonly watches: FileWatchService,
    private readonly scheduler: ActivityScheduler,
  ) {}

  async getActiveDocument(): Promise<DocumentSnapshot | null> {
    const path = this.editor.getCurrentFilePath();
    if (!path) return null;
    return { path, revision: null, text: this.editor.getAllText() };
  }

  subscribe(listener: (document: DocumentSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    this.rebind(this.editor.getCurrentFilePath());
    this.schedulePoll();
  }

  private stop(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    this.pollTask?.dispose();
    this.pollTask = null;
    this.activePath = null;
  }

  private schedulePoll(): void {
    this.pollTask = this.scheduler.schedule(ACTIVE_DOCUMENT_POLL_MS, () => {
      this.pollTask = null;
      if (this.listeners.size === 0) return;
      const nextPath = this.editor.getCurrentFilePath();
      if (nextPath !== this.activePath) {
        this.rebind(nextPath);
        void this.emitSnapshot();
      }
      this.schedulePoll();
    });
  }

  private rebind(path: string | null): void {
    this.stopWatch?.();
    this.stopWatch = null;
    this.activePath = path;
    if (!path) return;
    this.stopWatch = this.watches.watch(path, () => { void this.emitSnapshot(); });
  }

  private async emitSnapshot(): Promise<void> {
    const snapshot = await this.getActiveDocument();
    for (const listener of this.listeners) listener(snapshot);
  }
}
