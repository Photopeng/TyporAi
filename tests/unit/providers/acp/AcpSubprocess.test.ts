import { PassThrough } from 'stream';

import type { ExecutionPolicy, ProcessSession, ProcessTransportFactory } from '@/core/ports';
import { AcpSubprocess } from '@/providers/acp/AcpSubprocess';
import { adaptSidecarProcessSession } from '@/sidecar/services/process/adaptProcessSession';

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

const launch = {
  args: ['acp'], command: '/opt/opencode/bin/opencode', cwd: '/vault', env: { PATH: '/usr/bin' },
};

describe('AcpSubprocess', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      reqnode: (moduleName: string): unknown => moduleName === 'stream' ? { PassThrough } : undefined,
    };
  });

  it('starts through the host transport', async () => {
    const { transport, session } = createTransport();
    const subprocess = new AcpSubprocess(launch, transport);
    await subprocess.start();
    subprocess.stdin.write('request');
    await Promise.resolve();

    expect(transport.start).toHaveBeenCalledWith(expect.objectContaining({
      executable: launch.command, cwd: launch.cwd, stdioMode: 'pipe',
    }));
    expect(session.write).toHaveBeenCalledWith('request');
    expect(subprocess.isAlive()).toBe(true);
  });

  it('checks execution policy before opening a session', async () => {
    const policy: ExecutionPolicy = { assertAllowed: jest.fn(() => { throw new Error('blocked'); }) };
    const { transport } = createTransport();
    await expect(new AcpSubprocess(launch, transport, policy).start()).rejects.toThrow('blocked');
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('uses Node streams when Sidecar provides the process adapter', async () => {
    const { transport, session } = createTransport();
    (globalThis as { window?: unknown }).window = undefined;
    const subprocess = new AcpSubprocess(launch, transport, undefined, adaptSidecarProcessSession);

    await subprocess.start();
    subprocess.stdin.write('request');
    await Promise.resolve();

    expect(session.write).toHaveBeenCalledWith('request');
  });

  it('rejects direct process fallback', async () => {
    await expect(new AcpSubprocess(launch).start()).rejects.toThrow('ACP process transport is unavailable');
  });

  it('includes stderr when a started ACP process exits unsuccessfully', async () => {
    const { transport, session } = createTransport();
    const subprocess = new AcpSubprocess(launch, transport);
    const closed = jest.fn();
    subprocess.onClose(closed);
    await subprocess.start();
    const listener = (session.onStderr as jest.Mock).mock.calls[(session.onStderr as jest.Mock).mock.calls.length - 1][0] as (chunk: string) => void;
    listener('OpenCode could not start');
    const exit = (session.onExit as jest.Mock).mock.calls[(session.onExit as jest.Mock).mock.calls.length - 1][0] as (exit: { code: number | null; signal: string | null }) => void;
    exit({ code: 1, signal: null });

    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('OpenCode could not start') }));
  });
});
