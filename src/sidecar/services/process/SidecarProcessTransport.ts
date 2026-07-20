import { type ChildProcess,spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessExit, type ProcessLease, type ProcessSession, type ProcessSpec, type ProcessTransportFactory, type TerminationReason } from '@/core/ports';

import type { ManagedProcessRegistry } from './ManagedProcessRegistry';

/** Node-native process transport owned exclusively by Sidecar. */
export class SidecarProcessTransport implements ProcessTransportFactory {
  constructor(private readonly registry: ManagedProcessRegistry, private readonly policy: ExecutionPolicy = new DefaultExecutionPolicy({ maxConcurrent: 8, maxOutputBytes: 16 * 1024 * 1024 })) {}

  async start(spec: ProcessSpec, signal?: AbortSignal): Promise<ProcessSession> {
    if (spec.stdioMode !== 'pipe') throw new Error('PTY transport is not available in Sidecar v1.');
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const lease = this.policy.acquire?.(spec);
    if (!lease) this.policy.assertAllowed(spec);
    let child: ChildProcess;
    try {
      child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        detached: process.platform !== 'win32',
        env: applyEnvironment(spec.envDelta),
        stdio: 'pipe',
        windowsHide: true,
        ...(spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
      });
    } catch (error) {
      lease?.release();
      throw processStartError(spec.executable, error);
    }
    const id = randomUUID();
    const session = new SidecarProcessSession(child, process.platform === 'win32', lease, () => this.registry.remove(id));
    try {
      await waitForSpawn(child);
    } catch (error) {
      // The session receives the same error event and releases the lease. Do
      // not turn ENOENT/EACCES into an ambiguous process exit for the UI.
      throw processStartError(spec.executable, error);
    }
    if (session.hasExited) {
      return session;
    }
    this.registry.add({
      id,
      terminate: async signalName => ({
        exit: await session.terminate({ gracePeriodMs: signalName === 'SIGKILL' ? 0 : 3_000, reason: 'forced' }),
        reaped: session.hasExited,
      }),
    });
    signal?.addEventListener('abort', () => { void session.terminate({ gracePeriodMs: 0, reason: 'cancelled' }); }, { once: true });
    return session;
  }
}

class SidecarProcessSession implements ProcessSession {
  readonly pid: number | null;
  private readonly stdout = new Set<(chunk: string) => void>();
  private readonly stderr = new Set<(chunk: string) => void>();
  private readonly exits = new Set<(exit: ProcessExit) => void>();
  private exit: ProcessExit | null = null;
  private resolveExit: ((exit: ProcessExit) => void) | null = null;
  private readonly exitPromise = new Promise<ProcessExit>(resolve => { this.resolveExit = resolve; });
  private disposed = false;

  constructor(private readonly child: ChildProcess, private readonly isWindows: boolean, private readonly lease: ProcessLease | undefined, private readonly unregister: () => void) {
    this.pid = child.pid ?? null;
    child.stdout?.on('data', chunk => this.emitOutput(chunk.toString(), this.stdout));
    child.stderr?.on('data', chunk => this.emitOutput(chunk.toString(), this.stderr));
    child.on('exit', (code, signal) => this.complete({ code, signal }));
    child.on('error', () => this.complete({ code: null, signal: null }));
  }

  async write(data: string): Promise<void> {
    if (!this.child.stdin || this.exit || this.disposed) throw new Error('Cannot write to an exited process.');
    await new Promise<void>((resolve, reject) => this.child.stdin?.write(data, error => error ? reject(error) : resolve()));
  }
  async closeStdin(): Promise<void> { this.child.stdin?.end(); }
  onStdout(listener: (chunk: string) => void): () => void { this.stdout.add(listener); return () => this.stdout.delete(listener); }
  onStderr(listener: (chunk: string) => void): () => void { this.stderr.add(listener); return () => this.stderr.delete(listener); }
  onExit(listener: (exit: ProcessExit) => void): () => void { if (this.exit) listener(this.exit); else this.exits.add(listener); return () => this.exits.delete(listener); }

  async terminate(options: { readonly gracePeriodMs: number; readonly reason: TerminationReason }): Promise<ProcessExit> {
    if (this.exit) return this.exit;
    this.killTree('SIGTERM');
    if (options.gracePeriodMs > 0) await this.waitForExit(options.gracePeriodMs);
    if (!this.exit) this.killTree('SIGKILL');
    await this.waitForExit(2_000);
    return this.exit ?? { code: null, signal: 'SIGKILL', reason: options.reason };
  }
  async dispose(): Promise<void> { this.disposed = true; if (!this.exit) await this.terminate({ gracePeriodMs: 0, reason: 'disposed' }); this.stdout.clear(); this.stderr.clear(); this.exits.clear(); }

  private emitOutput(value: string, listeners: Set<(chunk: string) => void>): void {
    try { this.lease?.recordOutput(new TextEncoder().encode(value).byteLength); listeners.forEach(listener => listener(value)); }
    catch { void this.terminate({ gracePeriodMs: 0, reason: 'forced' }); }
  }
  get hasExited(): boolean { return this.exit !== null; }

  private async waitForExit(timeoutMs: number): Promise<void> {
    if (this.exit) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      this.exitPromise,
      new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
    if (timer) clearTimeout(timer);
  }
  private complete(exit: ProcessExit): void { if (this.exit) return; this.exit = exit; this.resolveExit?.(exit); this.resolveExit = null; this.lease?.release(); this.unregister(); this.exits.forEach(listener => listener(exit)); }
  private killTree(signal: NodeJS.Signals): void {
    if (this.isWindows && this.pid) { spawn('taskkill', ['/pid', String(this.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); return; }
    if (this.pid) { try { process.kill(-this.pid, signal); return; } catch { /* fall through */ } }
    this.child.kill(signal);
  }
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };
    const onSpawn = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

function processStartError(executable: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Unable to start ${executable}: ${message}`);
}

function applyEnvironment(delta: ProcessSpec['envDelta']): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const [key, value] of Object.entries(delta ?? {})) { if (value === null) delete environment[key]; else environment[key] = value; }
  return environment;
}
