import type { ProcessSession, ProcessTransportFactory } from '@/core/ports';
import { resolveCodexAppServerLaunchSpec } from '@/providers/codex/runtime/codexAppServerSupport';

describe('resolveCodexAppServerLaunchSpec', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
  });

  it('discovers the default WSL distro through ProcessTransport', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const dispose = jest.fn().mockResolvedValue(undefined);
    const start = jest.fn(async () => createWslListSession(dispose));
    const processTransport = { start } as unknown as ProcessTransportFactory;

    const spec = await resolveCodexAppServerLaunchSpec({
      app: { vault: { adapter: { basePath: 'C:\\repo' } } },
      settings: { providerConfigs: { codex: { installationMethod: 'wsl' } } },
      getResolvedProviderCliPath: () => 'codex',
      getActiveEnvironmentVariables: () => '',
    } as any, 'codex', processTransport);

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'wsl.exe',
      args: ['--list', '--verbose'],
      cwd: 'C:\\repo',
      stdioMode: 'pipe',
    }));
    expect(spec.args).toContain('Ubuntu-24.04');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function createWslListSession(dispose: jest.Mock): ProcessSession {
  return {
    pid: null,
    write: async () => undefined,
    closeStdin: async () => undefined,
    onStdout(listener) {
      listener('  NAME              STATE           VERSION\n* Ubuntu-24.04      Running         2\n');
      return () => undefined;
    },
    onStderr: () => () => undefined,
    onExit(listener) {
      queueMicrotask(() => listener({ code: 0, signal: null }));
      return () => undefined;
    },
    terminate: async () => ({ code: 0, signal: null }),
    dispose,
  };
}
