import { ProviderServiceContainer } from '@/application/ProviderServiceContainer';

describe('ProviderServiceContainer', () => {
  it('disposes services in reverse creation order without concurrent teardown', async () => {
    const container = new ProviderServiceContainer();
    const events: string[] = [];
    let releaseSecond: (() => void) | undefined;
    const first = { dispose: jest.fn(async () => { events.push('first'); }) };
    const second = { dispose: jest.fn(async () => {
      events.push('second:start');
      await new Promise<void>(resolve => { releaseSecond = resolve; });
      events.push('second:end');
    }) };
    container.getOrCreate('first', () => first);
    container.getOrCreate('second', () => second);

    const disposing = container.dispose();
    await Promise.resolve();
    expect(events).toEqual(['second:start']);
    expect(first.dispose).not.toHaveBeenCalled();
    releaseSecond?.();
    await disposing;

    expect(events).toEqual(['second:start', 'second:end', 'first']);
  });
});
