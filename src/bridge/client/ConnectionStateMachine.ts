export type ConnectionState = 'idle' | 'connecting' | 'authenticating' | 'ready' | 'reconnecting' | 'incompatible' | 'fatal' | 'disposed';

const transitions: Readonly<Record<ConnectionState, readonly ConnectionState[]>> = {
  idle: ['connecting', 'disposed'],
  connecting: ['authenticating', 'reconnecting', 'fatal', 'disposed'],
  authenticating: ['ready', 'incompatible', 'reconnecting', 'fatal', 'disposed'],
  ready: ['reconnecting', 'disposed'],
  reconnecting: ['connecting', 'fatal', 'disposed'],
  incompatible: ['disposed'],
  fatal: ['disposed'],
  disposed: [],
};

export class ConnectionStateMachine {
  private current: ConnectionState = 'idle';

  get state(): ConnectionState { return this.current; }

  transition(next: ConnectionState): void {
    if (!transitions[this.current].includes(next)) throw new Error(`Invalid connection transition: ${this.current} -> ${next}`);
    this.current = next;
  }
}
