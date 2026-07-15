import { ProviderRuntimeContainer } from '@/application/providers/ProviderRuntimeContainer';
import type { HostServices } from '@/core/ports';

const host = {} as HostServices;

describe('ProviderRuntimeContainer', () => {
  it('owns created runtimes and rejects work after disposal', async () => {
    const cleanup = jest.fn();
    const container = new ProviderRuntimeContainer(host);
    container.create({ create: () => ({ cleanup }) });
    await container.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => container.create({ create: () => ({ cleanup }) })).toThrow('disposed');
  });

  it('releases a runtime that is cleaned up before container disposal', async () => {
    const cleanup = jest.fn();
    const container = new ProviderRuntimeContainer(host);
    const runtime = container.create({ create: () => ({ cleanup }) });

    await runtime.cleanup();
    await container.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans up owned runtimes in reverse creation order without overlap', async () => {
    const events: string[] = [];
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
    const container = new ProviderRuntimeContainer(host);
    container.create({ create: () => ({ cleanup: async () => { events.push('first'); } }) });
    container.create({ create: () => ({
      cleanup: async () => {
        events.push('second:start');
        await secondGate;
        events.push('second:end');
      },
    }) });

    const disposal = container.dispose();
    await Promise.resolve();
    expect(events).toEqual(['second:start']);

    releaseSecond?.();
    await disposal;
    expect(events).toEqual(['second:start', 'second:end', 'first']);
  });
});
