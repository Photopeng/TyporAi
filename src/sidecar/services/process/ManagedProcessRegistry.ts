export interface ManagedProcess {
  readonly id: string;
  terminate(signal?: NodeJS.Signals): void;
}

export class ManagedProcessRegistry {
  private readonly processes = new Map<string, ManagedProcess>();

  add(process: ManagedProcess): void {
    if (this.processes.has(process.id)) throw new Error(`Process already managed: ${process.id}`);
    this.processes.set(process.id, process);
  }

  terminate(id: string, signal: NodeJS.Signals = 'SIGTERM'): void {
    const process = this.processes.get(id);
    if (!process) return;
    process.terminate(signal);
    this.processes.delete(id);
  }

  terminateAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const id of [...this.processes.keys()]) this.terminate(id, signal);
  }

  get size(): number { return this.processes.size; }
}
