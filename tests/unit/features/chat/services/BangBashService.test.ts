import type { ProcessSession, ProcessTransportFactory } from '@/core/ports';
import { BangBashService } from '@/features/chat/services/BangBashService';

describe('BangBashService', () => {
  it('runs shell commands through the host process transport and releases the session', async () => {
    let onStdout: ((chunk: string) => void) | undefined;
    let onStderr: ((chunk: string) => void) | undefined;
    let onExit: ((exit: { code: number | null; signal: string | null }) => void) | undefined;
    const session: ProcessSession = {
      pid: 42,
      write: jest.fn().mockResolvedValue(undefined),
      closeStdin: jest.fn().mockResolvedValue(undefined),
      onStdout: jest.fn((listener) => { onStdout = listener; return () => undefined; }),
      onStderr: jest.fn((listener) => { onStderr = listener; return () => undefined; }),
      onExit: jest.fn((listener) => {
        onExit = listener;
        queueMicrotask(() => {
          onStdout?.('done');
          onStderr?.('warning');
          onExit?.({ code: 0, signal: null });
        });
        return () => undefined;
      }),
      terminate: jest.fn().mockResolvedValue({ code: null, signal: 'SIGTERM' }),
      dispose: jest.fn().mockResolvedValue(undefined),
    };
    const transport: ProcessTransportFactory = {
      start: jest.fn().mockResolvedValue(session),
    };

    const result = await new BangBashService('C:\\vault', 'C:\\bin', transport).execute('git status');

    expect(result).toEqual({ command: 'git status', stdout: 'done', stderr: 'warning', exitCode: 0 });
    expect(transport.start).toHaveBeenCalledWith(expect.objectContaining({
      cwd: 'C:\\vault',
      envDelta: { PATH: 'C:\\bin' },
      stdioMode: 'pipe',
    }));
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('applies execution policy before launching a shell command', async () => {
    const transport: ProcessTransportFactory = { start: jest.fn() };
    const policy = { assertAllowed: jest.fn(() => { throw new Error('blocked'); }) };

    const result = await new BangBashService('/vault', '/bin', transport, policy).execute('echo blocked');

    expect(policy.assertAllowed).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/vault', args: expect.arrayContaining(['echo blocked']) }));
    expect(transport.start).not.toHaveBeenCalled();
    expect(result).toMatchObject({ exitCode: 1, error: 'blocked' });
  });
});
