import { createAgentEngine } from '@/core/engine-factory';
import type { ApprovalCallback } from '@/core/runtime/types';
import type { StreamChunk, UsageInfo } from '@/core/types';
import type { AgentMessage, IAgentEngine } from '@/core/types/agent-engine';
import type { RpcEventEnvelope } from '@/protocol';
import { getTyporaProviderSettings } from '@/providers/typora/settings';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';

export interface TyporaApiRuntimeOptions {
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly requestApproval: ApprovalCallback;
}

/** Sidecar-native execution for the Typora/API provider; no Typora plugin or DOM dependency. */
export class TyporaApiRuntime {
  private engine: IAgentEngine | null = null;
  private readonly streams = new Map<string, EventReplayBuffer<StreamChunk>>();

  constructor(private readonly options: TyporaApiRuntimeOptions) {}

  async startTurn(connectionId: string, turnId: string, prompt: string, publish: (event: RpcEventEnvelope<StreamChunk>) => void): Promise<void> {
    const replay = new EventReplayBuffer<StreamChunk>(connectionId, turnId);
    this.streams.set(turnId, replay);
    const emit = (chunk: StreamChunk): void => publish(replay.append('chat.chunk', chunk));
    try {
      const workspacePath = this.options.getWorkspacePath();
      if (!workspacePath) throw new Error('WORKSPACE_NOT_GRANTED');
      const engine = await this.ensureEngine();
      const response = await engine.chat({
        prompt,
        workspacePath,
        history: engine.getHistory(),
        approvalCallback: this.options.requestApproval,
      }, {
        onToken: token => emit({ type: 'text', content: token }),
        onToolStart: event => emit({ type: 'tool_use', id: event.id, name: event.name, input: asRecord(event.input) }),
        onToolEnd: event => emit({ type: 'tool_result', id: event.id, content: stringify(event.output) }),
      });
      emit({ type: 'usage', usage: usageFor(prompt, response), sessionId: turnId });
      emit({ type: 'done' });
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : String(error) });
      emit({ type: 'done' });
    }
  }

  cancelTurn(): void { this.engine?.abort(); }
  dispose(): void { this.engine?.abort(); this.engine = null; this.streams.clear(); }
  resetSession(): void { this.engine?.abort(); this.engine = null; }

  private async ensureEngine(): Promise<IAgentEngine> {
    if (this.engine) return this.engine;
    const settings = getTyporaProviderSettings(this.options.getSettings());
    this.engine = createAgentEngine(settings);
    await this.engine.init();
    return this.engine;
  }
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringify(value: unknown): string { try { return typeof value === 'string' ? value : JSON.stringify(value ?? ''); } catch { return String(value); } }
function usageFor(prompt: string, response: AgentMessage): UsageInfo {
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const outputTokens = Math.max(1, Math.ceil(response.content.length / 4));
  return { contextTokens: inputTokens + outputTokens, contextWindow: 200_000, contextWindowIsAuthoritative: false, inputTokens, model: undefined, percentage: 0 };
}
