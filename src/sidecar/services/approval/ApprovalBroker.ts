export type PendingInteractionKind = 'approval' | 'planApproval' | 'userInput';

export interface PendingInteraction {
  readonly connectionId: string;
  readonly id: string;
  readonly kind: PendingInteractionKind;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface PendingEntry {
  readonly interaction: PendingInteraction;
  readonly resolve: (value: unknown) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

/** Sidecar-owned interaction gate; unanswered or disconnected requests reject safely. */
export class ApprovalBroker {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly publish: (interaction: PendingInteraction) => void, private readonly timeoutMs = 60_000, private readonly maxPending = 128) {}

  request(interaction: PendingInteraction): Promise<unknown> {
    if (this.pending.has(interaction.id)) throw new Error(`Interaction already exists: ${interaction.id}`);
    if (this.pending.size >= this.maxPending) return Promise.resolve({ approved: false, reason: 'capacity' });
    return new Promise(resolve => {
      const timeout = setTimeout(() => this.resolve(interaction.id, { approved: false, reason: 'timeout' }), this.timeoutMs);
      this.pending.set(interaction.id, { interaction, resolve, timeout });
      this.publish(interaction);
    });
  }

  resolve(id: string, value: unknown, connectionId?: string): boolean {
    const entry = this.pending.get(id);
    if (!entry || (connectionId && entry.interaction.connectionId !== connectionId)) return false;
    this.pending.delete(id);
    clearTimeout(entry.timeout);
    entry.resolve(value);
    return true;
  }

  rejectAll(reason = 'connection-lost'): void {
    for (const id of [...this.pending.keys()]) this.resolve(id, { approved: false, reason });
  }

  rejectConnection(connectionId: string, reason = 'connection-lost'): void {
    for (const [id, entry] of this.pending) {
      if (entry.interaction.connectionId === connectionId) this.resolve(id, { approved: false, reason });
    }
  }

  republishConnection(connectionId: string): void {
    for (const entry of this.pending.values()) {
      if (entry.interaction.connectionId === connectionId) this.publish(entry.interaction);
    }
  }

  get size(): number { return this.pending.size; }
}
