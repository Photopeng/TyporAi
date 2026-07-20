import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CanUseTool,
  Options,
  Query,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query as agentQuery } from '@anthropic-ai/claude-agent-sdk';

import type { ProcessTransportFactory } from '@/core/ports';
import { buildSystemPrompt } from '@/core/prompt/mainAgent';
import { resolveUnifiedPermissionPolicy } from '@/core/security/UnifiedPermissionPolicy';
import { TOOL_ASK_USER_QUESTION,TOOL_EXIT_PLAN_MODE,TOOL_WRITE } from '@/core/tools/toolNames';
import type { ExitPlanModeDecision,ImageAttachment,ManagedMcpServer,StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { toClaudeRuntimeModelId } from '@/providers/claude/modelSelection';
import { buildClaudePromptWithImages } from '@/providers/claude/runtime/ClaudeUserMessageFactory';
import { isStreamChunk } from '@/providers/claude/sdk/typeGuards';
import { getClaudeProviderSettings, resolveClaudeSettingSources } from '@/providers/claude/settings';
import { transformSDKMessage } from '@/providers/claude/stream/transformClaudeMessage';
import { resolveEffortLevel } from '@/providers/claude/types/models';
import { getEnhancedPath, getMissingNodeError, parseEnvironmentVariables } from '@/utils/env';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';
import type { SidecarTurnOptions } from '../registry';

export interface ClaudeSidecarRuntimeOptions {
  /** Retained while the runtime migrates from the Sidecar stream bridge. */
  readonly processes: ProcessTransportFactory;
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly getMcpServers?: () => readonly ManagedMcpServer[];
  readonly requestApproval: (toolName: string, input: Record<string, unknown>, description: string) => Promise<'allow' | 'deny'>;
  readonly requestPlanApproval?: (input: Record<string, unknown>) => Promise<ExitPlanModeDecision | null>;
  readonly requestUserInput?: (input: Record<string, unknown>) => Promise<Record<string, string | string[]> | null>;
}

/** Native Claude Agent SDK runtime owned by Sidecar rather than the Renderer. */
export class ClaudeSidecarRuntime {
  private activeTurn: string | null = null;
  private activeQuery: Query | null = null;
  private sessionId: string | null = null;
  private planFilePath: string | null = null;

  constructor(private readonly options: ClaudeSidecarRuntimeOptions) {}

  async startTurn(
    connectionId: string,
    turnId: string,
    prompt: string,
    publish: (event: RpcEventEnvelope<StreamChunk>) => void,
    turnOptions: SidecarTurnOptions = {},
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
        prompt: await buildSidecarClaudePrompt(prompt),
        options: this.createQueryOptions(workspace, turnOptions),
      });
      this.activeQuery = query;
      for await (const message of query) {
        this.captureSessionId(message);
        for (const event of transformSDKMessage(message, { intendedModel: this.getModel(turnOptions.model) })) {
          if (isStreamChunk(event)) {
            this.capturePlanFile(event);
            emit(event);
          }
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

  restoreSession(sessionId: string | null): void { this.sessionId = sessionId; }
  getSessionState(): { readonly sessionId: string | null } { return { sessionId: this.sessionId }; }
  async resetSession(): Promise<void> {
    await this.activeQuery?.interrupt();
    this.sessionId = null;
    this.planFilePath = null;
  }

  private createQueryOptions(workspace: string, turnOptions: SidecarTurnOptions = {}): Options {
    const settings = this.options.getSettings();
    const provider = getClaudeProviderSettings(settings);
    const cliPath = resolveClaudeNativeExecutable(provider.cliPath || 'claude');
    const customEnvironment = parseEnvironmentVariables(provider.environmentVariables);
    const enhancedPath = getEnhancedPath(customEnvironment.PATH, cliPath);
    const missingNodeError = getMissingNodeError(cliPath, enhancedPath);
    if (missingNodeError) throw new Error(missingNodeError);

    const model = this.getModel(turnOptions.model);
    const permission = resolveUnifiedPermissionPolicy(settings.permissionMode);
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
      allowDangerouslySkipPermissions: permission.filesystem === 'full-access',
      permissionMode: permission.planOnly ? 'plan' : permission.filesystem === 'full-access' ? 'bypassPermissions' : 'default',
      canUseTool: this.createApprovalCallback(),
      thinking: { type: 'adaptive' },
      effort: resolveEffortLevel(model, settings.effortLevel),
    };
    if (turnOptions.allowedTools) queryOptions.allowedTools = [...turnOptions.allowedTools];
    if (this.sessionId && !turnOptions.forceColdStart) queryOptions.resume = this.sessionId;
    const selectedMcpServers = [...(turnOptions.enabledMcpServers ?? []), ...(turnOptions.mcpMentions ?? [])];
    const enabledMcpServers = selectedMcpServers.length > 0 ? new Set(selectedMcpServers) : null;
    const mcpServers = this.options.getMcpServers?.().filter(server => server.enabled && !server.contextSaving
      && (!enabledMcpServers || enabledMcpServers.has(server.name))) ?? [];
    if (mcpServers.length > 0) {
      queryOptions.mcpServers = Object.fromEntries(mcpServers.map(server => [server.name, server.config])) as Options['mcpServers'];
    }
    if (provider.safeMode === 'auto') queryOptions.extraArgs = { 'enable-auto-mode': null };
    if (provider.enableChrome) queryOptions.extraArgs = { ...queryOptions.extraArgs, chrome: null };
    return queryOptions;
  }

  private createApprovalCallback(): CanUseTool {
    return async (toolName, input) => {
      const normalizedInput = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      if (toolName === TOOL_EXIT_PLAN_MODE && this.options.requestPlanApproval) {
        const planContent = await this.readPlanContent();
        const decision = await this.options.requestPlanApproval({
          ...normalizedInput,
          ...(planContent ? { planContent } : {}),
        });
        if (!decision) return { behavior: 'deny', message: 'User cancelled.', interrupt: true };
        if (decision.type === 'feedback') return { behavior: 'deny', message: decision.text, interrupt: false };
        return { behavior: 'allow', updatedInput: normalizedInput };
      }
      if (toolName === TOOL_ASK_USER_QUESTION && this.options.requestUserInput) {
        const questions = normalizedInput.questions;
        if (Array.isArray(questions)) {
          for (const question of questions) {
            if (question && typeof question === 'object' && !Array.isArray(question) && !('isOther' in question)) {
              (question as Record<string, unknown>).isOther = true;
            }
          }
        }
        const answers = await this.options.requestUserInput(normalizedInput);
        return answers
          ? { behavior: 'allow', updatedInput: { ...normalizedInput, answers } }
          : { behavior: 'deny', message: 'User declined to answer.', interrupt: true };
      }
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

  private capturePlanFile(chunk: StreamChunk): void {
    if (chunk.type !== 'tool_use' || chunk.name !== TOOL_WRITE) return;
    const path = chunk.input.file_path;
    if (typeof path === 'string' && path.replace(/\\/g, '/').includes('/.claude/plans/')) {
      this.planFilePath = path;
    }
  }

  private async readPlanContent(): Promise<string | null> {
    if (!this.planFilePath) return null;
    try {
      const content = await readFile(this.planFilePath, 'utf8');
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  private getModel(override?: string): string {
    const model = override ?? this.options.getSettings().model;
    return toClaudeRuntimeModelId(typeof model === 'string' && model.trim() ? model : 'sonnet') || 'sonnet';
  }

  private captureSessionId(message: SDKMessage): void {
    if (message.type !== 'system' || message.subtype !== 'init' || !message.session_id) return;
    this.sessionId = message.session_id;
  }
}

async function buildSidecarClaudePrompt(prompt: string): Promise<ReturnType<typeof buildClaudePromptWithImages>> {
  const match = prompt.match(/\n*<typorai_attachments>\n([\s\S]*?)\n<\/typorai_attachments>\s*$/);
  if (!match) return prompt;
  const paths = match[1].split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const images: ImageAttachment[] = await Promise.all(paths.map(async (target, index) => {
    const data = await readFile(target);
    return { id: `sidecar-${index}`, name: target.split(/[\\/]/).pop() ?? `image-${index + 1}`, data: data.toString('base64'), mediaType: mimeTypeFor(target), size: data.byteLength, source: 'file' };
  }));
  return buildClaudePromptWithImages(prompt.slice(0, match.index).trimEnd(), images);
}

function mimeTypeFor(target: string): ImageAttachment['mediaType'] {
  const extension = target.toLowerCase().split('.').pop();
  return extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'gif' ? 'image/gif' : 'image/webp';
}

function resolveClaudeNativeExecutable(configuredPath: string): string {
  if (existsSync(configuredPath)) return configuredPath;
  if (process.platform !== 'win32') return configuredPath;

  const candidateDirectories = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm') : '',
  ].filter(Boolean);
  for (const directory of candidateDirectories) {
    const executable = path.join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(executable)) return executable;
  }
  return configuredPath;
}
