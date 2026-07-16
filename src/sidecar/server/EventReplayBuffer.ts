import type { RpcEventEnvelope } from '@/protocol';

export class EventReplayBuffer<T> {
  private readonly events: RpcEventEnvelope<T>[] = [];
  private sequence = 0;

  constructor(private readonly connectionId: string, private readonly streamId: string, private readonly capacity = 256) {}

  append(event: string, payload: T): RpcEventEnvelope<T> {
    const envelope = { connectionId: this.connectionId, streamId: this.streamId, seq: ++this.sequence, event, payload, timestamp: Date.now() };
    this.events.push(envelope);
    if (this.events.length > this.capacity) this.events.shift();
    return envelope;
  }

  replayAfter(sequence: number): readonly RpcEventEnvelope<T>[] | null {
    if (sequence < this.oldestSequence - 1) return null;
    return this.events.filter(event => event.seq > sequence);
  }

  private get oldestSequence(): number { return this.events[0]?.seq ?? this.sequence + 1; }
}
