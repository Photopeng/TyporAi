import type { SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { PassThrough } from 'stream';

import type { ExecutionPolicy, ProcessSession, ProcessTransportFactory } from '@/core/ports';
import { createCustomSpawnFunction } from '@/providers/claude/runtime/customSpawn';

function createTransport(): { transport: ProcessTransportFactory; session: ProcessSession } {
  const session: ProcessSession = {
    pid: 7,
    write: jest.fn().mockResolvedValue(undefined),
    closeStdin: jest.fn().mockResolvedValue(undefined),
    onStdout: jest.fn(() => () => undefined),
    onStderr: jest.fn(() => () => undefined),
    onExit: jest.fn(() => () => undefined),
    terminate: jest.fn().mockResolvedValue({ code: 0, signal: null }),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  return { session, transport: { start: jest.fn().mockResolvedValue(session) } };
}

describe('createCustomSpawnFunction', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      reqnode: (moduleName: string): unknown => moduleName === 'stream' ? { PassThrough } : undefined,
    };
  });

  it('creates SDK-compatible streams through the host transport', async () => {
    const { transport, session } = createTransport();
    const spawn = createCustomSpawnFunction('/enhanced/path', transport);
    const child = spawn({
      command: '/usr/local/bin/claude',
      args: ['--output-format', 'stream-json'],
      cwd: '/vault',
      env: { PATH: '/enhanced/path' },
      signal: new AbortController().signal,
    } as SpawnOptions);

    child.stdin?.write('input');
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.start).toHaveBeenCalledWith({
      executable: '/usr/local/bin/claude',
      args: ['--output-format', 'stream-json'],
      cwd: '/vault',
      envDelta: { PATH: '/enhanced/path' },
      stdioMode: 'pipe',
    }, expect.anything());
    expect(session.write).toHaveBeenCalledWith('input');
  });

  it('checks execution policy before opening a session', () => {
    const { transport } = createTransport();
    const policy: ExecutionPolicy = { assertAllowed: jest.fn(() => { throw new Error('blocked'); }) };
    const spawn = createCustomSpawnFunction('/enhanced/path', transport, policy);

    expect(() => spawn({ command: 'claude', args: [], cwd: '/vault' } as unknown as SpawnOptions)).toThrow('blocked');
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('fails explicitly when no host transport is available', () => {
    const spawn = createCustomSpawnFunction('/enhanced/path');
    expect(() => spawn({ command: 'claude', args: [], cwd: '/vault' } as unknown as SpawnOptions))
      .toThrow('Claude process transport is unavailable');
  });
});
