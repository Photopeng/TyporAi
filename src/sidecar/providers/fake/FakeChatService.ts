import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { EventReplayBuffer } from '@/sidecar/server/EventReplayBuffer';

import { FakeProviderRuntime } from './FakeProviderRuntime';

export class FakeChatService {
  private readonly streams = new Map<string, EventReplayBuffer<StreamChunk>>();

  constructor(private readonly runtime = new FakeProviderRuntime()) {}

  async startTurn(connectionId: string, turnId: string, prompt: string, publish: (event: RpcEventEnvelope<StreamChunk>) => void): Promise<void> {
    const replay = new EventReplayBuffer<StreamChunk>(connectionId, turnId);
    this.streams.set(turnId, replay);
    for await (const chunk of this.runtime.startTurn({ id: turnId, prompt })) publish(replay.append('chat.chunk', chunk));
  }

  cancelTurn(turnId: string): void { this.runtime.cancelTurn(turnId); }
  replay(turnId: string, afterSequence: number): readonly RpcEventEnvelope<StreamChunk>[] | null { return this.streams.get(turnId)?.replayAfter(afterSequence) ?? null; }
  dispose(): void { for (const turnId of this.streams.keys()) this.runtime.cancelTurn(turnId); this.streams.clear(); }
}
