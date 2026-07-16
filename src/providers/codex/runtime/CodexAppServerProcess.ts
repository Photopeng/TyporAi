import type { Readable, Writable } from 'stream';

import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessSession, type ProcessSpec, type ProcessTransportFactory } from '@/core/ports';
import { adaptProcessSession, type NodeCompatibleProcess } from '@/hosts/electron/NodeProcessSessionAdapter';

import { resolveWindowsCmdShimSpawnSpec, type WindowsCmdShimSpawnSpec } from '../../../utils/windowsCmdShim';
import type { CodexLaunchSpec } from './codexLaunchTypes';

const SIGKILL_TIMEOUT_MS = 3_000;

type ExitCallback = (code: number | null, signal: string | null) => void;
type ProcessSessionAdapter = (session: ProcessSession) => NodeCompatibleProcess;

export class CodexAppServerProcess {
  private proc: NodeCompatibleProcess | null = null;
  private session: ProcessSession | null = null;
  private alive = false;
  private exitCallbacks: ExitCallback[] = [];
  private resolvedSpawnSpec: WindowsCmdShimSpawnSpec | null = null;

  constructor(
    private readonly launchSpec: Pick<CodexLaunchSpec, 'command' | 'args' | 'spawnCwd' | 'env'>,
    private readonly transportFactory?: ProcessTransportFactory,
    private readonly executionPolicy: ExecutionPolicy = new DefaultExecutionPolicy(),
    private readonly processSessionAdapter: ProcessSessionAdapter = adaptProcessSession,
  ) {}

  async start(): Promise<void> {
    const resolvedSpawnSpec = resolveWindowsCmdShimSpawnSpec(this.launchSpec);
    this.resolvedSpawnSpec = resolvedSpawnSpec;
    this.executionPolicy.assertAllowed(this.processSpec(resolvedSpawnSpec));
    if (!this.transportFactory) {
      throw new Error('Codex process transport is unavailable');
    }
    {
      const session = await this.transportFactory.start({
        executable: resolvedSpawnSpec.command,
        args: resolvedSpawnSpec.args,
        cwd: this.launchSpec.spawnCwd,
        envDelta: Object.fromEntries(Object.entries(this.launchSpec.env).map(([key, value]) => [key, value ?? null])),
        stdioMode: 'pipe',
        ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
      });
      this.session = session;
      this.proc = this.processSessionAdapter(session);
      this.alive = true;
      this.proc.on('exit', (code, signal) => {
        this.alive = false;
        for (const cb of this.exitCallbacks) cb(code, signal);
      });
      return;
    }
  }

  private processSpec(resolvedSpawnSpec: WindowsCmdShimSpawnSpec): ProcessSpec {
    return {
      executable: resolvedSpawnSpec.command,
      args: resolvedSpawnSpec.args,
      cwd: this.launchSpec.spawnCwd,
      envDelta: Object.fromEntries(Object.entries(this.launchSpec.env).map(([key, value]) => [key, value ?? null])),
      stdioMode: 'pipe',
      ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    };
  }

  get stdin(): Writable {
    if (!this.proc?.stdin) throw new Error('Process not started');
    return this.proc.stdin as unknown as Writable;
  }

  get stdout(): Readable {
    if (!this.proc?.stdout) throw new Error('Process not started');
    return this.proc.stdout as unknown as Readable;
  }

  get stderr(): Readable {
    if (!this.proc?.stderr) throw new Error('Process not started');
    return this.proc.stderr as unknown as Readable;
  }

  isAlive(): boolean {
    return this.alive;
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  offExit(callback: ExitCallback): void {
    const idx = this.exitCallbacks.indexOf(callback);
    if (idx !== -1) this.exitCallbacks.splice(idx, 1);
  }

  async shutdown(): Promise<void> {
    if (!this.proc || !this.alive) return;

    return new Promise<void>((resolve) => {
      const killTimer: { value?: ReturnType<typeof setTimeout> } = {};
      const onExit = () => {
        if (killTimer.value !== undefined) globalThis.clearTimeout(killTimer.value);
        resolve();
      };

      this.proc!.once('exit', onExit);
      void this.killProc('SIGTERM');

      killTimer.value = globalThis.setTimeout(() => {
        if (this.alive) {
          void this.killProc('SIGKILL');
        }
      }, SIGKILL_TIMEOUT_MS);
    });
  }

  private async killProc(signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
    if (!this.session) return;
    await this.session.terminate({
      gracePeriodMs: signal === 'SIGKILL' ? 0 : SIGKILL_TIMEOUT_MS,
      reason: 'cancelled',
    });
  }
}
