import { ElectronProcessTransport } from '@/hosts/electron/ElectronProcessTransport';

describe('ElectronProcessTransport', () => {
  const originalWindow = globalThis.window;

  afterEach(() => { globalThis.window = originalWindow; });

  it('streams stdio and rejects writes after exit through the host contract', async () => {
    const stdout: Array<(chunk: { toString(): string }) => void> = [];
    const stderr: Array<(chunk: { toString(): string }) => void> = [];
    const exits: Array<(code: number | null, signal: string | null) => void> = [];
    const write = jest.fn((_data: string, done?: (error?: Error | null) => void) => done?.());
    const child = {
      pid: 42,
      stdin: { write, end: jest.fn() },
      stdout: { on: jest.fn((_event: string, listener: (chunk: { toString(): string }) => void) => stdout.push(listener)) },
      stderr: { on: jest.fn((_event: string, listener: (chunk: { toString(): string }) => void) => stderr.push(listener)) },
      on: jest.fn((_event: string, listener: (code: number | null, signal: string | null) => void) => exits.push(listener)),
      kill: jest.fn(),
    };
    const spawn = jest.fn(() => child);
    globalThis.window = {
      reqnode: (moduleName: string): unknown => moduleName === 'child_process' ? { spawn } : moduleName === 'process' ? { env: {} } : undefined,
    } as typeof window;

    const session = await new ElectronProcessTransport().start({ executable: 'tool', args: [], cwd: '/tmp', stdioMode: 'pipe' });
    const received: string[] = [];
    session.onStdout(chunk => received.push(chunk));
    stdout[0]({ toString: () => 'first chunk' });
    await session.write('input');
    exits[0](0, null);

    expect(spawn).toHaveBeenCalledWith('tool', [], expect.objectContaining({ cwd: '/tmp', stdio: 'pipe' }));
    expect(received).toEqual(['first chunk']);
    expect(write).toHaveBeenCalledWith('input', expect.any(Function));
    await expect(session.write('late')).rejects.toThrow('exited process');
    expect(stderr).toHaveLength(1);
  });

  it('applies the execution policy before spawning', async () => {
    const assertAllowed = jest.fn(() => { throw new Error('blocked'); });
    await expect(new ElectronProcessTransport({ assertAllowed }).start({
      executable: 'tool', args: [], cwd: '/tmp', stdioMode: 'pipe',
    })).rejects.toThrow('blocked');
    expect(assertAllowed).toHaveBeenCalledTimes(1);
  });

  it('terminates the Unix process group so child processes are reclaimed', async () => {
    const exits: Array<(code: number | null, signal: string | null) => void> = [];
    const child = {
      pid: 42,
      stdin: { write: jest.fn(), end: jest.fn() },
      stdout: { on: jest.fn() }, stderr: { on: jest.fn() },
      on: jest.fn((_event: string, listener: (code: number | null, signal: string | null) => void) => exits.push(listener)),
      kill: jest.fn(),
    };
    const spawn = jest.fn(() => child);
    const kill = jest.fn();
    globalThis.window = {
      reqnode: (moduleName: string): unknown => moduleName === 'child_process' ? { spawn } : { env: {}, platform: 'linux', kill },
    } as typeof window;

    const session = await new ElectronProcessTransport().start({ executable: 'tool', args: [], cwd: '/tmp', stdioMode: 'pipe' });
    await session.terminate({ gracePeriodMs: 0, reason: 'cancelled' });

    expect(spawn).toHaveBeenCalledWith('tool', [], expect.objectContaining({ detached: true }));
    expect(kill).toHaveBeenCalledWith(-42, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-42, 'SIGKILL');
    expect(exits).toHaveLength(1);
  });
});
