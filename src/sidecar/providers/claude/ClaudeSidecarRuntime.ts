import type {
  CanUseTool,
  Options,
  Query,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query as agentQuery } from '@anthropic-ai/claude-agent-sdk';

import type { ProcessTransportFactory } from '@/core/ports';
import { buildSystemPrompt } from '@/core/prompt/mainAgent';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { toClaudeRuntimeModelId } from '@/providers/claude/modelSelection';
import { createCustomSpawnFunction } from '@/providers/claude/runtime/customSpawn';
import { isStreamChunk } from '@/providers/claude/sdk/typeGuards';
import { getClaudeProviderSettings, resolveClaudeSettingSources } from '@/providers/claude/settings';
import { transformSDKMessage } from '@/providers/claude/stream/transformClaudeMessage';
import { resolveEffortLevel } from '@/providers/claude/types/models';
import { getEnhancedPath, getMissingNodeError, parseEnvironmentVariables } from '@/utils/env';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';

export interface ClaudeSidecarRuntimeOptions {
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly processes: ProcessTransportFactory;
  readonly requestApproval: (toolName: string, input: Record<string, unknown>, description: string) => Promise<'allow' | 'deny'>;
}

/** Native Claude Agent SDK runtime owned by Sidecar rather than the Renderer. */
export class ClaudeSidecarRuntime {
  private activeTurn: string | null = null;
  private activeQuery: Query | null = null;
  private sessionId: string | null = null;

  constructor(private readonly options: ClaudeSidecarRuntimeOptions) {}

  async startTurn(
    connectionId: string,
    turnId: string,
    prompt: string,
    publish: (event: RpcEventEnvelope<StreamChunk>) => void,
  ): Promise<void> {
    if (this.activeTurn) throw new Error('TURN_ALREADY_ACTIVE');
    const replay = new EventReplayBuffer<StreamChunk>(connectionId, turnId);
    const emit = (chunk: StreamChunk): void => publish(replay.append('chat.chunk', chunk));
    const workspace = this.options.getWorkspacePath();
    if (!workspace) {
      emit({ type: 'error', content: 'WORKSPACE_NOT_GRANTED' });
      emit({ type: 'done' });
      return;
    }

    this.activeTurn = turnId;
    try {
      const query = agentQuery({
        prompt,
        options: this.createQueryOptions(workspace),
      });
      this.activeQuery = query;
      for await (const message of query) {
        this.captureSessionId(message);
        for (const event of transformSDKMessage(message, { intendedModel: this.getModel() })) {
          if (isStreamChunk(event)) emit(event);
        }
      }
      emit({ type: 'done' });
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : String(error) });
      emit({ type: 'done' });
    } finally {
      this.activeQuery = null;
      this.activeTurn = null;
    }
  }

  cancelTurn(turnId: string): void {
    if (this.activeTurn !== turnId) return;
    void this.activeQuery?.interrupt();
  }

  async dispose(): Promise<void> {
    await this.activeQuery?.interrupt();
    this.activeQuery = null;
    this.activeTurn = null;
  }

  private createQueryOptions(workspace: string): Options {
    const settings = this.options.getSettings();
    const provider = getClaudeProviderSettings(settings);
    const cliPath = provider.cliPath || 'claude';
    const customEnvironment = parseEnvironmentVariables(provider.environmentVariables);
    const enhancedPath = getEnhancedPath(customEnvironment.PATH, cliPath);
    const missingNodeError = getMissingNodeError(cliPath, enhancedPath);
    if (missingNodeError) throw new Error(missingNodeError);

    const model = this.getModel();
    const queryOptions: Options = {
      cwd: workspace,
      systemPrompt: buildSystemPrompt({
        mediaFolder: typeof settings.mediaFolder === 'string' ? settings.mediaFolder : '',
        customPrompt: typeof settings.systemPrompt === 'string' ? settings.systemPrompt : '',
        userName: typeof settings.userName === 'string' ? settings.userName : '',
        vaultPath: workspace,
      }),
      model,
      pathToClaudeCodeExecutable: cliPath,
      settingSources: resolveClaudeSettingSources(provider.loadUserSettings),
      env: { ...process.env, ...customEnvironment, PATH: enhancedPath },
      includePartialMessages: true,
      allowDangerouslySkipPermissions: true,
      permissionMode: typeof settings.permissionMode === 'string' && settings.permissionMode === 'plan' ? 'plan' : 'default',
      canUseTool: this.createApprovalCallback(),
      spawnClaudeCodeProcess: createCustomSpawnFunction(enhancedPath, this.options.processes),
      thinking: { type: 'adaptive' },
      effort: resolveEffortLevel(model, settings.effortLevel),
    };
    if (this.sessionId) queryOptions.resume = this.sessionId;
    if (provider.safeMode === 'auto') queryOptions.extraArgs = { 'enable-auto-mode': null };
    if (provider.enableChrome) queryOptions.extraArgs = { ...queryOptions.extraArgs, chrome: null };
    return queryOptions;
  }

  private createApprovalCallback(): CanUseTool {
    return async (toolName, input) => {
      const normalizedInput = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const decision = await this.options.requestApproval(
        toolName,
        normalizedInput,
        `Claude requests permission to use ${toolName}.`,
      );
      return decision === 'allow'
        ? { behavior: 'allow', updatedInput: normalizedInput }
        : { behavior: 'deny', message: 'User denied this action.', interrupt: false };
    };
  }

  private getModel(): string {
    const model = this.options.getSettings().model;
    return toClaudeRuntimeModelId(typeof model === 'string' && model.trim() ? model : 'sonnet');
  }

  private captureSessionId(message: SDKMessage): void {
    if (message.type !== 'system' || message.subtype !== 'init' || !message.session_id) return;
    this.sessionId = message.session_id;
  }
}
