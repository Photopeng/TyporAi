import type { ProcessExit, ProcessSession, ProcessSpec, ProcessTransportFactory, TerminationReason } from '@/core/ports';

import type { BridgeClient } from './BridgeClient';

interface ProcessEvent { readonly code?: number | null; readonly data?: string; readonly sessionId: string; readonly signal?: string | null; }

export class BridgeProcessTransport implements ProcessTransportFactory {
  constructor(private readonly client: BridgeClient) {}

  async start(spec: ProcessSpec, signal?: AbortSignal): Promise<ProcessSession> {
    if (spec.stdioMode !== 'pipe') throw new Error('PTY transport is not available in the macOS sidecar');
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const result = await this.client.call<{ pid: number | null; sessionId: string }>('process.start', spec);
    return new BridgeProcessSession(this.client, result.pid, result.sessionId, signal);
  }

  dispose(): void { this.client.dispose(); }
}

class BridgeProcessSession implements ProcessSession {
  private readonly exits = new Set<(exit: ProcessExit) => void>();
  private readonly stderr = new Set<(chunk: string) => void>();
  private readonly stdout = new Set<(chunk: string) => void>();
  private exit: ProcessExit | null = null;
  private readonly unsubscribe: Array<() => void>;

  constructor(private readonly client: BridgeClient, readonly pid: number | null, private readonly sessionId: string, signal?: AbortSignal) {
    this.unsubscribe = [
      client.on('process.stdout', value => this.handleOutput(value, this.stdout)),
      client.on('process.stderr', value => this.handleOutput(value, this.stderr)),
      client.on('process.exit', value => this.handleExit(value)),
    ];
    signal?.addEventListener('abort', () => { void this.terminate({ gracePeriodMs: 0, reason: 'cancelled' }); }, { once: true });
  }

  write(data: string): Promise<void> { return this.client.call('process.write', { data, sessionId: this.sessionId }); }
  closeStdin(): Promise<void> { return this.client.call('process.closeStdin', { sessionId: this.sessionId }); }
  onStdout(listener: (chunk: string) => void): () => void { this.stdout.add(listener); return () => this.stdout.delete(listener); }
  onStderr(listener: (chunk: string) => void): () => void { this.stderr.add(listener); return () => this.stderr.delete(listener); }
  onExit(listener: (exit: ProcessExit) => void): () => void { if (this.exit) listener(this.exit); else this.exits.add(listener); return () => this.exits.delete(listener); }

  async terminate(options: { readonly gracePeriodMs: number; readonly reason: TerminationReason }): Promise<ProcessExit> {
    if (this.exit) return this.exit;
    await this.client.call('process.terminate', { sessionId: this.sessionId, signal: 'SIGTERM' });
    if (options.gracePeriodMs > 0) await new Promise(resolve => window.setTimeout(resolve, options.gracePeriodMs));
    if (!this.exit) await this.client.call('process.terminate', { sessionId: this.sessionId, signal: 'SIGKILL' });
    return this.exit ?? { code: null, signal: 'SIGKILL', reason: options.reason };
  }

  async dispose(): Promise<void> {
    if (!this.exit) await this.terminate({ gracePeriodMs: 0, reason: 'disposed' });
    this.unsubscribe.forEach(dispose => dispose());
    this.stdout.clear(); this.stderr.clear(); this.exits.clear();
  }

  private handleOutput(value: unknown, listeners: Set<(chunk: string) => void>): void {
    const event = value as ProcessEvent;
    if (event.sessionId === this.sessionId && typeof event.data === 'string') listeners.forEach(listener => listener(event.data as string));
  }

  private handleExit(value: unknown): void {
    const event = value as ProcessEvent;
    if (event.sessionId !== this.sessionId || this.exit) return;
    this.exit = { code: event.code ?? null, signal: event.signal ?? null };
    this.exits.forEach(listener => listener(this.exit as ProcessExit));
  }
}
