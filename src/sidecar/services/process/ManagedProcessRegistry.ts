import type { ProcessExit } from '@/core/ports';

export interface ManagedProcess {
  readonly id: string;
  terminate(signal?: NodeJS.Signals): Promise<{ readonly exit: ProcessExit; readonly reaped: boolean }>;
}

export interface ProcessTerminationReport {
  readonly terminatedIds: readonly string[];
  readonly unreapedIds: readonly string[];
}

export class ManagedProcessRegistry {
  private readonly processes = new Map<string, ManagedProcess>();

  add(process: ManagedProcess): void {
    if (this.processes.has(process.id)) throw new Error(`Process already managed: ${process.id}`);
    this.processes.set(process.id, process);
  }

  async terminate(id: string, signal: NodeJS.Signals = 'SIGTERM'): Promise<ProcessTerminationReport> {
    const process = this.processes.get(id);
    if (!process) return { terminatedIds: [], unreapedIds: [] };
    const result = await process.terminate(signal);
    this.processes.delete(id);
    return { terminatedIds: [id], unreapedIds: result.reaped ? [] : [id] };
  }

  async terminateAll(signal: NodeJS.Signals = 'SIGTERM'): Promise<ProcessTerminationReport> {
    const reports = await Promise.all([...this.processes.keys()].map(id => this.terminate(id, signal)));
    return { terminatedIds: reports.flatMap(report => report.terminatedIds), unreapedIds: reports.flatMap(report => report.unreapedIds) };
  }

  remove(id: string): void { this.processes.delete(id); }

  get size(): number { return this.processes.size; }
}
