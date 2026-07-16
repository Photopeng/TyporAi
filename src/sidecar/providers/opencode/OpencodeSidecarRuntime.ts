import type { ProcessTransportFactory } from '@/core/ports';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import {
  AcpClientConnection,
  AcpJsonRpcTransport,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpSubprocess,
} from '@/providers/acp';
import { buildOpencodeRuntimeEnv } from '@/providers/opencode/runtime/OpencodeRuntimeEnvironment';
import { getOpencodeProviderSettings } from '@/providers/opencode/settings';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';

export interface OpencodeSidecarRuntimeOptions {
  readonly getSettings: () => Record<string, unknown>;
  readonly getWorkspacePath: () => string | null;
  readonly processes: ProcessTransportFactory;
  readonly requestApproval: (toolName: string, input: Record<string, unknown>, description: string) => Promise<'allow' | 'deny'>;
}

/** Sidecar-owned OpenCode ACP runtime with an ACP session per renderer runtime. */
export class OpencodeSidecarRuntime {
  private connection: AcpClientConnection | null = null;
  private process: AcpSubprocess | null = null;
  private sessionId: string | null = null;
  private sessionLoaded = false;
  private transport: AcpJsonRpcTransport | null = null;
  private activeTurn: string | null = null;
  private publish: ((chunk: StreamChunk) => void) | null = null;
  private readonly normalizer = new AcpSessionUpdateNormalizer();

  constructor(private readonly options: OpencodeSidecarRuntimeOptions) {}

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
    this.publish = emit;
    this.normalizer.reset();
    try {
      const connection = await this.ensureConnection(workspace);
      const sessionId = await this.ensureSession(connection, workspace);
      await connection.prompt({ prompt: [{ text: prompt, type: 'text' }], sessionId });
      emit({ type: 'done' });
    } catch (error) {
      emit({ type: 'error', content: this.formatError(error) });
      emit({ type: 'done' });
    } finally {
      this.publish = null;
      this.activeTurn = null;
    }
  }

  cancelTurn(turnId: string): void {
    if (this.activeTurn !== turnId || !this.connection || !this.sessionId) return;
    this.connection.cancel({ sessionId: this.sessionId });
  }

  async dispose(): Promise<void> {
    this.connection?.dispose();
    this.connection = null;
    this.transport?.dispose();
    this.transport = null;
    await this.process?.shutdown().catch(() => undefined);
    this.process = null;
    this.sessionId = null;
    this.sessionLoaded = false;
    this.activeTurn = null;
    this.publish = null;
  }

  restoreSession(sessionId: string | null): void { this.sessionId = sessionId; this.sessionLoaded = false; }
  getSessionState(): { readonly sessionId: string | null } { return { sessionId: this.sessionId }; }

  private async ensureConnection(workspace: string): Promise<AcpClientConnection> {
    if (this.connection && this.process?.isAlive()) return this.connection;
    await this.dispose();
    const settings = this.options.getSettings();
    const provider = getOpencodeProviderSettings(settings);
    const command = provider.cliPath || 'opencode';
    const runtimeEnv = buildOpencodeRuntimeEnv(settings, command);
    this.process = new AcpSubprocess({
      args: ['acp', `--cwd=${workspace}`],
      command,
      cwd: workspace,
      env: runtimeEnv,
    }, this.options.processes);
    await this.process.start();
    this.transport = new AcpJsonRpcTransport({
      input: this.process.stdout,
      onClose: listener => this.process!.onClose(listener),
      output: this.process.stdin,
    });
    this.connection = new AcpClientConnection({
      clientInfo: { name: 'typorai-sidecar', version: '1.0.0' },
      delegate: {
        onSessionNotification: notification => this.handleSessionNotification(notification),
        requestPermission: request => this.handlePermissionRequest(request),
      },
      transport: this.transport,
    });
    this.transport.start();
    await this.connection.initialize();
    return this.connection;
  }

  private async ensureSession(connection: AcpClientConnection, workspace: string): Promise<string> {
    if (this.sessionId && this.sessionLoaded) return this.sessionId;
    if (this.sessionId) {
      try {
        const result = await connection.loadSession({ cwd: workspace, mcpServers: [], sessionId: this.sessionId });
        this.sessionId = result.sessionId;
        this.sessionLoaded = true;
        return this.sessionId;
      } catch {
        this.sessionId = null;
      }
    }
    const result = await connection.newSession({ cwd: workspace, mcpServers: [] });
    this.sessionId = result.sessionId;
    this.sessionLoaded = true;
    return result.sessionId;
  }

  private async handleSessionNotification(notification: AcpSessionNotification): Promise<void> {
    if (!this.publish || notification.sessionId !== this.sessionId) return;
    const normalized = this.normalizer.normalize(notification.update);
    if (normalized.type === 'message_chunk' || normalized.type === 'tool_call' || normalized.type === 'tool_call_update') {
      for (const chunk of normalized.streamChunks) this.publish(chunk);
    }
  }

  private async handlePermissionRequest(request: AcpRequestPermissionRequest): Promise<AcpRequestPermissionResponse> {
    const input = request.toolCall.rawInput && typeof request.toolCall.rawInput === 'object' && !Array.isArray(request.toolCall.rawInput)
      ? request.toolCall.rawInput as Record<string, unknown>
      : {};
    const toolName = request.toolCall.title?.trim() || request.toolCall.kind?.trim() || 'OpenCode tool';
    const decision = await this.options.requestApproval(toolName, input, `OpenCode requests permission to use ${toolName}.`);
    const option = request.options.find(candidate => decision === 'allow'
      ? candidate.kind === 'allow_once' || candidate.kind === 'allow_always'
      : candidate.kind === 'reject_once' || candidate.kind === 'reject_always');
    return option ? { outcome: { optionId: option.optionId, outcome: 'selected' } } : { outcome: { outcome: 'cancelled' } };
  }

  private formatError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const stderr = this.process?.getStderrSnapshot();
    return stderr ? `${message}\n\n${stderr}` : message;
  }
}
