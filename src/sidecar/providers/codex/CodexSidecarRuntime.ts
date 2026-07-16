import type { ProcessTransportFactory } from '@/core/ports';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import { CodexAppServerProcess } from '@/providers/codex/runtime/CodexAppServerProcess';
import { initializeCodexAppServerTransport } from '@/providers/codex/runtime/codexAppServerSupport';
import type { ThreadStartResult, TurnStartResult, UserInput } from '@/providers/codex/runtime/codexAppServerTypes';
import { buildCodexLaunchSpec } from '@/providers/codex/runtime/CodexLaunchSpecBuilder';
import type { CodexLaunchSpec } from '@/providers/codex/runtime/codexLaunchTypes';
import { CodexRpcTransport } from '@/providers/codex/runtime/CodexRpcTransport';
import { getCodexProviderSettings } from '@/providers/codex/settings';
import { DEFAULT_CODEX_PRIMARY_MODEL } from '@/providers/codex/types/models';
import { getEnhancedPath, parseEnvironmentVariables } from '@/utils/env';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';
import { adaptSidecarProcessSession } from '../../services/process/adaptProcessSession';

export interface CodexSidecarRuntimeOptions {
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly processes: ProcessTransportFactory;
}

/** Sidecar-owned Codex app-server runtime with one persistent native thread. */
export class CodexSidecarRuntime {
  private process: CodexAppServerProcess | null = null;
  private transport: CodexRpcTransport | null = null;
  private threadId: string | null = null;
  private threadLoaded = false;
  private activeTurn: string | null = null;
  private interruptActiveTurn: ((error: Error) => void) | null = null;

  constructor(private readonly options: CodexSidecarRuntimeOptions) {}

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
      const transport = await this.ensureTransport(workspace);
      const threadId = await this.ensureThread(transport, workspace);
      await this.runTurn(transport, threadId, workspace, prompt, emit);
      emit({ type: 'done' });
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : String(error) });
      emit({ type: 'done' });
    } finally {
      this.activeTurn = null;
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

  private async runTurn(
    transport: CodexRpcTransport,
    threadId: string,
    workspace: string,
    prompt: string,
    emit: (chunk: StreamChunk) => void,
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

    transport.onNotification('item/agentMessage/delta', params => {
      const text = extractDelta(params);
      if (text) emit({ type: 'text', content: text });
    });
    transport.onNotification('turn/completed', params => {
      const completedTurnId = extractTurnId(params);
      if (!providerTurnId) {
        completedBeforeStart = true;
      } else if (!completedTurnId || completedTurnId === providerTurnId) {
        resolveCompletion();
      }
    });
    transport.onNotification('error', params => {
      rejectCompletion(new Error(extractErrorMessage(params)));
    });

    const attachment = extractSidecarAttachments(prompt);
    const input: UserInput[] = [
      ...attachment.paths.map(path => ({ type: 'localImage' as const, path })),
      { type: 'text', text: attachment.prompt, text_elements: [] },
    ];
    const result = await transport.request<TurnStartResult>('turn/start', {
      threadId,
      input,
      cwd: workspace,
    });
    providerTurnId = result.turn.id;
    if (completedBeforeStart) resolveCompletion();
    await completion;
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

  private async ensureThread(transport: CodexRpcTransport, workspace: string): Promise<string> {
    if (this.threadId && this.threadLoaded) return this.threadId;
    if (this.threadId) {
      const resumed = await transport.request<ThreadStartResult>('thread/resume', {
        threadId: this.threadId,
        model: DEFAULT_CODEX_PRIMARY_MODEL,
        cwd: workspace,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      });
      this.threadId = resumed.thread.id;
      this.threadLoaded = true;
      return this.threadId;
    }
    const result = await transport.request<ThreadStartResult>('thread/start', {
      model: DEFAULT_CODEX_PRIMARY_MODEL,
      cwd: workspace,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
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

function extractDelta(params: unknown): string | null {
  const value = params as { delta?: unknown } | null;
  return typeof value?.delta === 'string' ? value.delta : null;
}

function extractTurnId(params: unknown): string | null {
  const value = params as { turn?: { id?: unknown }; turnId?: unknown } | null;
  if (typeof value?.turn?.id === 'string') return value.turn.id;
  return typeof value?.turnId === 'string' ? value.turnId : null;
}

function extractErrorMessage(params: unknown): string {
  const value = params as { message?: unknown; error?: { message?: unknown } } | null;
  if (typeof value?.message === 'string') return value.message;
  if (typeof value?.error?.message === 'string') return value.error.message;
  return 'Codex app-server reported an error.';
}
