import type { RpcEventEnvelope } from '@/protocol';

export class SubscriptionManager {
  private readonly consumedSequences = new Map<string, number>();

  consume<T>(event: RpcEventEnvelope<T>): boolean {
    const previous = this.consumedSequences.get(event.streamId) ?? 0;
    if (event.seq <= previous) return false;
    this.consumedSequences.set(event.streamId, event.seq);
    return true;
  }

  resumePositions(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.consumedSequences);
  }
}
