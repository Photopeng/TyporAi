export interface ClientLease {
  readonly clientId: string;
  readonly connectionId: string;
  readonly connectedAt: number;
  readonly previousConnectionId: string | null;
  readonly disconnectedAt: number | null;
  readonly reconnectDeadline: number | null;
  readonly runtimeIds: Set<string>;
  readonly turnIds: Set<string>;
  readonly approvalIds: Set<string>;
  readonly watchIds: Set<string>;
}

export interface ClientLeaseManagerOptions {
  readonly reconnectGraceMs?: number;
  readonly now?: () => number;
}

/** Owns resources created by an RPC connection so one window cannot affect another. */
export class ClientLeaseManager {
  private readonly leases = new Map<string, ClientLease>();
  private readonly now: () => number;
  private readonly reconnectGraceMs: number;

  constructor(options: ClientLeaseManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.reconnectGraceMs = options.reconnectGraceMs ?? 10_000;
  }

  connect(connectionId: string, clientId = connectionId, lastConnectionId: string | null = null): ClientLease {
    const resumable = lastConnectionId ? this.leases.get(lastConnectionId) : undefined;
    if (resumable && resumable.clientId === clientId && resumable.disconnectedAt !== null
      && resumable.reconnectDeadline !== null && resumable.reconnectDeadline >= this.now()) {
      const resumed: ClientLease = {
        ...resumable,
        disconnectedAt: null,
        previousConnectionId: connectionId,
        reconnectDeadline: null,
      };
      this.leases.set(resumed.connectionId, resumed);
      return resumed;
    }
    const lease: ClientLease = {
      clientId, connectionId, connectedAt: this.now(), previousConnectionId: lastConnectionId,
      disconnectedAt: null, reconnectDeadline: null, runtimeIds: new Set(), turnIds: new Set(), approvalIds: new Set(), watchIds: new Set(),
    };
    this.leases.set(connectionId, lease);
    return lease;
  }

  disconnect(connectionId: string): ClientLease | undefined {
    const lease = this.leases.get(connectionId);
    if (!lease || lease.disconnectedAt !== null) return lease;
    const disconnected: ClientLease = {
      ...lease,
      disconnectedAt: this.now(),
      reconnectDeadline: this.now() + this.reconnectGraceMs,
    };
    this.leases.set(connectionId, disconnected);
    return disconnected;
  }

  expire(connectionId: string): ClientLease | undefined {
    const lease = this.leases.get(connectionId);
    if (!lease || lease.disconnectedAt === null || lease.reconnectDeadline === null || lease.reconnectDeadline > this.now()) return undefined;
    this.leases.delete(connectionId);
    return lease;
  }

  attachRuntime(connectionId: string, runtimeId: string): void { this.require(connectionId).runtimeIds.add(runtimeId); }
  attachTurn(connectionId: string, turnId: string): void { this.require(connectionId).turnIds.add(turnId); }
  attachApproval(connectionId: string, approvalId: string): void { this.require(connectionId).approvalIds.add(approvalId); }
  attachWatch(connectionId: string, watchId: string): void { this.require(connectionId).watchIds.add(watchId); }
  releaseTurn(connectionId: string, turnId: string): void { this.leases.get(connectionId)?.turnIds.delete(turnId); }
  releaseRuntime(connectionId: string, runtimeId: string): void { this.leases.get(connectionId)?.runtimeIds.delete(runtimeId); }
  releaseApproval(connectionId: string, approvalId: string): void { this.leases.get(connectionId)?.approvalIds.delete(approvalId); }
  releaseWatch(connectionId: string, watchId: string): void { this.leases.get(connectionId)?.watchIds.delete(watchId); }
  ownsRuntime(connectionId: string, runtimeId: string): boolean { return this.leases.get(connectionId)?.runtimeIds.has(runtimeId) ?? false; }
  ownsTurn(connectionId: string, turnId: string): boolean { return this.leases.get(connectionId)?.turnIds.has(turnId) ?? false; }
  ownsApproval(connectionId: string, approvalId: string): boolean { return this.leases.get(connectionId)?.approvalIds.has(approvalId) ?? false; }
  get size(): number { return this.leases.size; }

  private require(connectionId: string): ClientLease {
    const lease = this.leases.get(connectionId);
    if (!lease) throw new Error('Connection lease not found.');
    return lease;
  }
}
