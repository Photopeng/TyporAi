import { type WatchEvent,WatchRegistry } from '@/application/watch/WatchRegistry';

describe('WatchRegistry', () => {
  it('shares one backend watcher until the last subscriber leaves', () => {
    let emit: ((event: WatchEvent) => void) | undefined;
    const stop = jest.fn();
    const backend = { watch: jest.fn((_path: string, listener: (event: WatchEvent) => void) => { emit = listener; return stop; }) };
    const registry = new WatchRegistry(backend);
    const first = jest.fn(); const second = jest.fn();
    const cancelFirst = registry.watch('/note.md', first); const cancelSecond = registry.watch('/note.md', second);
    emit?.({ path: '/note.md', type: 'modified' });
    cancelFirst(); expect(stop).not.toHaveBeenCalled(); cancelSecond();
    expect(backend.watch).toHaveBeenCalledTimes(1); expect(stop).toHaveBeenCalledTimes(1); expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
  });
});
