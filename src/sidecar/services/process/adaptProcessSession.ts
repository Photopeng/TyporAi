import { PassThrough } from 'node:stream';

import type { ProcessSession } from '@/core/ports';
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
