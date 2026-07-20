import { PassThrough } from 'node:stream';

import type { ProcessSession, ProcessSpec, ProcessTransportFactory } from '@/core/ports';
import type { NodeCompatibleProcess } from '@/hosts/electron/NodeProcessSessionAdapter';

/** Node-side adapter for provider libraries that require ChildProcess-like streams. */
export function adaptSidecarProcessSession(session: ProcessSession): NodeCompatibleProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const exits = new Set<(code: number | null, signal: string | null) => void>();
  stdin.on('data', (chunk: unknown) => { void session.write(String(chunk)); });
  stdin.on('end', () => { void session.closeStdin(); });
  session.onStdout(chunk => { stdout.write(chunk); });
  session.onStderr(chunk => { stderr.write(chunk); });
  session.onExit(exit => { stdout.end(); stderr.end(); exits.forEach(listener => listener(exit.code, exit.signal)); });
  const process: NodeCompatibleProcess = {
    pid: session.pid,
    stdin, stdout, stderr,
    kill: (signal = 'SIGTERM') => { void session.terminate({ gracePeriodMs: signal === 'SIGKILL' ? 0 : 3_000, reason: 'cancelled' }); return true; },
    on: (_event, listener) => { exits.add(listener); return process; },
    once: (_event, listener) => {
      const onceListener = (code: number | null, signal: string | null): void => { exits.delete(onceListener); listener(code, signal); };
      exits.add(onceListener);
      return process;
    },
  };
  return process;
}

/**
 * Creates a ChildProcess-shaped handle before the Sidecar transport has
 * finished starting.  Provider SDKs call this synchronously, so this must use
 * Node streams directly instead of the renderer's Electron bridge.
 */
export function startDeferredSidecarProcess(
  factory: ProcessTransportFactory,
  spec: ProcessSpec,
  signal?: AbortSignal,
): NodeCompatibleProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const exits = new Set<(code: number | null, signal: string | null) => void>();
  const writes: string[] = [];
  let closeStdin = false;
  let session: ProcessSession | null = null;
  let pendingSignal: string | null = null;
  let exited = false;

  const emitExit = (code: number | null, exitSignal: string | null): void => {
    if (exited) return;
    exited = true;
    stdout.end();
    stderr.end();
    exits.forEach(listener => listener(code, exitSignal));
  };
  const process: NodeCompatibleProcess = {
    get pid() { return session?.pid ?? null; },
    stdin,
    stdout,
    stderr,
    kill: (killSignal = 'SIGTERM') => {
      pendingSignal = killSignal;
      if (session) {
        void session.terminate({
          gracePeriodMs: killSignal === 'SIGKILL' ? 0 : 3_000,
          reason: 'cancelled',
        });
      }
      return true;
    },
    on: (_event, listener) => { exits.add(listener); return process; },
    once: (_event, listener) => {
      const onceListener = (code: number | null, exitSignal: string | null): void => {
        exits.delete(onceListener);
        listener(code, exitSignal);
      };
      exits.add(onceListener);
      return process;
    },
  };

  stdin.on('data', (chunk: unknown) => {
    const value = String(chunk);
    if (session) void session.write(value).catch(() => emitExit(null, 'SIGTERM'));
    else writes.push(value);
  });
  stdin.on('end', () => {
    if (session) void session.closeStdin();
    else closeStdin = true;
  });

  void factory.start(spec, signal).then(async (started) => {
    session = started;
    started.onStdout(chunk => { stdout.write(chunk); });
    started.onStderr(chunk => { stderr.write(chunk); });
    started.onExit(exit => { emitExit(exit.code, exit.signal); });
    for (const value of writes) await started.write(value);
    if (closeStdin) await started.closeStdin();
    if (pendingSignal) {
      await started.terminate({
        gracePeriodMs: pendingSignal === 'SIGKILL' ? 0 : 3_000,
        reason: 'cancelled',
      });
    }
  }).catch(() => emitExit(null, 'SIGTERM'));

  return process;
}
