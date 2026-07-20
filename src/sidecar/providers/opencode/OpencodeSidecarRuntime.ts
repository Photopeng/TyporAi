import { readFile } from 'node:fs/promises';

import type { ProcessTransportFactory } from '@/core/ports';
import { buildTyporAiIdentityInstruction } from '@/core/prompt/mainAgent';
import type { StreamChunk } from '@/core/types';
import type { RpcEventEnvelope } from '@/protocol';
import type { AcpLoadSessionResponse,AcpNewSessionResponse } from '@/providers/acp';
import {
  AcpClientConnection,
  AcpJsonRpcTransport,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpSubprocess,
  extractAcpSessionModelState,
  extractAcpSessionModeState,
  extractAcpSessionThoughtLevelState,
} from '@/providers/acp';
import { decodeOpencodeModelId,resolveOpencodeBaseModelRawId } from '@/providers/opencode/models';
import { resolveAvailableOpencodeModeForPermissionMode } from '@/providers/opencode/modes';
import { buildOpencodeRuntimeEnv } from '@/providers/opencode/runtime/OpencodeRuntimeEnvironment';
import { getOpencodeProviderSettings } from '@/providers/opencode/settings';

import { EventReplayBuffer } from '../../server/EventReplayBuffer';
import { adaptSidecarProcessSession } from '../../services/process/adaptProcessSession';
import type { SidecarTurnOptions } from '../registry';
import { resolveSidecarCliPath } from '../resolveSidecarCliPath';

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
  private availableModes: Array<{ description?: string; id: string; name: string }> = [];
  private discoveredModels: Array<{ description?: string; label: string; rawId: string }> = [];
  private publish: ((chunk: StreamChunk) => void) | null = null;
  private thoughtLevelConfigId: string | null = null;
  private readonly normalizer = new AcpSessionUpdateNormalizer();

  constructor(private readonly options: OpencodeSidecarRuntimeOptions) {}

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
      const connection = await this.ensureConnection(workspace);
      const sessionId = await this.ensureSession(connection, workspace);
      await this.applySelectedModeAndEffort(connection, sessionId);
      const selectedModel = this.resolveModel(turnOptions.model);
      if (selectedModel) {
        await connection.setConfigOption({ configId: 'model', sessionId, type: 'select', value: selectedModel });
      }
      const input = await buildSidecarPromptBlocks(`${buildTyporAiIdentityInstruction()}\n\n${prompt}`);
      // Some ACP servers replay session history while loading or changing
      // config. Do not route those notifications into this turn: they were
      // the source of the previous-answer-on-next-question mismatch.
      this.normalizer.reset();
      this.publish = emit;
      await connection.prompt({ prompt: input, sessionId });
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
  getSessionState(): { readonly providerState: Record<string, unknown>; readonly sessionId: string | null } {
    return {
      providerState: { availableModes: this.availableModes, discoveredModels: this.discoveredModels },
      sessionId: this.sessionId,
    };
  }
  async resetSession(): Promise<void> {
    if (this.connection && this.sessionId && this.activeTurn) this.connection.cancel({ sessionId: this.sessionId });
    this.sessionId = null;
    this.sessionLoaded = false;
    this.normalizer.reset();
  }

  private async ensureConnection(workspace: string): Promise<AcpClientConnection> {
    if (this.connection && this.process?.isAlive()) return this.connection;
    await this.dispose();
    const settings = this.options.getSettings();
    const provider = getOpencodeProviderSettings(settings);
    const command = resolveSidecarCliPath(settings, provider) || 'opencode';
    const runtimeEnv = buildOpencodeRuntimeEnv(settings, command);
    this.process = new AcpSubprocess({
      args: ['acp', `--cwd=${workspace}`],
      command,
      cwd: workspace,
      env: runtimeEnv,
    }, this.options.processes, undefined, adaptSidecarProcessSession);
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
        this.captureSessionConfig(result);
        this.sessionId = requireSessionId(result);
        this.sessionLoaded = true;
        return this.sessionId;
      } catch {
        this.sessionId = null;
      }
    }
    const result = await connection.newSession({ cwd: workspace, mcpServers: [] });
    this.captureSessionConfig(result);
    this.sessionId = requireSessionId(result);
    this.sessionLoaded = true;
    return this.sessionId;
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

  private resolveModel(model: string | undefined): string | null {
    if (!model) return null;
    const settings = getOpencodeProviderSettings(this.options.getSettings());
    const decoded = decodeOpencodeModelId(model);
    return decoded ? resolveOpencodeBaseModelRawId(decoded, settings.discoveredModels) : null;
  }

  private captureSessionConfig(result: AcpLoadSessionResponse | AcpNewSessionResponse): void {
    const models = extractAcpSessionModelState(result).availableModels;
    const modes = extractAcpSessionModeState(result).availableModes;
    const thought = extractAcpSessionThoughtLevelState(result);
    this.discoveredModels = models.map(model => ({
      ...(model.description ? { description: model.description } : {}),
      label: model.name || model.id,
      rawId: model.id,
    }));
    this.availableModes = modes.map(mode => ({
      ...(mode.description ? { description: mode.description } : {}),
      id: mode.id,
      name: mode.name || mode.id,
    }));
    this.thoughtLevelConfigId = thought.configId;
  }

  private async applySelectedModeAndEffort(connection: AcpClientConnection, sessionId: string): Promise<void> {
    const settings = this.options.getSettings();
    const selectedMode = resolveAvailableOpencodeModeForPermissionMode(settings.permissionMode, this.availableModes);
    if (selectedMode) {
      await connection.setConfigOption({ configId: 'mode', sessionId, type: 'select', value: selectedMode });
    }
    const effort = typeof settings.effortLevel === 'string' ? settings.effortLevel : '';
    if (this.thoughtLevelConfigId && effort && effort !== 'default') {
      await connection.setConfigOption({ configId: this.thoughtLevelConfigId, sessionId, type: 'select', value: effort });
    }
  }
}

function requireSessionId(result: AcpLoadSessionResponse | AcpNewSessionResponse): string {
  const record = result as unknown as Record<string, unknown>;
  const nested = record.session && typeof record.session === 'object'
    ? record.session as Record<string, unknown>
    : null;
  const value = record.sessionId ?? record.sessionID ?? nested?.sessionId ?? nested?.sessionID;
  if (typeof value !== 'string' || !value.trim()) throw new Error('OpenCode ACP did not return a valid sessionId.');
  return value;
}

async function buildSidecarPromptBlocks(prompt: string): Promise<Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>> {
  const match = prompt.match(/\n*<typorai_attachments>\n([\s\S]*?)\n<\/typorai_attachments>\s*$/);
  if (!match) return [{ type: 'text', text: prompt }];
  const paths = match[1].split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [{ type: 'text', text: prompt.slice(0, match.index).trimEnd() }];
  for (const target of paths) {
    const data = await readFile(target);
    blocks.push({ type: 'image', data: data.toString('base64'), mimeType: mimeTypeFor(target) });
  }
  return blocks;
}

function mimeTypeFor(target: string): string {
  const extension = target.toLowerCase().split('.').pop();
  return extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'gif' ? 'image/gif' : 'image/webp';
}
