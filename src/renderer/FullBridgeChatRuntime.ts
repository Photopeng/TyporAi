import { BlobUploader } from '@/bridge/client/BlobUploader';
import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import type { ProviderCapabilities, ProviderId } from '@/core/providers/types';
import type { ChatRuntime } from '@/core/runtime/ChatRuntime';
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
} from '@/core/runtime/types';
import type { ChatMessage, Conversation, ImageAttachment, SlashCommand, StreamChunk } from '@/core/types';
import type TyporAiPlugin from '@/main';
import { getOpencodeProviderSettings,updateOpencodeProviderSettings } from '@/providers/opencode/settings';
import type { SidecarTurnOptions } from '@/sidecar/providers/registry';

import { getRendererProvider } from './RendererProviderRegistry';

interface RuntimeStateResult {
  readonly providerState?: Record<string, unknown>;
  readonly sessionId: string | null;
  readonly turnMetadata?: ChatTurnMetadata;
}

interface SidecarSkill {
  readonly description?: string;
  readonly id: string;
  readonly name?: string;
}

/** Complete ChatRuntime projection used by the shared Windows/macOS UI. */
export class FullBridgeChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId;
  private activeTurnId: string | null = null;
  private approvalCallback: ApprovalCallback | null = null;
  private approvalDismisser: (() => void) | null = null;
  private askUserQuestionCallback: AskUserQuestionCallback | null = null;
  private autoTurnCallback: AutoTurnCallback | null = null;
  private conversationId: string;
  private exitPlanModeCallback: ExitPlanModeCallback | null = null;
  private ready = true;
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private readonly runtimeId = crypto.randomUUID();
  private sessionId: string | null = null;
  private providerState: Record<string, unknown> | undefined;
  private pendingReset: Promise<void> | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly rpc: WebSocketRpcClient,
    providerId: ProviderId,
    private readonly plugin?: TyporAiPlugin,
  ) {
    this.providerId = providerId;
    this.conversationId = this.runtimeId;
    this.unsubscribers.push(
      rpc.onNotification('approval.request', params => { void this.handleApproval(params); }),
      rpc.onNotification('userInput.request', params => { void this.handleUserInput(params); }),
      rpc.onNotification('planApproval.request', params => { void this.handlePlanApproval(params); }),
    );
  }

  getCapabilities(): Readonly<ProviderCapabilities> {
    const provider = getRendererProvider(this.providerId);
    if (!provider) throw new Error(`Unknown renderer provider: ${this.providerId}`);
    return { ...provider.capabilities, supportsNativeHistory: false };
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return {
      isCompact: /^\/compact(?:\s|$)/i.test(request.text),
      mcpMentions: request.enabledMcpServers ?? new Set<string>(),
      persistedContent: request.text,
      prompt: buildSidecarPrompt(request),
      request,
    };
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    listener(this.ready);
    return () => this.readyListeners.delete(listener);
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(
    conversation: ChatRuntimeConversationState | null,
    _externalContextPaths?: string[],
  ): void {
    this.sessionId = conversation?.sessionId ?? null;
    this.providerState = conversation?.providerState;
    const sidecarConversationId = conversation?.providerState?.sidecarConversationId;
    this.conversationId = typeof sidecarConversationId === 'string' && sidecarConversationId
      ? sidecarConversationId
      : this.runtimeId;
  }

  async reloadMcpServers(): Promise<void> {
    await this.rpc.request('mcp.list');
  }

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    try {
      const providers = await this.rpc.request<Array<{ providerId: string; status: string }>>('provider.list');
      this.setReady(providers.some(provider => provider.providerId === this.providerId && provider.status === 'available'));
    } catch {
      this.setReady(false);
    }
    return this.ready;
  }

  async *query(
    turn: PreparedChatTurn,
    _conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    const turnId = crypto.randomUUID();
    const queue = new StreamQueue();
    this.activeTurnId = turnId;
    this.turnMetadata = { wasSent: true };
    const unsubscribe = this.rpc.onEvent(event => {
      if (event.streamId !== turnId || event.event !== 'chat.chunk' || !isStreamChunk(event.payload)) return;
      this.captureMetadata(event.payload);
      queue.push(event.payload);
    });
    try {
      await this.pendingReset;
      this.pendingReset = null;
      const blobIds = await this.uploadImages(turn.request.images ?? []);
      await this.rpc.request('chat.createRuntime', {
        conversationId: this.conversationId,
        providerId: this.providerId,
        runtimeId: this.runtimeId,
      });
      await this.rpc.request('chat.startTurn', {
        blobIds,
        conversationId: this.conversationId,
        prompt: withExternalContext(turn.prompt, queryOptions?.externalContextPaths),
        providerId: this.providerId,
        runtimeId: this.runtimeId,
        options: serializeTurnOptions(queryOptions),
        turnId,
      });
      for (;;) {
        const chunk = await queue.next();
        if (!chunk) break;
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
      await this.refreshRuntimeState();
    } finally {
      unsubscribe();
      queue.close();
      if (this.activeTurnId === turnId) this.activeTurnId = null;
      this.approvalDismisser?.();
    }
  }

  async steer(turn: PreparedChatTurn): Promise<boolean> {
    if (!this.activeTurnId || !this.getCapabilities().supportsTurnSteer) return false;
    const blobIds = await this.uploadImages(turn.request.images ?? []);
    const result = await this.rpc.request<{ accepted: boolean }>('chat.steer', {
      blobIds,
      prompt: turn.prompt,
      providerId: this.providerId,
      runtimeId: this.runtimeId,
      turnId: this.activeTurnId,
    });
    return result.accepted;
  }

  cancel(): void {
    if (!this.activeTurnId) return;
    void this.rpc.request('chat.cancelTurn', { turnId: this.activeTurnId });
  }

  resetSession(): void {
    this.pendingReset = this.rpc.request('chat.resetSession', {
      providerId: this.providerId,
      runtimeId: this.runtimeId,
    }).then(() => undefined, () => undefined);
    this.sessionId = null;
    this.providerState = undefined;
    this.conversationId = crypto.randomUUID();
  }

  getSessionId(): string | null { return this.sessionId; }
  consumeSessionInvalidation(): boolean { return false; }
  isReady(): boolean { return this.ready; }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    if (!this.getCapabilities().supportsProviderCommands) return [];
    try {
      const skills = await this.rpc.request<SidecarSkill[]>('skills.list');
      return skills.filter(skill => skillBelongsToProvider(skill.id, this.providerId)).map(skill => ({
        content: `$${skill.name ?? skill.id}`,
        description: skill.description,
        id: skill.id,
        kind: 'skill',
        name: skill.name ?? skill.id,
        source: 'sdk',
      }));
    } catch {
      return [];
    }
  }

  cleanup(): void {
    this.cancel();
    this.unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    void this.rpc.request('chat.disposeRuntime', { providerId: this.providerId, runtimeId: this.runtimeId });
  }

  async rewind(
    _userMessageId: string,
    _assistantMessageId: string | undefined,
    mode: ChatRewindMode = 'conversation',
  ): Promise<ChatRewindResult> {
    if (mode === 'code-and-conversation') {
      return { canRewind: false, error: 'Sidecar code rewind is unavailable.' };
    }
    return { canRewind: true, filesChanged: [] };
  }

  setApprovalCallback(callback: ApprovalCallback | null): void { this.approvalCallback = callback; }
  setApprovalDismisser(dismisser: (() => void) | null): void { this.approvalDismisser = dismisser; }
  setAskUserQuestionCallback(callback: AskUserQuestionCallback | null): void { this.askUserQuestionCallback = callback; }
  setExitPlanModeCallback(callback: ExitPlanModeCallback | null): void { this.exitPlanModeCallback = callback; }
  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}
  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}
  setAutoTurnCallback(callback: AutoTurnCallback | null): void { this.autoTurnCallback = callback; }

  consumeTurnMetadata(): ChatTurnMetadata {
    const metadata = { ...this.turnMetadata };
    this.turnMetadata = {};
    return metadata;
  }

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    if (params.sessionInvalidated) return { updates: { providerState: undefined, sessionId: null } };
    return {
      updates: {
        providerState: {
          ...(params.conversation?.providerState ?? {}),
          ...(this.providerState ?? {}),
          sidecarConversationId: this.conversationId,
        },
        sessionId: this.sessionId,
      },
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null {
    return this.sessionId ?? conversation?.sessionId ?? null;
  }

  private async uploadImages(images: readonly ImageAttachment[]): Promise<string[]> {
    if (images.length === 0) return [];
    const uploader = new BlobUploader(this.rpc);
    const results: string[] = [];
    for (const image of images) {
      const bytes = base64ToBytes(image.data);
      const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const uploaded = await uploader.upload(new Blob([payload], { type: image.mediaType }));
      results.push(uploaded.blobId);
    }
    return results;
  }

  private captureMetadata(chunk: StreamChunk): void {
    if (chunk.type === 'user_message_start') this.turnMetadata.userMessageId = chunk.itemId;
    if (chunk.type === 'assistant_message_start') this.turnMetadata.assistantMessageId = chunk.itemId;
    if ('sessionId' in chunk && typeof chunk.sessionId === 'string') this.sessionId = chunk.sessionId;
  }

  private async refreshRuntimeState(): Promise<void> {
    try {
      const state = await this.rpc.request<RuntimeStateResult>('chat.getRuntimeState', {
        providerId: this.providerId,
        runtimeId: this.runtimeId,
      });
      this.sessionId = state.sessionId;
      this.providerState = state.providerState;
      this.turnMetadata = { ...this.turnMetadata, ...(state.turnMetadata ?? {}) };
      await this.syncProviderDiscovery(state.providerState);
    } catch {
      // Older Sidecars do not expose state. The renderer still retains its
      // provider-neutral conversation and can create a fresh native session.
    }
  }

  private async syncProviderDiscovery(providerState: Record<string, unknown> | undefined): Promise<void> {
    if (this.providerId !== 'opencode' || !this.plugin || !providerState) return;
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    const current = getOpencodeProviderSettings(settings);
    const discoveredModels = Array.isArray(providerState.discoveredModels) ? providerState.discoveredModels : null;
    const availableModes = Array.isArray(providerState.availableModes) ? providerState.availableModes : null;
    if (!discoveredModels || !availableModes
      || (JSON.stringify(current.discoveredModels) === JSON.stringify(discoveredModels)
        && JSON.stringify(current.availableModes) === JSON.stringify(availableModes))) return;
    updateOpencodeProviderSettings(settings, {
      availableModes: availableModes as typeof current.availableModes,
      discoveredModels: discoveredModels as typeof current.discoveredModels,
    });
    await this.plugin.saveSettings();
  }

  private async handleApproval(params: unknown): Promise<void> {
    if (!this.activeTurnId || !this.approvalCallback) return;
    const interaction = readInteraction(params);
    if (!interaction || !this.ownsInteraction(interaction.payload)) return;
    const payload = interaction.payload;
    const decision = await this.approvalCallback(
      stringValue(payload.toolName, 'Tool'),
      recordValue(payload.input),
      stringValue(payload.description, 'Provider requests approval.'),
    );
    await this.rpc.request('approval.resolve', {
      id: interaction.id,
      result: { approved: decision === 'allow' || decision === 'allow-always' || typeof decision === 'object', decision },
    });
  }

  private async handleUserInput(params: unknown): Promise<void> {
    if (!this.activeTurnId || !this.askUserQuestionCallback) return;
    const interaction = readInteraction(params);
    if (!interaction || !this.ownsInteraction(interaction.payload)) return;
    const answers = await this.askUserQuestionCallback(interaction.payload);
    await this.rpc.request('userInput.resolve', { id: interaction.id, result: { answers } });
  }

  private async handlePlanApproval(params: unknown): Promise<void> {
    if (!this.activeTurnId || !this.exitPlanModeCallback) return;
    const interaction = readInteraction(params);
    if (!interaction || !this.ownsInteraction(interaction.payload)) return;
    const decision = await this.exitPlanModeCallback(interaction.payload);
    await this.rpc.request('planApproval.resolve', { id: interaction.id, result: decision });
  }

  private ownsInteraction(payload: Readonly<Record<string, unknown>>): boolean {
    const runtimeId = payload.runtimeId;
    return typeof runtimeId !== 'string' || runtimeId === this.runtimeId;
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    this.readyListeners.forEach(listener => listener(ready));
  }
}

function buildSidecarPrompt(request: ChatTurnRequest): string {
  const sections = [request.text];
  if (request.typoraDocument?.content) {
    sections.push(`<current_document path="${escapeAttribute(request.typoraDocument.path ?? '')}">\n${request.typoraDocument.content}\n</current_document>`);
  }
  if (request.editorSelection?.selectedText) {
    sections.push(`<editor_selection>\n${request.editorSelection.selectedText}\n</editor_selection>`);
  }
  if (request.externalContextPaths?.length) sections.push(`<external_context_paths>\n${request.externalContextPaths.join('\n')}\n</external_context_paths>`);
  return sections.filter(Boolean).join('\n\n');
}

function escapeAttribute(value: string): string { return value.replace(/[&"<>]/g, character => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!); }

function withExternalContext(prompt: string, paths: readonly string[] | undefined): string {
  if (!paths?.length || prompt.includes('<external_context_paths>')) return prompt;
  return `${prompt}\n\n<external_context_paths>\n${paths.join('\n')}\n</external_context_paths>`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function isStreamChunk(value: unknown): value is StreamChunk {
  return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

function readInteraction(value: unknown): { id: string; payload: Readonly<Record<string, unknown>> } | null {
  if (!value || typeof value !== 'object') return null;
  const interaction = value as Record<string, unknown>;
  if (typeof interaction.id !== 'string' || !interaction.payload || typeof interaction.payload !== 'object') return null;
  return { id: interaction.id, payload: interaction.payload as Readonly<Record<string, unknown>> };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' && value ? value : fallback; }

function skillBelongsToProvider(id: string, providerId: ProviderId): boolean {
  if (providerId === 'claude') return id.startsWith('.claude/');
  if (providerId === 'codex') return id.startsWith('.codex/') || id.startsWith('.agents/');
  return providerId === 'opencode' && id.startsWith('.agents/');
}

function serializeTurnOptions(options: ChatRuntimeQueryOptions | undefined): SidecarTurnOptions {
  if (!options) return {};
  return {
    ...(options.allowedTools ? { allowedTools: [...options.allowedTools] } : {}),
    ...(options.enabledMcpServers ? { enabledMcpServers: [...options.enabledMcpServers] } : {}),
    ...(options.externalContextPaths ? { externalContextPaths: [...options.externalContextPaths] } : {}),
    ...(options.forceColdStart !== undefined ? { forceColdStart: options.forceColdStart } : {}),
    ...(options.mcpMentions ? { mcpMentions: [...options.mcpMentions] } : {}),
    ...(options.model ? { model: options.model } : {}),
  };
}

class StreamQueue {
  private readonly chunks: StreamChunk[] = [];
  private readonly waiters: Array<(chunk: StreamChunk | null) => void> = [];
  private closed = false;

  push(chunk: StreamChunk): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(chunk); else this.chunks.push(chunk);
  }

  close(): void {
    this.closed = true;
    this.waiters.splice(0).forEach(waiter => waiter(null));
  }

  next(): Promise<StreamChunk | null> {
    const chunk = this.chunks.shift();
    if (chunk) return Promise.resolve(chunk);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => this.waiters.push(resolve));
  }
}
