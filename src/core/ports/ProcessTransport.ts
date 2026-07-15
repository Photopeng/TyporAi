export type StdioMode = 'pipe' | 'pty';
export type TerminationReason = 'cancelled' | 'timeout' | 'disposed' | 'forced';

export interface ProcessSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly envDelta?: Readonly<Record<string, string | null>>;
  readonly stdioMode: StdioMode;
  /** Preserves correctly quoted Windows command-shim invocation arguments. */
  readonly windowsVerbatimArguments?: boolean;
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: string | null;
  readonly reason?: TerminationReason;
}

export interface ProcessSession {
  readonly pid: number | null;
  write(data: string): Promise<void>;
  closeStdin(): Promise<void>;
  onStdout(listener: (chunk: string) => void): () => void;
  onStderr(listener: (chunk: string) => void): () => void;
  onExit(listener: (exit: ProcessExit) => void): () => void;
  terminate(options: { readonly gracePeriodMs: number; readonly reason: TerminationReason }): Promise<ProcessExit>;
  dispose(): Promise<void>;
}

export interface ProcessTransportFactory {
  start(spec: ProcessSpec, signal?: AbortSignal): Promise<ProcessSession>;
  dispose?(): Promise<void> | void;
}
