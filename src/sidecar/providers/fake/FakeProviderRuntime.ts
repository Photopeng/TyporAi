import type { StreamChunk } from '@/core/types';

export interface FakeTurn {
  readonly id: string;
  readonly prompt: string;
}

export class FakeProviderRuntime {
  private activeTurn: string | null = null;
  private cancelled = new Set<string>();

  async *startTurn(turn: FakeTurn): AsyncGenerator<StreamChunk> {
    if (this.activeTurn) throw new Error('TURN_ALREADY_ACTIVE');
    this.activeTurn = turn.id;
    try {
      yield { type: 'assistant_message_start', itemId: turn.id };
      if (turn.prompt === 'approval') yield { type: 'notice', content: 'Approval requested.', level: 'warning' };
      if (this.cancelled.has(turn.id)) {
        yield { type: 'error', content: 'REQUEST_CANCELLED' };
        return;
      }
      yield { type: 'text', content: `Fake: ${turn.prompt}` };
      if (this.cancelled.has(turn.id)) {
        yield { type: 'error', content: 'REQUEST_CANCELLED' };
        return;
      }
      yield { type: 'done' };
    } finally {
      this.cancelled.delete(turn.id);
      this.activeTurn = null;
    }
  }

  cancelTurn(id: string): void { this.cancelled.add(id); }
}
