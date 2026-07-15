import { PassThrough } from 'stream';

import type { ProcessSession, ProcessTransportFactory } from '@/core/ports';
import { CodexAppServerProcess } from '@/providers/codex/runtime/CodexAppServerProcess';
import type { CodexLaunchSpec } from '@/providers/codex/runtime/codexLaunchTypes';

function createLaunchSpec(): CodexLaunchSpec {
  const pathMapper = {
    target: { method: 'host-native', platformFamily: 'unix', platformOs: 'linux' },
    toTargetPath: jest.fn(), toHostPath: jest.fn(), mapTargetPathList: jest.fn(), canRepresentHostPath: jest.fn(),
  } as CodexLaunchSpec['pathMapper'];
  return {
    target: { method: 'host-native', platformFamily: 'unix', platformOs: 'linux' },
    command: '/usr/bin/codex', args: ['app-server'], spawnCwd: '/workspace', targetCwd: '/workspace', env: {}, pathMapper,
  };
}

function createTransport(): { transport: ProcessTransportFactory; session: ProcessSession } {
  const exits = new Set<(exit: { code: number | null; signal: string | null }) => void>();
  const session: ProcessSession = {
    pid: 42,
    write: jest.fn().mockResolvedValue(undefined),
    closeStdin: jest.fn().mockResolvedValue(undefined),
    onStdout: jest.fn(() => () => undefined),
    onStderr: jest.fn(() => () => undefined),
    onExit: jest.fn(listener => { exits.add(listener); return () => exits.delete(listener); }),
    terminate: jest.fn().mockImplementation(async () => {
      exits.forEach(listener => listener({ code: null, signal: 'SIGTERM' }));
      return { code: null, signal: 'SIGTERM' };
    }),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  return { session, transport: { start: jest.fn().mockResolvedValue(session) } };
}

describe('CodexAppServerProcess', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      reqnode: (moduleName: string): unknown => moduleName === 'stream' ? { PassThrough } : undefined,
    };
  });

  it('starts through the host process transport and exposes SDK streams', async () => {
    const { transport, session } = createTransport();
    const server = new CodexAppServerProcess(createLaunchSpec(), transport);

    await server.start();
    server.stdin.write('request');
    await Promise.resolve();

    expect(transport.start).toHaveBeenCalledWith(expect.objectContaining({
      executable: '/usr/bin/codex', cwd: '/workspace', stdioMode: 'pipe',
    }));
    expect(session.write).toHaveBeenCalledWith('request');
    expect(server.isAlive()).toBe(true);
  });

  it('terminates the host session during shutdown', async () => {
    const { transport, session } = createTransport();
    const server = new CodexAppServerProcess(createLaunchSpec(), transport);
    await server.start();

    await server.shutdown();

    expect(session.terminate).toHaveBeenCalled();
  });

  it('rejects direct process fallback', async () => {
    const server = new CodexAppServerProcess(createLaunchSpec());
    await expect(server.start()).rejects.toThrow('Codex process transport is unavailable');
  });
});
