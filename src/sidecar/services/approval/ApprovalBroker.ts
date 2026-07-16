export type PendingInteractionKind = 'approval' | 'planApproval' | 'userInput';

export interface PendingInteraction {
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

  constructor(private readonly publish: (interaction: PendingInteraction) => void, private readonly timeoutMs = 60_000) {}

  request(interaction: PendingInteraction): Promise<unknown> {
    if (this.pending.has(interaction.id)) throw new Error(`Interaction already exists: ${interaction.id}`);
    return new Promise(resolve => {
      const timeout = setTimeout(() => this.resolve(interaction.id, { approved: false, reason: 'timeout' }), this.timeoutMs);
      this.pending.set(interaction.id, { interaction, resolve, timeout });
      this.publish(interaction);
    });
  }

  resolve(id: string, value: unknown): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    clearTimeout(entry.timeout);
    entry.resolve(value);
    return true;
  }

  rejectAll(reason = 'connection-lost'): void {
    for (const id of [...this.pending.keys()]) this.resolve(id, { approved: false, reason });
  }

  get size(): number { return this.pending.size; }
}
