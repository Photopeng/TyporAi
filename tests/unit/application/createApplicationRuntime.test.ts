import { createApplicationRuntime } from '@/application/createApplicationRuntime';
import type { HostServices } from '@/core/ports';

function host(): HostServices {
  return {
    platform: { runtime: 'electron', operatingSystem: 'windows', appVersion: null },
    files: {} as HostServices['files'],
    watches: { watch: jest.fn(), dispose: jest.fn() },
    paths: {} as HostServices['paths'],
    environment: {} as HostServices['environment'],
    processes: {} as HostServices['processes'],
    documents: {} as HostServices['documents'],
    scheduler: { schedule: jest.fn(), dispose: jest.fn() },
    settings: {} as HostServices['settings'],
    workspace: null,
    notifications: { show: jest.fn() },
  };
}

describe('createApplicationRuntime', () => {
  it('creates provider services per runtime and disposes them with the runtime', async () => {
    const firstHost = host();
    const first = createApplicationRuntime(firstHost);
    const second = createApplicationRuntime(host());
    const dispose = jest.fn();

    const firstService = first.providers.getOrCreate('claude', () => ({ dispose }));
    const secondService = second.providers.getOrCreate('claude', () => ({ dispose: jest.fn() }));

    expect(firstService).not.toBe(secondService);
    await first.dispose();
    await first.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(firstHost.scheduler.dispose).toHaveBeenCalledTimes(1);
    expect(() => first.providers.getOrCreate('codex', () => ({ dispose: jest.fn() }))).toThrow('disposed');
  });
});
