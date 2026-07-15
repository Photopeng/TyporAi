import { createAgentEngine } from '../../../core/engine-factory';
import type { ProviderCapabilities, ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnCallback,
  ChatRewindMode,
  ChatRewindResult,
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  ExitPlanModeCallback,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import { isDocumentEditingAllowed } from '../../../core/security/documentEditing';
import type { ChatMessage, Conversation, SlashCommand, StreamChunk, ToolCallInfo, UsageInfo } from '../../../core/types';
import type { AgentChatRequest, AgentMessage, EngineToolEvent, IAgentEngine } from '../../../core/types/agent-engine';
import { t } from '../../../i18n/i18n';
import type TyporAiPlugin from '../../../main';
import { TyporaEditorApi } from '../../../typora/editor-api';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { getVaultPath } from '../../../utils/path';
import { TYPORA_PROVIDER_CAPABILITIES } from '../capabilities';
import { getTyporaProviderSettings } from '../settings';

export class TyporaChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'typora';

  private engine: IAgentEngine | null = null;
  private ready = false;
  private readyListeners = new Set<(ready: boolean) => void>();
  private sessionId: string | null = null;
  private syncedForkSource: { resumeAt: string; sessionId: string } | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private approvalCallback: ApprovalCallback | null = null;

  constructor(private readonly plugin: TyporAiPlugin) {}

  getCapabilities(): Readonly<ProviderCapabilities> {
    return TYPORA_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    const isCompact = /^\/compact(\s|$)/i.test(request.text);
    return {
      request,
      persistedContent: request.text,
      prompt: request.text,
      isCompact,
      mcpMentions: new Set<string>(),
    };
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {
    // The lightweight Typora engine has no provider-native rewind checkpoints.
  }

  syncConversationState(conversation: ChatRuntimeConversationState | null): void {
    this.sessionId = conversation?.sessionId ?? null;
    this.syncedForkSource = getForkSource(conversation?.providerState);
  }

  async reloadMcpServers(): Promise<void> {
    // Typora provider does not own MCP server management.
  }

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    if (!this.engine) {
      const settings = this.plugin.settings as Record<string, unknown>;
      this.engine = createAgentEngine({
        ...getTyporaProviderSettings(settings),
        effortLevel: typeof settings.effortLevel === 'string' ? settings.effortLevel : undefined,
      });
      await this.engine.init();
    }

    this.setReady(true);
    return true;
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory: ChatMessage[] = [],
    _queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    const userMessageId = createMessageId('typora-user');
    const assistantMessageId = createMessageId('typora-assistant');
    this.turnMetadata = {
      assistantMessageId,
      userMessageId,
      wasSent: true,
    };
    this.sessionId = this.sessionId ?? createSessionId();

    if (turn.isCompact) {
      yield { type: 'context_compacted' };
      yield { type: 'usage', usage: buildUsageInfo(turn.prompt, '', this.getAuxiliaryModel() ?? undefined), sessionId: this.sessionId };
      yield { type: 'done' };
      return;
    }

    try {
      await this.ensureReady();
    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
      yield { type: 'done' };
      return;
    }

    const engine = this.engine;
    if (!engine) {
      yield { type: 'error', content: 'Typora engine is not ready.' };
      yield { type: 'done' };
      return;
    }

    const queue = new StreamChunkQueue();
    let streamedText = '';
    let finalText = '';

    engine.chat(
      this.buildAgentRequest(turn, conversationHistory),
      {
        onToken: (token) => {
          streamedText += token;
          queue.push({ type: 'text', content: token });
        },
        onToolStart: (event) => {
          queue.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: normalizeToolInput(event.input),
          });
        },
        onToolEnd: (event) => {
          queue.push({
            type: 'tool_result',
            id: event.id,
            content: normalizeToolOutput(event.output),
          });
        },
        onError: (error) => {
          queue.push({ type: 'error', content: error.message });
        },
        onFinish: (message) => {
          finalText = message.content;
          if (!streamedText && message.content) {
            queue.push({ type: 'text', content: message.content });
          }
        },
      },
    )
      .then((message) => {
        const assistantText = streamedText || finalText || message.content;
        queue.push({
          type: 'usage',
          usage: buildUsageInfo(
            [
              turn.prompt,
              ...conversationHistory.map(historyMessage => historyMessage.content),
            ].join('\n'),
            assistantText,
            this.getAuxiliaryModel() ?? undefined,
          ),
          sessionId: this.sessionId,
        });
      })
      .catch((error: unknown) => {
        queue.push({
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        queue.push({ type: 'done' });
        queue.close();
      });

    for await (const chunk of queue.drain()) {
      yield chunk;
    }
  }

  cancel(): void {
    this.engine?.abort();
  }

  resetSession(): void {
    this.sessionId = null;
    this.syncedForkSource = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  consumeSessionInvalidation(): boolean {
    return false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  getAuxiliaryModel(): string | null {
    return getTyporaProviderSettings(this.plugin.settings as Record<string, unknown>).apiModel;
  }

  cleanup(): void {
    this.engine?.abort();
    this.engine = null;
    this.setReady(false);
  }

  async rewind(
    _userMessageId: string,
    _assistantMessageId: string | undefined,
    _mode?: ChatRewindMode,
  ): Promise<ChatRewindResult> {
    return { canRewind: false, error: 'Typora provider does not support rewind.' };
  }

  setApprovalCallback(callback: ApprovalCallback | null): void {
    this.approvalCallback = callback;
  }
  setApprovalDismisser(_dismisser: (() => void) | null): void {}
  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}
  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}
  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}
  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}
  setAutoTurnCallback(_callback: AutoTurnCallback | null): void {}

  consumeTurnMetadata(): ChatTurnMetadata {
    const metadata = { ...this.turnMetadata };
    this.turnMetadata = {};
    return metadata;
  }

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    const forkSource = getForkSource(params.conversation?.providerState) ?? this.syncedForkSource;
    const updates: Partial<Conversation> = {
      sessionId: params.sessionInvalidated ? null : this.sessionId,
    };

    if (forkSource) {
      updates.providerState = { forkSource };
    }

    return {
      updates,
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null {
    return this.sessionId
      ?? conversation?.sessionId
      ?? getForkSource(conversation?.providerState)?.sessionId
      ?? this.syncedForkSource?.sessionId
      ?? null;
  }

  async loadSubagentToolCalls(_agentId: string): Promise<ToolCallInfo[]> {
    return [];
  }

  async loadSubagentFinalResult(_agentId: string): Promise<string | null> {
    return null;
  }

  private buildAgentRequest(
    turn: PreparedChatTurn,
    conversationHistory: ChatMessage[],
  ): AgentChatRequest {
    const workspacePath = getVaultPath(this.plugin.app) ?? process.cwd();
    const editor = this.getEditorSnapshot();
    const selection = turn.request.editorSelection?.mode === 'selection'
      ? turn.request.editorSelection.selectedText
      : editor.selection
        ? editor.selection
      : undefined;

    return {
      prompt: turn.prompt,
      workspacePath,
      currentFilePath: turn.request.currentNotePath
        ?? turn.request.editorSelection?.notePath
        ?? editor.currentFilePath
        ?? null,
      currentDocument: editor.currentDocument,
      selection,
      history: conversationHistory.map(toAgentMessage),
      approvalCallback: isDocumentEditingAllowed(this.plugin.settings.permissionMode)
        ? this.approvalCallback
        : async () => {
          new NoticeAdapter().show(t('inlineEdit.errors.documentEditingBlocked'), 'warning');
          return 'deny';
        },
      replaceSelection: isDocumentEditingAllowed(this.plugin.settings.permissionMode)
        ? editor.replaceSelection
        : undefined,
    };
  }

  private getEditorSnapshot(): {
    currentDocument: string;
    currentFilePath: string | null;
    replaceSelection?: (text: string) => boolean;
    selection: string;
  } {
    if (typeof window === 'undefined') {
      return { currentDocument: '', currentFilePath: null, selection: '' };
    }

    try {
      const editor = new TyporaEditorApi();
      return {
        currentDocument: editor.getAllText(),
        currentFilePath: editor.getCurrentFilePath(),
        replaceSelection: (text) => editor.insertText(text),
        selection: editor.getSelection(),
      };
    } catch {
      return { currentDocument: '', currentFilePath: null, selection: '' };
    }
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) {
      return;
    }

    this.ready = ready;
    for (const listener of this.readyListeners) {
      listener(ready);
    }
  }
}

class StreamChunkQueue {
  private readonly chunks: StreamChunk[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;

  push(chunk: StreamChunk): void {
    this.chunks.push(chunk);
    this.notify();
  }

  close(): void {
    this.closed = true;
    this.notify();
  }

  async *drain(): AsyncGenerator<StreamChunk> {
    while (!this.closed || this.chunks.length > 0) {
      const chunk = this.chunks.shift();
      if (chunk) {
        yield chunk;
        continue;
      }

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private notify(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

function toAgentMessage(message: ChatMessage): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };
}

function normalizeToolInput(input: EngineToolEvent['input']): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input === undefined ? {} : { value: input };
  }

  return input as Record<string, unknown>;
}

function normalizeToolOutput(output: EngineToolEvent['output']): string {
  if (typeof output === 'string') {
    return output;
  }

  if (output === undefined) {
    return '';
  }

  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function createSessionId(): string {
  return createMessageId('typora-session');
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildUsageInfo(input: string, output: string, model?: string): UsageInfo {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  const contextWindow = 200_000;
  const contextTokens = inputTokens + outputTokens;
  return {
    model,
    inputTokens,
    contextWindow,
    contextWindowIsAuthoritative: false,
    contextTokens,
    percentage: contextWindow > 0
      ? Math.min(100, Math.max(0, Math.round((contextTokens / contextWindow) * 100)))
      : 0,
  };
}

function estimateTokens(value: string): number {
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

function getForkSource(providerState: Record<string, unknown> | undefined): {
  resumeAt: string;
  sessionId: string;
} | null {
  const forkSource = providerState?.forkSource;
  if (!forkSource || typeof forkSource !== 'object' || Array.isArray(forkSource)) {
    return null;
  }

  const candidate = forkSource as Record<string, unknown>;
  return typeof candidate.sessionId === 'string' && typeof candidate.resumeAt === 'string'
    ? { sessionId: candidate.sessionId, resumeAt: candidate.resumeAt }
    : null;
}
