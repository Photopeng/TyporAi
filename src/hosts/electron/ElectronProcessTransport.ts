import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessExit, type ProcessLease, type ProcessSession, type ProcessSpec, type ProcessTransportFactory, type TerminationReason } from '@/core/ports';

import { electronRequire } from './electronRequire';

interface ChildProcess {
  pid?: number;
  stdin?: { write(data: string, callback?: (error?: Error | null) => void): void; end(): void };
  stdout?: { on(event: 'data', listener: (chunk: { toString(): string }) => void): void };
  stderr?: { on(event: 'data', listener: (chunk: { toString(): string }) => void): void };
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void;
  kill(signal?: string): boolean;
}

interface ChildProcessModule {
  spawn(command: string, args: readonly string[], options: {
    cwd: string;
    env?: Record<string, string>;
    stdio: 'pipe';
    windowsVerbatimArguments?: boolean;
    detached?: boolean;
  }): ChildProcess;
}

export class ElectronProcessTransport implements ProcessTransportFactory {
  constructor(private readonly policy: ExecutionPolicy = new DefaultExecutionPolicy()) {}

  async start(spec: ProcessSpec, signal?: AbortSignal): Promise<ProcessSession> {
    if (spec.stdioMode !== 'pipe') throw new Error('PTY transport is not available in the Electron D1 adapter');
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const lease = this.policy.acquire?.(spec);
    if (!lease) this.policy.assertAllowed(spec);
    const isWindows = this.platform() === 'win32';
    const child = (electronRequire('child_process') as ChildProcessModule).spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: this.environment(spec.envDelta),
      stdio: 'pipe',
      ...(!isWindows ? { detached: true } : {}),
      ...(spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    return new ElectronProcessSession(child, isWindows, signal, lease);
  }

  private environment(delta: ProcessSpec['envDelta']): Record<string, string> | undefined {
    if (!delta) return undefined;
    const processValue = electronRequire('process') as { env: Record<string, string | undefined> };
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(processValue.env)) if (value !== undefined) environment[key] = value;
    for (const [key, value] of Object.entries(delta)) {
      if (value === null) delete environment[key]; else environment[key] = value;
    }
    return environment;
  }

  private platform(): string {
    return (electronRequire('process') as { platform?: string }).platform ?? '';
  }
}

class ElectronProcessSession implements ProcessSession {
  readonly pid: number | null;
  private readonly stdout = new Set<(chunk: string) => void>();
  private readonly stderr = new Set<(chunk: string) => void>();
  private readonly exits = new Set<(exit: ProcessExit) => void>();
  private exit: ProcessExit | null = null;
  private disposed = false;

  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly child: ChildProcess, private readonly isWindows: boolean, signal?: AbortSignal, private readonly lease?: ProcessLease) {
    this.pid = child.pid ?? null;
    child.stdout?.on('data', value => this.handleOutput(value.toString(), this.stdout));
    child.stderr?.on('data', value => this.handleOutput(value.toString(), this.stderr));
    child.on('exit', (code, signalName) => this.complete({ code, signal: signalName }));
    if (lease?.maxDurationMs !== undefined) {
      this.timeout = setTimeout(() => { void this.terminate({ gracePeriodMs: 0, reason: 'timeout' }); }, lease.maxDurationMs);
    }
    signal?.addEventListener('abort', () => { void this.terminate({ gracePeriodMs: 0, reason: 'cancelled' }); }, { once: true });
  }

  async write(data: string): Promise<void> {
    if (this.exit || this.disposed || !this.child.stdin) throw new Error('Cannot write to an exited process');
    await new Promise<void>((resolve, reject) => this.child.stdin?.write(data, error => error ? reject(error) : resolve()));
  }

  async closeStdin(): Promise<void> { this.child.stdin?.end(); }
  onStdout(listener: (chunk: string) => void): () => void { this.stdout.add(listener); return () => this.stdout.delete(listener); }
  onStderr(listener: (chunk: string) => void): () => void { this.stderr.add(listener); return () => this.stderr.delete(listener); }
  onExit(listener: (exit: ProcessExit) => void): () => void {
    if (this.exit) listener(this.exit); else this.exits.add(listener);
    return () => this.exits.delete(listener);
  }

  async terminate(options: { readonly gracePeriodMs: number; readonly reason: TerminationReason }): Promise<ProcessExit> {
    if (this.exit) return this.exit;
    this.killTree('SIGTERM');
    if (options.gracePeriodMs > 0) await new Promise(resolve => setTimeout(resolve, options.gracePeriodMs));
    if (!this.exit) this.killTree('SIGKILL');
    return this.exit ?? { code: null, signal: 'SIGKILL', reason: options.reason };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.exit) await this.terminate({ gracePeriodMs: 0, reason: 'disposed' });
    this.stdout.clear(); this.stderr.clear(); this.exits.clear();
    this.lease?.release();
  }

  private complete(exit: ProcessExit): void {
    if (this.exit) return;
    this.exit = exit;
    if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
    this.lease?.release();
    this.exits.forEach(listener => listener(exit));
  }

  private handleOutput(chunk: string, listeners: Set<(chunk: string) => void>): void {
    try {
      this.lease?.recordOutput(new TextEncoder().encode(chunk).byteLength ?? chunk.length);
      listeners.forEach(listener => listener(chunk));
    } catch {
      void this.terminate({ gracePeriodMs: 0, reason: 'forced' });
    }
  }

  private killTree(signal: 'SIGTERM' | 'SIGKILL'): void {
    const pid = this.pid;
    if (pid === null) {
      this.child.kill(signal);
      return;
    }
    if (this.isWindows) {
      const childProcess = electronRequire('child_process') as {
        spawn(command: string, args: readonly string[], options: { stdio: 'ignore'; windowsHide: true }): ChildProcess;
      };
      childProcess.spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
      return;
    }
    try {
      const processValue = electronRequire('process') as { kill(pid: number, signal: string): void };
      processValue.kill(-pid, signal);
    } catch {
      this.child.kill(signal);
    }
  }
}
