import type { ActivityScheduler, FileChangeEvent, FileWatchService, ScheduledTask } from '@/core/ports';
import { TyporaDocumentService } from '@/typora/TyporaDocumentService';

describe('TyporaDocumentService', () => {
  it('forwards real watched-file changes and rebinds when the active document changes', async () => {
    let activePath: string | null = 'C:/notes/one.md';
    const watchListeners = new Map<string, (event: FileChangeEvent) => void>();
    const stopped: string[] = [];
    const watches: FileWatchService = {
      watch: jest.fn((path, listener) => {
        watchListeners.set(path, listener);
        return () => stopped.push(path);
      }),
      dispose: jest.fn(),
    };
    let poll: (() => void) | undefined;
    const scheduler: ActivityScheduler = {
      schedule: jest.fn((_delay, task) => {
        poll = task;
        return { dispose: jest.fn() } as ScheduledTask;
      }),
      dispose: jest.fn(),
    };
    const editor = {
      getAllText: () => `content:${activePath}`,
      getCurrentFilePath: () => activePath,
    } as any;
    const documents = new TyporaDocumentService(editor, watches, scheduler);
    const received: Array<string | null> = [];
    const stop = documents.subscribe(document => received.push(document?.path ?? null));

    watchListeners.get('C:/notes/one.md')?.({ path: 'C:/notes/one.md', type: 'modified' });
    await Promise.resolve();
    expect(received).toEqual(['C:/notes/one.md']);

    activePath = 'C:/notes/two.md';
    poll?.();
    await Promise.resolve();
    expect(stopped).toEqual(['C:/notes/one.md']);
    expect(received).toEqual(['C:/notes/one.md', 'C:/notes/two.md']);
    expect(watches.watch).toHaveBeenCalledWith('C:/notes/two.md', expect.any(Function));

    stop();
    expect(stopped).toEqual(['C:/notes/one.md', 'C:/notes/two.md']);
  });
});
