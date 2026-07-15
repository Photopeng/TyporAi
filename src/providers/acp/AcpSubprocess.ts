import type { Readable, Writable } from 'node:stream';

import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessSpec, type ProcessTransportFactory } from '@/core/ports';
import { adaptProcessSession, type NodeCompatibleProcess } from '@/hosts/electron/NodeProcessSessionAdapter';

import {
  resolveWindowsCmdShimSpawnSpec,
  type WindowsCmdShimSpawnSpec,
} from '../../utils/windowsCmdShim';

const SIGKILL_TIMEOUT_MS = 3_000;
const STDERR_BUFFER_LIMIT = 8_000;

export interface AcpSubprocessLaunchSpec {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

type CloseListener = (error?: Error) => void;

export class AcpSubprocess {
  private closeError: Error | null = null;
  private readonly closeListeners = new Set<CloseListener>();
  private notifiedClose = false;
  private proc: NodeCompatibleProcess | null = null;
  private resolvedSpawnSpec: WindowsCmdShimSpawnSpec | null = null;
  private stderrBuffer = '';

  constructor(
    private readonly launchSpec: AcpSubprocessLaunchSpec,
    private readonly processTransport?: ProcessTransportFactory,
    private readonly executionPolicy: ExecutionPolicy = new DefaultExecutionPolicy(),
  ) {}

  get stdin(): Writable {
    return this.requireProc().stdin as unknown as Writable;
  }

  get stdout(): Readable {
    return this.requireProc().stdout as unknown as Readable;
  }

  get stderr(): Readable {
    return this.requireProc().stderr as unknown as Readable;
  }

  private requireProc(): NodeCompatibleProcess {
    if (!this.proc) {
      throw new Error('ACP subprocess is not started');
    }
    return this.proc;
  }

  async start(): Promise<void> {
    if (this.proc) {
      return;
    }

    const resolvedSpawnSpec = resolveWindowsCmdShimSpawnSpec(this.launchSpec);
    this.resolvedSpawnSpec = resolvedSpawnSpec;
    this.executionPolicy.assertAllowed(this.processSpec(resolvedSpawnSpec));
    if (!this.processTransport) {
      throw new Error('ACP process transport is unavailable');
    }
    {
      const session = await this.processTransport.start({
        executable: resolvedSpawnSpec.command,
        args: resolvedSpawnSpec.args,
        cwd: this.launchSpec.cwd,
        envDelta: Object.fromEntries(Object.entries(this.launchSpec.env).map(([key, value]) => [key, value ?? null])),
        stdioMode: 'pipe',
        ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
      });
      const proc = adaptProcessSession(session);
      this.attachProcessHandlers(proc);
      this.proc = proc;
      return;
    }
  }

  private processSpec(resolvedSpawnSpec: WindowsCmdShimSpawnSpec): ProcessSpec {
    return {
      executable: resolvedSpawnSpec.command,
      args: resolvedSpawnSpec.args,
      cwd: this.launchSpec.cwd,
      envDelta: Object.fromEntries(Object.entries(this.launchSpec.env).map(([key, value]) => [key, value ?? null])),
      stdioMode: 'pipe',
      ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    };
  }

  private attachProcessHandlers(proc: NodeCompatibleProcess): void {
    const nodeProcess = proc as unknown as {
      stderr: { on(event: 'data', listener: (chunk: unknown) => void): void };
      on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void;
    };
    nodeProcess.stderr.on('data', (chunk: unknown) => {
      const text = typeof chunk === 'string'
        ? chunk
        : chunk instanceof Buffer ? chunk.toString('utf-8') : String(chunk);
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-STDERR_BUFFER_LIMIT);
    });

    nodeProcess.on('exit', (code, signal) => {
      const exitError = this.closeError ?? (
        code === 0 && signal === null
          ? undefined
          : new Error(`ACP subprocess exited (${formatExit(code, signal)})`)
      );
      this.notifyClose(exitError);
    });
  }

  isAlive(): boolean {
    if (!this.proc) return false;
    return !this.notifiedClose;
  }

  getStderrSnapshot(): string {
    return this.stderrBuffer.trim();
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  async shutdown(): Promise<void> {
    if (!this.proc || !this.isAlive()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const proc = this.proc!;
      const onClose = () => {
        cleanup();
        resolve();
      };
      const killTimer = window.setTimeout(() => {
        this.killProc(proc, 'SIGKILL');
      }, SIGKILL_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(killTimer);
        (proc as unknown as { off?: (event: 'exit', listener: () => void) => void }).off?.('exit', onClose);
      };

      proc.once('exit', onClose);
      this.killProc(proc, 'SIGTERM');
    });
  }

  private killProc(proc: NodeCompatibleProcess, signal: NodeJS.Signals): boolean {
    return proc.kill(signal);
  }

  private notifyClose(error?: Error): void {
    if (this.notifiedClose) {
      return;
    }

    this.notifiedClose = true;
    for (const listener of this.closeListeners) {
      try {
        listener(error);
      } catch {
        // Best-effort cleanup notification.
      }
    }
  }
}

function formatExit(code: number | null, signal: string | null): string {
  if (signal) {
    return `signal ${signal}`;
  }
  if (code === null) {
    return 'unknown';
  }
  return `code ${code}`;
}
