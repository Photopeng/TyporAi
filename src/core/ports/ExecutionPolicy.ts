import type { ProcessSpec } from './ProcessTransport';

export class ExecutionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionPolicyError';
  }
}

export interface ExecutionPolicy {
  assertAllowed(spec: ProcessSpec): void;
  acquire?(spec: ProcessSpec): ProcessLease;
}

export interface ProcessLease {
  readonly maxDurationMs?: number;
  readonly maxOutputBytes?: number;
  recordOutput(bytes: number): void;
  release(): void;
}

export interface ExecutionPolicyOptions {
  readonly allowedExecutables?: readonly (string | RegExp)[];
  readonly maxConcurrent?: number;
  readonly maxDurationMs?: number;
  readonly maxOutputBytes?: number;
  readonly onAudit?: (event: ExecutionAuditEvent) => void;
}

export interface ExecutionAuditEvent {
  readonly type: 'started' | 'rejected' | 'released';
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timestamp: number;
  readonly reason?: string;
}

export class DefaultExecutionPolicy implements ExecutionPolicy {
  private active = 0;

  constructor(private readonly options: ExecutionPolicyOptions = {}) {}

  assertAllowed(spec: ProcessSpec): void {
    try {
      if (!spec.executable.trim()) throw new ExecutionPolicyError('Executable is required');
      if (!spec.cwd.trim()) throw new ExecutionPolicyError('Working directory is required');
      if (spec.args.length > 256) throw new ExecutionPolicyError('Too many process arguments');
      if (spec.args.reduce((size, arg) => size + arg.length, 0) > 64 * 1024) {
        throw new ExecutionPolicyError('Process arguments exceed the size limit');
      }
      if (Object.keys(spec.envDelta ?? {}).length > 128) {
        throw new ExecutionPolicyError('Too many environment overrides');
      }
      const allowed = this.options.allowedExecutables;
      if (allowed && allowed.length > 0 && !allowed.some(rule => typeof rule === 'string'
        ? rule.toLowerCase() === spec.executable.toLowerCase()
        : rule.test(spec.executable))) {
        throw new ExecutionPolicyError(`Executable is not authorized: ${spec.executable}`);
      }
      if (this.options.maxConcurrent !== undefined && this.active >= this.options.maxConcurrent) {
        throw new ExecutionPolicyError('Process concurrency limit reached');
      }
    } catch (error) {
      this.options.onAudit?.({ type: 'rejected', executable: spec.executable, args: spec.args, cwd: spec.cwd, timestamp: Date.now(), reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  acquire(spec: ProcessSpec): ProcessLease {
    this.assertAllowed(spec);
    this.active++;
    this.options.onAudit?.({ type: 'started', executable: spec.executable, args: spec.args, cwd: spec.cwd, timestamp: Date.now() });
    let outputBytes = 0;
    let released = false;
    return {
      maxDurationMs: this.options.maxDurationMs,
      maxOutputBytes: this.options.maxOutputBytes,
      recordOutput: bytes => {
        outputBytes += Math.max(0, bytes);
        if (this.options.maxOutputBytes !== undefined && outputBytes > this.options.maxOutputBytes) {
          throw new ExecutionPolicyError('Process output budget exceeded');
        }
      },
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.options.onAudit?.({ type: 'released', executable: spec.executable, args: spec.args, cwd: spec.cwd, timestamp: Date.now() });
      },
    };
  }
}
