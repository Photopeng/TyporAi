import type { ProcessTransportFactory } from '@/core/ports';
import type { ChatTurnMetadata } from '@/core/runtime/types';
import type { ApprovalDecision,StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { toCodexRuntimeModelId } from '@/providers/codex/modelSelection';
import { CodexAppServerProcess } from '@/providers/codex/runtime/CodexAppServerProcess';
import { initializeCodexAppServerTransport } from '@/providers/codex/runtime/codexAppServerSupport';
import type { ThreadStartResult, TurnStartResult, UserInput } from '@/providers/codex/runtime/codexAppServerTypes';
import { buildCodexLaunchSpec } from '@/providers/codex/runtime/CodexLaunchSpecBuilder';
import type { CodexLaunchSpec } from '@/providers/codex/runtime/codexLaunchTypes';
import { CodexNotificationRouter } from '@/providers/codex/runtime/CodexNotificationRouter';
import { CodexRpcTransport } from '@/providers/codex/runtime/CodexRpcTransport';
import { CodexServerRequestRouter } from '@/providers/codex/runtime/CodexServerRequestRouter';
import { getCodexProviderSettings,getEffectiveCodexReasoningSummary } from '@/providers/codex/settings';
import { DEFAULT_CODEX_PRIMARY_MODEL,FAST_TIER_CODEX_MODEL } from '@/providers/codex/types/models';
import { getEnhancedPath, parseEnvironmentVariables } from '@/utils/env';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';
import { adaptSidecarProcessSession } from '../../services/process/adaptProcessSession';
import type { SidecarTurnOptions } from '../registry';

export interface CodexSidecarRuntimeOptions {
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly processes: ProcessTransportFactory;
  readonly requestApproval?: (toolName: string, input: Record<string, unknown>, description: string) => Promise<ApprovalDecision>;
  readonly requestUserInput?: (input: Record<string, unknown>) => Promise<Record<string, string | string[]> | null>;
}

/** Sidecar-owned Codex app-server runtime with one persistent native thread. */
export class CodexSidecarRuntime {
  private process: CodexAppServerProcess | null = null;
  private transport: CodexRpcTransport | null = null;
  private threadId: string | null = null;
  private threadLoaded = false;
  private activeTurn: string | null = null;
  private currentProviderTurnId: string | null = null;
  private currentThreadId: string | null = null;
  private interruptActiveTurn: ((error: Error) => void) | null = null;
  private readonly serverRequests = new CodexServerRequestRouter();
  private turnMetadata: ChatTurnMetadata = {};

  constructor(private readonly options: CodexSidecarRuntimeOptions) {
    this.serverRequests.setApprovalCallback(async (toolName, input, description) =>
      await this.options.requestApproval?.(toolName, input, description) ?? 'deny');
    this.serverRequests.setAskUserCallback(async input =>
      await this.options.requestUserInput?.(input) ?? null);
  }

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
      const transport = await this.ensureTransport(workspace);
      const model = resolveCodexModel(this.options.getSettings(), turnOptions.model);
      const threadId = await this.ensureThread(transport, workspace, model);
      await this.runTurn(transport, threadId, workspace, prompt, emit, turnOptions);
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : String(error) });
      emit({ type: 'done' });
    } finally {
      this.activeTurn = null;
      this.currentProviderTurnId = null;
      this.currentThreadId = null;
      this.interruptActiveTurn = null;
    }
  }

  cancelTurn(turnId: string): void {
    if (this.activeTurn !== turnId) return;
    this.interruptActiveTurn?.(new Error('REQUEST_CANCELLED'));
    void this.shutdownProcess();
  }

  async dispose(): Promise<void> {
    await this.shutdownProcess();
    this.threadId = null;
  }

  restoreSession(sessionId: string | null): void { this.threadId = sessionId; this.threadLoaded = false; }
  getSessionState(): { readonly sessionId: string | null } { return { sessionId: this.threadId }; }
  consumeTurnMetadata(): ChatTurnMetadata { const result = { ...this.turnMetadata }; this.turnMetadata = {}; return result; }
  async resetSession(): Promise<void> {
    await this.shutdownProcess();
    this.threadId = null;
    this.threadLoaded = false;
  }

  async steer(turnId: string, prompt: string): Promise<boolean> {
    const transport = this.transport;
    if (!transport || this.activeTurn !== turnId || !this.currentProviderTurnId || !this.currentThreadId) return false;
    const attachment = extractSidecarAttachments(prompt);
    const result = await transport.request<{ turnId: string }>('turn/steer', {
      expectedTurnId: this.currentProviderTurnId,
      input: [
        ...attachment.paths.map(path => ({ type: 'localImage' as const, path })),
        { type: 'text', text: attachment.prompt, text_elements: [] },
      ],
      threadId: this.currentThreadId,
    });
    return result.turnId === this.currentProviderTurnId;
  }

  private async runTurn(
    transport: CodexRpcTransport,
    threadId: string,
    workspace: string,
    prompt: string,
    emit: (chunk: StreamChunk) => void,
    turnOptions: SidecarTurnOptions,
  ): Promise<void> {
    let providerTurnId: string | null = null;
    let completedBeforeStart = false;
    let resolveCompletion: () => void = () => undefined;
    let rejectCompletion: (error: Error) => void = () => undefined;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    this.interruptActiveTurn = error => rejectCompletion(error);

    const settings = this.options.getSettings();
    const model = resolveCodexModel(settings, turnOptions.model);
    const isPlanTurn = settings.permissionMode === 'plan';
    this.turnMetadata = {};
    const router = new CodexNotificationRouter(emit, update => { this.turnMetadata = { ...this.turnMetadata, ...update }; });
    router.beginTurn({ isPlanTurn });
    for (const method of CODEX_NOTIFICATION_METHODS) {
      transport.onNotification(method, params => router.handleNotification(method, params));
    }
    transport.onNotification('turn/completed', params => {
      router.handleNotification('turn/completed', params);
      const completedTurnId = extractTurnId(params);
      if (!providerTurnId) {
        completedBeforeStart = true;
      } else if (!completedTurnId || completedTurnId === providerTurnId) {
        resolveCompletion();
      }
    });
    transport.onNotification('error', params => {
      router.handleNotification('error', params);
      rejectCompletion(new Error(extractErrorMessage(params)));
    });
    for (const method of CODEX_SERVER_REQUEST_METHODS) {
      transport.onServerRequest(method, (requestId, params) =>
        this.serverRequests.handleServerRequest(requestId, method, params));
    }

    const attachment = extractSidecarAttachments(prompt);
    const input: UserInput[] = [
      ...attachment.paths.map(path => ({ type: 'localImage' as const, path })),
      { type: 'text', text: attachment.prompt, text_elements: [] },
    ];
    const result = await transport.request<TurnStartResult>('turn/start', {
      threadId,
      input,
      cwd: workspace,
      approvalPolicy: resolvePermissionMode(settings).approvalPolicy,
      collaborationMode: {
        mode: isPlanTurn ? 'plan' : 'default',
        settings: { developer_instructions: null, model, reasoning_effort: resolveEffort(settings.effortLevel) },
      },
      effort: resolveEffort(settings.effortLevel),
      model,
      sandboxPolicy: resolveSandboxPolicy(settings, workspace),
      serviceTier: model === FAST_TIER_CODEX_MODEL && settings.serviceTier === 'fast' ? 'fast' : null,
      summary: getEffectiveCodexReasoningSummary(settings, model),
    });
    providerTurnId = result.turn.id;
    this.currentProviderTurnId = providerTurnId;
    this.currentThreadId = threadId;
    if (completedBeforeStart) resolveCompletion();
    await completion;
    router.endTurn();
  }

  private async ensureTransport(workspace: string): Promise<CodexRpcTransport> {
    if (this.transport && this.process?.isAlive()) return this.transport;
    await this.shutdownProcess();
    const spec = createCodexSidecarLaunchSpec(this.options.getSettings(), workspace);
    this.process = new CodexAppServerProcess(spec, this.options.processes, undefined, adaptSidecarProcessSession);
    await this.process.start();
    this.transport = new CodexRpcTransport(this.process);
    this.transport.start();
    await initializeCodexAppServerTransport(this.transport);
    return this.transport;
  }

  private async ensureThread(transport: CodexRpcTransport, workspace: string, selectedModel?: string): Promise<string> {
    const settings = this.options.getSettings();
    const model = selectedModel ?? resolveCodexModel(settings);
    const permission = resolvePermissionMode(settings);
    if (this.threadId && this.threadLoaded) return this.threadId;
    if (this.threadId) {
      const resumed = await transport.request<ThreadStartResult>('thread/resume', {
        threadId: this.threadId,
        model,
        cwd: workspace,
        approvalPolicy: permission.approvalPolicy,
        sandbox: permission.sandbox,
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      });
      this.threadId = resumed.thread.id;
      this.threadLoaded = true;
      return this.threadId;
    }
    const result = await transport.request<ThreadStartResult>('thread/start', {
      model,
      cwd: workspace,
      approvalPolicy: permission.approvalPolicy,
      sandbox: permission.sandbox,
      experimentalRawEvents: true,
      persistExtendedHistory: true,
    });
    this.threadId = result.thread.id;
    this.threadLoaded = true;
    return this.threadId;
  }

  private async shutdownProcess(): Promise<void> {
    this.transport?.dispose();
    this.transport = null;
    await this.process?.shutdown();
    this.process = null;
    this.threadLoaded = false;
  }
}

function extractSidecarAttachments(prompt: string): { readonly paths: readonly string[]; readonly prompt: string } {
  const match = prompt.match(/\n*<typorai_attachments>\n([\s\S]*?)\n<\/typorai_attachments>\s*$/);
  if (!match) return { paths: [], prompt };
  const paths = match[1].split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  return { paths, prompt: prompt.slice(0, match.index).trimEnd() };
}

export function createCodexSidecarLaunchSpec(
  settings: Record<string, unknown>,
  workspace: string,
): CodexLaunchSpec {
  const provider = getCodexProviderSettings(settings);
  const customEnvironment = parseEnvironmentVariables(provider.environmentVariables);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return buildCodexLaunchSpec({
    settings,
    resolvedCliCommand: provider.cliPath || null,
    hostVaultPath: workspace,
    env: {
      ...environment,
      ...customEnvironment,
      PATH: getEnhancedPath(customEnvironment.PATH, provider.cliPath),
    },
  });
}

function extractTurnId(params: unknown): string | null {
  const value = params as { turn?: { id?: unknown }; turnId?: unknown } | null;
  if (typeof value?.turn?.id === 'string') return value.turn.id;
  return typeof value?.turnId === 'string' ? value.turnId : null;
}

const CODEX_NOTIFICATION_METHODS = [
  'item/agentMessage/delta',
  'item/started',
  'item/completed',
  'item/plan/delta',
  'item/reasoning/textDelta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded',
  'thread/tokenUsage/updated',
  'turn/plan/updated',
  'item/commandExecution/outputDelta',
  'item/fileChange/outputDelta',
  'item/fileChange/patchUpdated',
  'rawResponseItem/completed',
  'event_msg',
] as const;

const CODEX_SERVER_REQUEST_METHODS = [
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/requestUserInput',
] as const;

function resolveCodexModel(settings: Record<string, unknown>, override?: string): string {
  const value = typeof override === 'string' && override.trim()
    ? override
    : typeof settings.model === 'string' && settings.model.trim()
    ? settings.model
    : DEFAULT_CODEX_PRIMARY_MODEL;
  return toCodexRuntimeModelId(value);
}

function resolveEffort(value: unknown): string {
  return value === 'low' || value === 'high' || value === 'xhigh' ? value : 'medium';
}

function resolvePermissionMode(settings: Record<string, unknown>): { approvalPolicy: string; sandbox: string } {
  if (settings.permissionMode === 'yolo') return { approvalPolicy: 'never', sandbox: 'danger-full-access' };
  if (settings.permissionMode === 'plan') return { approvalPolicy: 'on-request', sandbox: 'workspace-write' };
  return { approvalPolicy: 'never', sandbox: 'read-only' };
}

function resolveSandboxPolicy(settings: Record<string, unknown>, workspace: string): Record<string, unknown> {
  const permission = resolvePermissionMode(settings);
  if (permission.sandbox === 'danger-full-access') return { type: 'dangerFullAccess' };
  if (permission.sandbox === 'workspace-write') {
    return {
      type: 'workspaceWrite',
      writableRoots: [workspace],
      readOnlyAccess: { type: 'fullAccess' },
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }
  return { type: 'readOnly', access: { type: 'fullAccess' }, networkAccess: false };
}

function extractErrorMessage(params: unknown): string {
  const value = params as { message?: unknown; error?: { message?: unknown } } | null;
  if (typeof value?.message === 'string') return value.message;
  if (typeof value?.error?.message === 'string') return value.error.message;
  return 'Codex app-server reported an error.';
}
