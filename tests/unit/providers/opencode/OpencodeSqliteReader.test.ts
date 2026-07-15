import type { ProcessTransportFactory } from '@/core/ports';
import {
  loadOpencodeSessionRows,
} from '@/providers/opencode/history/OpencodeSqliteReader';

describe('loadOpencodeSessionRows', () => {
  it('uses the host transport for the SQLite helper', async () => {
    const start = jest.fn().mockResolvedValue({
      closeStdin: async () => undefined,
      dispose: jest.fn().mockResolvedValue(undefined),
      onExit: (listener: (exit: { code: number | null; signal: string | null }) => void) => {
        queueMicrotask(() => listener({ code: 0, signal: null }));
        return () => undefined;
      },
      onStderr: () => () => undefined,
      onStdout: (listener: (chunk: string) => void) => {
        listener(JSON.stringify({ messageRows: [{ id: 'msg-user' }], partRows: [{ id: 'part-user' }] }));
        return () => undefined;
      },
      pid: null,
      terminate: async () => ({ code: 0, signal: null }),
      write: async () => undefined,
    });

    await expect(loadOpencodeSessionRows('/tmp/opencode.db', 'ses-transport', {
      findNodeExecutable: () => '/usr/local/bin/node',
      processTransport: { start } as unknown as ProcessTransportFactory,
      requireSqliteModule: () => null,
    })).resolves.toEqual({
      messageRows: [{ id: 'msg-user' }],
      partRows: [{ id: 'part-user' }],
    });

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      executable: '/usr/local/bin/node',
      args: expect.arrayContaining(['-e', '/tmp/opencode.db', 'ses-transport']),
      stdioMode: 'pipe',
    }));
  });

  it('returns null when no host transport is available', async () => {
    await expect(loadOpencodeSessionRows('/tmp/opencode.db', 'ses-missing', {
      requireSqliteModule: () => null,
    })).resolves.toBeNull();
  });

  it('terminates and disposes a helper that exceeds the time budget', async () => {
    jest.useFakeTimers();
    const terminate = jest.fn().mockResolvedValue({ code: null, signal: 'SIGTERM' });
    const dispose = jest.fn().mockResolvedValue(undefined);
    const start = jest.fn().mockResolvedValue({
      closeStdin: async () => undefined, dispose,
      onExit: () => () => undefined, onStderr: () => () => undefined, onStdout: () => () => undefined,
      pid: null, terminate, write: async () => undefined,
    });

    const loading = loadOpencodeSessionRows('/tmp/opencode.db', 'ses-timeout', {
      findNodeExecutable: () => '/usr/local/bin/node',
      processTransport: { start } as unknown as ProcessTransportFactory,
      requireSqliteModule: () => null,
    });
    await jest.advanceTimersByTimeAsync(30_000);

    await expect(loading).resolves.toBeNull();
    expect(terminate).toHaveBeenCalledWith({ gracePeriodMs: 0, reason: 'timeout' });
    expect(dispose).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
