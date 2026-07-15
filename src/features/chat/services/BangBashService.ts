import { DefaultExecutionPolicy, type ExecutionPolicy, type PlatformInfo, type ProcessExit, type ProcessSpec, type ProcessTransportFactory } from '@/core/ports';

export interface BangBashResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024; // 1MB

export class BangBashService {
  private cwd: string;
  private enhancedPath: string;

  constructor(
    cwd: string,
    enhancedPath: string,
    private readonly processTransport: ProcessTransportFactory,
    private readonly executionPolicy: ExecutionPolicy = new DefaultExecutionPolicy(),
    private readonly operatingSystem: PlatformInfo['operatingSystem'] = 'unknown',
  ) {
    this.cwd = cwd;
    this.enhancedPath = enhancedPath;
  }

  execute(command: string): Promise<BangBashResult> {
    try {
      this.executionPolicy.assertAllowed(this.processSpec(command));
    } catch (error) {
      return Promise.resolve({
        command,
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return this.executeWithTransport(command);
  }

  private async executeWithTransport(command: string): Promise<BangBashResult> {
    const processSpec = this.processSpec(command);
    let stdout = '';
    let stderr = '';
    let failure: string | undefined;
    let settled = false;
    let resolveExit: ((exit: ProcessExit) => void) | null = null;

    try {
      const session = await this.processTransport!.start({
        ...processSpec,
      });
      const completion = new Promise<ProcessExit>((resolve) => {
        resolveExit = resolve;
      });
      const resolveOnce = (exit: ProcessExit): void => {
        if (settled) return;
        settled = true;
        resolveExit?.(exit);
      };
      const capOutput = (): void => {
        if (stdout.length + stderr.length <= MAX_BUFFER || failure) return;
        failure = 'Output exceeded maximum buffer size (1MB)';
        void session.terminate({ gracePeriodMs: 0, reason: 'forced' }).then(resolveOnce);
      };
      const detachStdout = session.onStdout((chunk) => { stdout += chunk; capOutput(); });
      const detachStderr = session.onStderr((chunk) => { stderr += chunk; capOutput(); });
      const detachExit = session.onExit(resolveOnce);
      const timer = setTimeout(() => {
        failure = `Command timed out after ${TIMEOUT_MS / 1000}s`;
        void session.terminate({ gracePeriodMs: 0, reason: 'timeout' }).then(resolveOnce);
      }, TIMEOUT_MS);

      try {
        const exit = await completion;
        return {
          command,
          stdout,
          stderr,
          exitCode: failure ? 124 : (exit.code ?? 1),
          ...(failure ? { error: failure } : {}),
        };
      } finally {
        clearTimeout(timer);
        detachStdout();
        detachStderr();
        detachExit();
        await session.dispose();
      }
    } catch (error) {
      return {
        command,
        stdout,
        stderr,
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private processSpec(command: string): ProcessSpec {
    const isWindows = this.operatingSystem === 'windows';
    return {
      executable: isWindows ? 'cmd.exe' : '/bin/bash',
      args: isWindows ? ['/d', '/s', '/c', command] : ['-lc', command],
      cwd: this.cwd,
      envDelta: { PATH: this.enhancedPath },
      stdioMode: 'pipe',
    };
  }
}
