import { randomUUID } from 'node:crypto';
import { watch as watchFile } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { type WebSocket,WebSocketServer } from 'ws';

import type { AppTabManagerState } from '@/core/providers/types';
import type { Conversation, StreamChunk } from '@/core/types';
import { type JsonRpcRequest,parseJsonRpcMessage,type RpcEventEnvelope } from '@/protocol';

import { SingleInstanceLock } from '../lifecycle/SingleInstanceLock';
import { ClaudeSidecarRuntime } from '../providers/claude/ClaudeSidecarRuntime';
import { CodexSidecarRuntime } from '../providers/codex/CodexSidecarRuntime';
import { FakeChatService } from '../providers/fake/FakeChatService';
import { OpencodeSidecarRuntime } from '../providers/opencode/OpencodeSidecarRuntime';
import { SidecarProviderRegistry,type SidecarProviderRuntime } from '../providers/registry';
import { RuntimeManager } from '../providers/RuntimeManager';
import { TyporaApiRuntime } from '../providers/typora/TyporaApiRuntime';
import { ApprovalBroker, type PendingInteraction } from '../services/approval/ApprovalBroker';
import { BlobNotFoundError,BlobPayloadTooLargeError,BlobStore } from '../services/blobs/BlobStore';
import { FileConflictError,PathOutsideWorkspaceError,WorkspaceFileService,WorkspaceNotGrantedError } from '../services/fs/WorkspaceFileService';
import { ManagedProcessRegistry } from '../services/process/ManagedProcessRegistry';
import { SidecarProcessTransport } from '../services/process/SidecarProcessTransport';
import { type ProbedProviderId,ProviderProbeService } from '../services/providers/ProviderProbeService';
import { PersistentSessionRepository } from '../services/sessions/PersistentSessionRepository';
import { PersistentTabLayoutStore } from '../services/sessions/PersistentTabLayoutStore';
import { SessionNotFoundError,SessionRevisionConflictError } from '../services/sessions/SessionRepository';
import { PersistentSettingsStore } from '../services/settings/PersistentSettingsStore';
import { SettingsRevisionConflictError } from '../services/settings/VersionedSettingsStore';
import { PersistentWorkspaceGrantStore } from '../services/workspace/PersistentWorkspaceGrantStore';
import { type ConnectionDescriptor,writeConnectionDescriptor } from './ConnectionDescriptor';
import { RpcRouter } from './RpcRouter';

export interface SidecarServerOptions {
  readonly dataDirectory: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly sidecarVersion: string;
  readonly token: string;
}

interface SidecarChatProviderRuntime extends SidecarProviderRuntime {
  cancelTurn(turnId: string): void;
  restoreSession?(sessionId: string | null): void | Promise<void>;
  getSessionState?(): { readonly providerState?: Record<string, unknown>; readonly sessionId: string | null };
  startTurn(connectionId: string, turnId: string, prompt: string, publish: (event: RpcEventEnvelope<StreamChunk>) => void): Promise<void>;
}

export class SidecarServer {
  private readonly http = createServer((request, response) => this.handleHealth(request, response));
  private readonly lock: SingleInstanceLock;
  private readonly router: RpcRouter;
  private readonly providers = new SidecarProviderRegistry();
  private readonly runtimes: RuntimeManager;
  private readonly activeTurns = new Map<string, { providerId: string; runtimeId: string }>();
  private readonly connections = new Map<string, WebSocket>();
  private readonly approvals = new ApprovalBroker(interaction => this.publishInteraction(interaction));
  private readonly watches = new Map<string, { connection: WebSocket; close(): void }>();
  private settings: PersistentSettingsStore<Record<string, unknown>> | null = null;
  private sessions: PersistentSessionRepository | null = null;
  private tabLayout: PersistentTabLayoutStore | null = null;
  private workspace: PersistentWorkspaceGrantStore | null = null;
  private files: WorkspaceFileService | null = null;
  private readonly processes = new ManagedProcessRegistry();
  private readonly providerProbe = new ProviderProbeService();
  readonly processTransport = new SidecarProcessTransport(this.processes);
  private blobs: BlobStore | null = null;
  private readonly webSocket = new WebSocketServer({ maxPayload: 1_048_576, noServer: true });

  constructor(private readonly options: SidecarServerOptions) {
    this.lock = new SingleInstanceLock(options.lockPath);
    this.router = new RpcRouter({ sidecarVersion: options.sidecarVersion, token: options.token });
    this.providers.register('fake', () => new FakeChatService());
    this.providers.register('claude', () => new ClaudeSidecarRuntime({
      getSettings: () => this.settings?.getSnapshot().value ?? {},
      getWorkspacePath: () => this.workspace?.current ?? null,
      processes: this.processTransport,
      requestApproval: async (toolName, input, description) => {
        const result = await this.approvals.request({ id: crypto.randomUUID(), kind: 'approval', payload: { description, input, toolName } });
        return (result as { approved?: unknown })?.approved === true ? 'allow' : 'deny';
      },
    }));
    this.providers.register('codex', () => new CodexSidecarRuntime({
      getSettings: () => this.settings?.getSnapshot().value ?? {},
      getWorkspacePath: () => this.workspace?.current ?? null,
      processes: this.processTransport,
    }));
    this.providers.register('opencode', () => new OpencodeSidecarRuntime({
      getSettings: () => this.settings?.getSnapshot().value ?? {},
      getWorkspacePath: () => this.workspace?.current ?? null,
      processes: this.processTransport,
      requestApproval: async (toolName, input, description) => {
        const result = await this.approvals.request({ id: crypto.randomUUID(), kind: 'approval', payload: { description, input, toolName } });
        return (result as { approved?: unknown })?.approved === true ? 'allow' : 'deny';
      },
    }));
    this.providers.register('typora', () => new TyporaApiRuntime({
      getSettings: () => this.settings?.getSnapshot().value ?? {},
      getWorkspacePath: () => this.workspace?.current ?? null,
      requestApproval: async (toolName, input, description) => {
        const result = await this.approvals.request({ id: crypto.randomUUID(), kind: 'approval', payload: { description, input, toolName } });
        return (result as { approved?: unknown })?.approved === true ? 'allow' : 'deny';
      },
    }));
    this.runtimes = new RuntimeManager(this.providers);
    this.http.on('upgrade', (request, socket, head) => {
      if (request.url !== '/rpc') return socket.destroy();
      this.webSocket.handleUpgrade(request, socket, head, connection => this.handleConnection(connection));
    });
  }

  async start(): Promise<ConnectionDescriptor> {
    if (!await this.lock.acquire()) throw new Error('A Sidecar instance is already running.');
    try {
      this.settings = await PersistentSettingsStore.open(path.join(this.options.dataDirectory, 'settings.json'), {});
      this.sessions = await PersistentSessionRepository.open(path.join(this.options.dataDirectory, 'sessions.json'));
      this.tabLayout = await PersistentTabLayoutStore.open(path.join(this.options.dataDirectory, 'tab-layout.json'));
      this.workspace = await PersistentWorkspaceGrantStore.open(path.join(this.options.dataDirectory, 'workspace-grant.json'));
      this.files = new WorkspaceFileService(() => this.workspace?.current ?? null);
      this.blobs = new BlobStore(path.join(this.options.dataDirectory, 'blobs'));
      await new Promise<void>((resolve, reject) => {
        this.http.once('error', reject);
        this.http.listen({ host: '127.0.0.1', port: 0 }, () => {
          this.http.off('error', reject);
          resolve();
        });
      });
      const address = this.http.address() as AddressInfo;
      const descriptor: ConnectionDescriptor = {
        host: '127.0.0.1', port: address.port, token: this.options.token, pid: process.pid,
        sidecarVersion: this.options.sidecarVersion, protocolMin: 1, protocolMax: 1, startedAt: Date.now(),
      };
      await writeConnectionDescriptor(this.options.descriptorPath, descriptor);
      return descriptor;
    } catch (error) {
      if (this.http.listening) await new Promise<void>(resolve => this.http.close(() => resolve()));
      await this.lock.release();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.processes.terminateAll('SIGTERM');
    await this.runtimes.disposeAll();
    this.approvals.rejectAll('sidecar-shutdown');
    await this.blobs?.cleanupAll();
    for (const watch of this.watches.values()) watch.close();
    this.watches.clear();
    await new Promise<void>(resolve => this.http.close(() => resolve()));
    await this.lock.release();
  }

  private handleHealth(request: IncomingMessage, response: ServerResponse): void {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(this.router.health()));
  }

  private handleConnection(connection: WebSocket): void {
    let initialized = false;
    connection.once('message', raw => {
      const message = parseJsonRpcMessage(raw.toString());
      if (!message || !('id' in message) || message.method !== 'system.initialize') return connection.close(1008, 'Initialize required');
      const response = this.router.route(message as JsonRpcRequest);
      connection.send(JSON.stringify(response));
      if ('error' in response) return connection.close(1008, 'Authentication failed');
      const connectionId = (response.result as { connectionId: string }).connectionId;
      this.connections.set(connectionId, connection);
      initialized = true;
      connection.on('message', next => {
        const request = parseJsonRpcMessage(next.toString());
        if (!request || !('id' in request)) return connection.close(1008, 'Invalid request');
        if (request.method === 'settings.getSnapshot') {
          if (!this.settings) return connection.close(1011, 'Settings unavailable');
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.settings.getSnapshot() }));
          return;
        }
        if (request.method === 'system.getStatus') {
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.systemStatus() }));
          return;
        }
        if (request.method === 'system.getCapabilities') {
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { files: true, sessions: true, settings: true, watches: true, providers: this.providers.list() } }));
          return;
        }
        if (request.method === 'system.getDiagnostics') {
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { activeTurns: this.activeTurns.size, managedProcesses: this.processes.size, providerRuntimes: this.providers.list(), watches: this.watches.size } }));
          return;
        }
        if (request.method === 'approval.resolve' || request.method === 'userInput.resolve' || request.method === 'planApproval.resolve') {
          const params = request.params as { id?: unknown; result?: unknown } | undefined;
          if (typeof params?.id !== 'string' || !this.approvals.resolve(params.id, params.result)) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_SUPPORTED', message: 'Interaction not found.' } }));
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }));
          return;
        }
        if (request.method === 'session.list') {
          if (!this.sessions) return connection.close(1011, 'Sessions unavailable');
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.sessions.store.list() }));
          return;
        }
        if (request.method === 'session.get') {
          const id = (request.params as { id?: unknown } | undefined)?.id;
          if (!this.sessions || typeof id !== 'string' || !id) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } }));
          try { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.sessions.store.get(id) })); }
          catch (error) { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error instanceof SessionNotFoundError ? 'SESSION_NOT_FOUND' : 'INTERNAL_ERROR', message: 'Session lookup rejected.' } })); }
          return;
        }
        if (request.method === 'session.getTabLayout') {
          if (!this.tabLayout) return connection.close(1011, 'Tab layout unavailable');
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.tabLayout.get() }));
          return;
        }
        if (request.method === 'session.setTabLayout') {
          const params = request.params as { expectedRevision?: unknown; idempotencyKey?: unknown; value?: unknown } | undefined;
          if (!this.tabLayout || !params || !Number.isInteger(params.expectedRevision) || typeof params.idempotencyKey !== 'string' || !params.value || typeof params.value !== 'object') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid tab layout.' } }));
          void this.tabLayout.set(params.value as AppTabManagerState, params.expectedRevision as number, params.idempotencyKey).then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(error => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error instanceof SessionRevisionConflictError ? 'SESSION_REVISION_CONFLICT' : 'INTERNAL_ERROR', message: 'Tab layout update rejected.' } })));
          return;
        }
        if (request.method === 'workspace.getCurrent') {
          if (!this.workspace) return connection.close(1011, 'Workspace unavailable');
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { root: this.workspace.current } }));
          return;
        }
        if (request.method === 'workspace.grant') {
          const root = (request.params as { root?: unknown } | undefined)?.root;
          if (!this.workspace || typeof root !== 'string' || !root) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid workspace grant.' } }));
          void this.workspace.grantAndPersist(root).then(value => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { root: value } }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Workspace grant persistence failed.' } })));
          return;
        }
        if (request.method === 'workspace.revoke') {
          if (!this.workspace) return connection.close(1011, 'Workspace unavailable');
          void this.workspace.revokeAndPersist().then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { root: null } }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Workspace revoke persistence failed.' } })));
          return;
        }
        if (request.method.startsWith('fs.')) {
          void this.handleFileRequest(request).then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(error => {
            const code = error instanceof WorkspaceNotGrantedError ? 'WORKSPACE_NOT_GRANTED'
              : error instanceof PathOutsideWorkspaceError ? 'PATH_OUTSIDE_WORKSPACE'
              : error instanceof FileConflictError ? 'FILE_CONFLICT' : 'INTERNAL_ERROR';
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: 'File operation rejected.' } }));
          });
          return;
        }
        if (request.method.startsWith('blob.')) {
          void this.handleBlobRequest(request).then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(error => {
            const code = error instanceof BlobNotFoundError ? 'METHOD_NOT_SUPPORTED' : error instanceof BlobPayloadTooLargeError ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR';
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: 'Blob operation rejected.' } }));
          });
          return;
        }
        if (request.method === 'watch.subscribe') {
          const target = (request.params as { path?: unknown } | undefined)?.path;
          if (typeof target !== 'string' || !target) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid watch path.' } }));
          void this.createWatch(connectionId, connection, target).then(watchId => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { watchId } }))).catch(error => {
            const code = error instanceof WorkspaceNotGrantedError ? 'WORKSPACE_NOT_GRANTED' : error instanceof PathOutsideWorkspaceError ? 'PATH_OUTSIDE_WORKSPACE' : 'INTERNAL_ERROR';
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: 'Watch subscription rejected.' } }));
          });
          return;
        }
        if (request.method === 'watch.unsubscribe') {
          const watchId = (request.params as { watchId?: unknown } | undefined)?.watchId;
          if (typeof watchId !== 'string') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_SUPPORTED', message: 'Watch not found.' } }));
          const watch = this.watches.get(watchId);
          if (!watch || watch.connection !== connection) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_SUPPORTED', message: 'Watch not found.' } }));
          watch.close();
          this.watches.delete(watchId);
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }));
          return;
        }
        if (request.method === 'session.create') {
          const params = request.params as { conversation?: unknown; idempotencyKey?: unknown } | undefined;
          if (!this.sessions || !params?.conversation || typeof params.conversation !== 'object' || typeof params.idempotencyKey !== 'string') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid session create.' } }));
          try {
            const result = this.sessions.store.create(params.conversation as Conversation, params.idempotencyKey);
            void this.sessions.persist().then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Session persistence failed.' } })));
          } catch (error) { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Session create failed.' } })); }
          return;
        }
        if (request.method === 'session.applyPatch') {
          const params = request.params as { expectedRevision?: unknown; id?: unknown; idempotencyKey?: unknown; patch?: unknown } | undefined;
          if (!this.sessions || typeof params?.id !== 'string' || !Number.isInteger(params.expectedRevision) || typeof params.idempotencyKey !== 'string' || !params.patch || typeof params.patch !== 'object' || Array.isArray(params.patch)) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid session patch.' } }));
          try {
            const result = this.sessions.store.applyPatch(params.id, params.patch as Partial<Conversation>, params.expectedRevision as number, params.idempotencyKey);
            void this.sessions.persist().then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Session persistence failed.' } })));
          } catch (error) { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error instanceof SessionRevisionConflictError ? 'SESSION_REVISION_CONFLICT' : 'INTERNAL_ERROR', message: 'Session update rejected.' } })); }
          return;
        }
        if (request.method === 'session.fork') {
          const params = request.params as { conversation?: unknown; expectedSourceRevision?: unknown; idempotencyKey?: unknown; sourceId?: unknown } | undefined;
          if (!this.sessions || typeof params?.sourceId !== 'string' || !Number.isInteger(params.expectedSourceRevision) || typeof params.idempotencyKey !== 'string' || !params.conversation || typeof params.conversation !== 'object') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid session fork.' } }));
          try {
            const result = this.sessions.store.fork(params.sourceId, params.conversation as Conversation, params.expectedSourceRevision as number, params.idempotencyKey);
            void this.sessions.persist().then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Session persistence failed.' } })));
          } catch (error) { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error instanceof SessionNotFoundError ? 'SESSION_NOT_FOUND' : error instanceof SessionRevisionConflictError ? 'SESSION_REVISION_CONFLICT' : 'INTERNAL_ERROR', message: 'Session fork rejected.' } })); }
          return;
        }
        if (request.method === 'session.delete') {
          const params = request.params as { expectedRevision?: unknown; id?: unknown; idempotencyKey?: unknown } | undefined;
          if (!this.sessions || typeof params?.id !== 'string' || !Number.isInteger(params.expectedRevision) || typeof params.idempotencyKey !== 'string') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid session delete.' } }));
          try {
            this.sessions.store.delete(params.id, params.expectedRevision as number, params.idempotencyKey);
            void this.sessions.persist().then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }))).catch(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Session persistence failed.' } })));
          } catch (error) { connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error instanceof SessionNotFoundError ? 'SESSION_NOT_FOUND' : error instanceof SessionRevisionConflictError ? 'SESSION_REVISION_CONFLICT' : 'INTERNAL_ERROR', message: 'Session delete rejected.' } })); }
          return;
        }
        if (request.method === 'settings.applyPatch') {
          const params = request.params as { expectedRevision?: unknown; idempotencyKey?: unknown; patch?: unknown } | undefined;
          if (!params || !Number.isInteger(params.expectedRevision) || typeof params.idempotencyKey !== 'string' || !params.patch || typeof params.patch !== 'object' || Array.isArray(params.patch)) {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid settings patch.' } }));
            return;
          }
          if (!this.settings) return connection.close(1011, 'Settings unavailable');
          void this.settings.applyPatch(params.patch as Record<string, unknown>, params.expectedRevision as number, params.idempotencyKey)
            .then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })))
            .catch(error => {
              const code = error instanceof SettingsRevisionConflictError ? 'SESSION_REVISION_CONFLICT' : 'INTERNAL_ERROR';
              connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: 'Settings update rejected.' } }));
            });
          return;
        }
        if (request.method === 'chat.startTurn') {
          const params = request.params as { blobIds?: unknown; conversationId?: unknown; prompt?: unknown; turnId?: unknown; providerId?: unknown; runtimeId?: unknown } | undefined;
          if (typeof params?.prompt !== 'string' || typeof params.turnId !== 'string') {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid chat turn.' } }));
            return;
          }
          const providerId = typeof params.providerId === 'string' ? params.providerId : 'fake';
          const runtimeId = typeof params.runtimeId === 'string' && params.runtimeId ? params.runtimeId : connectionId;
          const conversationId = typeof params.conversationId === 'string' && params.conversationId ? params.conversationId : null;
          const turnId = params.turnId;
          const blobIds = Array.isArray(params.blobIds) && params.blobIds.every(value => typeof value === 'string') ? params.blobIds : [];
          let chatRuntime: SidecarChatProviderRuntime;
          try { chatRuntime = this.runtimes.getOrCreate<SidecarChatProviderRuntime>(providerId, runtimeId); } catch {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Provider runtime is unavailable.' } }));
            return;
          }
          this.activeTurns.set(turnId, { providerId, runtimeId });
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { streamId: turnId } }));
          void chatRuntime.startTurn(connectionId, turnId, params.prompt, event => {
            if (connection.readyState === 1) connection.send(JSON.stringify({ jsonrpc: '2.0', method: 'stream.event', params: event }));
          }).finally(() => {
            this.activeTurns.delete(turnId);
            if (conversationId) void this.persistRuntimeSession(conversationId, chatRuntime).catch(() => undefined);
            void Promise.all(blobIds.map(blobId => this.blobs?.abort(blobId)));
          });
          return;
        }
        if (request.method === 'chat.createRuntime') {
          const params = request.params as { conversationId?: unknown; providerId?: unknown; runtimeId?: unknown } | undefined;
          if (typeof params?.providerId !== 'string' || typeof params.runtimeId !== 'string' || !params.runtimeId) {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid runtime request.' } }));
            return;
          }
          const conversationId = typeof params.conversationId === 'string' && params.conversationId ? params.conversationId : null;
          void this.createChatRuntime(params.providerId, params.runtimeId, conversationId).then(() => {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { conversationId, providerId: params.providerId, runtimeId: params.runtimeId } }));
          }).catch(() => {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Provider runtime is unavailable.' } }));
          });
          return;
        }
        if (request.method === 'chat.disposeRuntime') {
          const params = request.params as { providerId?: unknown; runtimeId?: unknown } | undefined;
          if (typeof params?.providerId !== 'string' || typeof params.runtimeId !== 'string' || !params.runtimeId) {
            connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Invalid runtime dispose.' } }));
            return;
          }
          void this.runtimes.dispose(params.providerId, params.runtimeId).then(() => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })));
          return;
        }
        if (request.method === 'chat.cancelTurn') {
          const turnId = (request.params as { turnId?: unknown } | undefined)?.turnId;
          if (typeof turnId !== 'string' || !turnId) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'TURN_NOT_FOUND', message: 'Invalid turn id.' } }));
          const active = this.activeTurns.get(turnId);
          if (!active) return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'TURN_NOT_FOUND', message: 'Turn not found.' } }));
          this.runtimes.getOrCreate<SidecarChatProviderRuntime>(active.providerId, active.runtimeId).cancelTurn(turnId);
          connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }));
          return;
        }
        if (request.method === 'provider.list') {
          void this.providerProbe.list().then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: result.map(provider => ({ ...provider, status: provider.available ? 'available' : 'unavailable' })) })));
          return;
        }
        if (request.method === 'provider.probeCli') {
          const providerId = (request.params as { providerId?: unknown } | undefined)?.providerId;
          if (providerId !== 'claude' && providerId !== 'codex' && providerId !== 'opencode' && providerId !== 'typora') return connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_SUPPORTED', message: 'Unknown provider.' } }));
          void this.providerProbe.probe(providerId as ProbedProviderId).then(result => connection.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })));
          return;
        }
        connection.send(JSON.stringify(this.router.routeAuthenticated(request as JsonRpcRequest)));
      });
      connection.once('close', () => this.disposeConnection(connectionId, connection));
    });
    connection.once('error', () => undefined);
    setTimeout(() => { if (!initialized) connection.close(1008, 'Initialize timeout'); }, 3_000).unref();
  }

  private async createChatRuntime(providerId: string, runtimeId: string, conversationId: string | null): Promise<SidecarChatProviderRuntime> {
    const runtime = this.runtimes.getOrCreate<SidecarChatProviderRuntime>(providerId, runtimeId);
    if (!conversationId) return runtime;
    const conversation = await this.ensureChatConversation(conversationId, providerId);
    await runtime.restoreSession?.(conversation.sessionId);
    return runtime;
  }

  private async ensureChatConversation(conversationId: string, providerId: string): Promise<Conversation> {
    if (!this.sessions) throw new Error('Sessions unavailable');
    try {
      const existing = this.sessions.store.get(conversationId).conversation;
      if (existing.providerId !== providerId) throw new Error('Conversation provider mismatch');
      return existing;
    } catch (error) {
      if (!(error instanceof SessionNotFoundError)) throw error;
    }
    const now = Date.now();
    const created = this.sessions.store.create({ createdAt: now, id: conversationId, messages: [], providerId: providerId as Conversation['providerId'], sessionId: null, title: 'New conversation', updatedAt: now }, `chat-runtime:${conversationId}`);
    await this.sessions.persist();
    return created.conversation;
  }

  private async persistRuntimeSession(conversationId: string, runtime: SidecarChatProviderRuntime): Promise<void> {
    if (!this.sessions || !runtime.getSessionState) return;
    const state = runtime.getSessionState();
    const current = this.sessions.store.get(conversationId);
    if (current.conversation.sessionId === state.sessionId && JSON.stringify(current.conversation.providerState) === JSON.stringify(state.providerState)) return;
    this.sessions.store.applyPatch(conversationId, { providerState: state.providerState, sessionId: state.sessionId, updatedAt: Date.now() }, current.revision, `native-session:${conversationId}:${state.sessionId ?? 'none'}`);
    await this.sessions.persist();
  }

  private async createWatch(connectionId: string, connection: WebSocket, inputPath: string): Promise<string> {
    if (!this.files) throw new Error('File service unavailable.');
    const target = await this.files.resolveWatchTarget(inputPath);
    const watchId = randomUUID();
    let sequence = 0;
    const watcher = watchFile(target, { persistent: false }, eventType => {
      if (connection.readyState !== 1) return;
      const type = eventType === 'change' ? 'modified' : 'renamed';
      connection.send(JSON.stringify({ jsonrpc: '2.0', method: 'stream.event', params: { connectionId, streamId: watchId, seq: ++sequence, event: 'watch.changed', payload: { path: target, type, watchId }, timestamp: Date.now() } }));
    });
    this.watches.set(watchId, { connection, close: () => watcher.close() });
    return watchId;
  }

  private disposeConnection(connectionId: string, connection: WebSocket): void {
    this.connections.delete(connectionId);
    this.approvals.rejectAll();
    for (const [watchId, watch] of this.watches) {
      if (watch.connection !== connection) continue;
      watch.close();
      this.watches.delete(watchId);
    }
  }

  private publishInteraction(interaction: PendingInteraction): void {
    const method = interaction.kind === 'approval' ? 'approval.request' : interaction.kind === 'planApproval' ? 'planApproval.request' : 'userInput.request';
    for (const connection of this.connections.values()) {
      if (connection.readyState === 1) connection.send(JSON.stringify({ jsonrpc: '2.0', method, params: interaction }));
    }
  }

  private async handleFileRequest(request: JsonRpcRequest): Promise<unknown> {
    if (!this.files) throw new Error('File service unavailable.');
    const params = request.params as Record<string, unknown> | undefined;
    const readPath = (): string => {
      const value = params?.path;
      if (typeof value !== 'string' || !value) throw new Error('Invalid file path.');
      return value;
    };
    const writeParams = (): { path: string; data: string; expectedHash?: string } => {
      const target = readPath();
      if (typeof params?.data !== 'string' || typeof params?.idempotencyKey !== 'string') throw new Error('Invalid file write.');
      return { path: target, data: params.data, expectedHash: typeof params.expectedHash === 'string' ? params.expectedHash : undefined };
    };
    switch (request.method) {
      case 'fs.readText': return this.files.readText(readPath());
      case 'fs.writeText': { const value = writeParams(); return this.files.writeText(value.path, value.data, value.expectedHash); }
      case 'fs.writeBinary': { const value = writeParams(); return this.files.writeBinary(value.path, value.data, value.expectedHash); }
      case 'fs.remove': if (typeof params?.idempotencyKey !== 'string') throw new Error('Invalid file remove.'); return this.files.remove(readPath());
      case 'fs.list': return this.files.list(readPath());
      case 'fs.stat': return this.files.stat(readPath());
      case 'fs.rename': {
        if (typeof params?.from !== 'string' || typeof params?.to !== 'string' || typeof params?.idempotencyKey !== 'string') throw new Error('Invalid file rename.');
        return this.files.rename(params.from, params.to);
      }
      case 'fs.createDirectory': if (typeof params?.idempotencyKey !== 'string') throw new Error('Invalid directory create.'); return this.files.createDirectory(readPath());
      default: throw new Error('Unsupported file operation.');
    }
  }

  private async handleBlobRequest(request: JsonRpcRequest): Promise<unknown> {
    if (!this.blobs) throw new Error('Blob service unavailable.');
    const params = request.params as Record<string, unknown> | undefined;
    const blobId = typeof params?.blobId === 'string' ? params.blobId : null;
    switch (request.method) {
      case 'blob.begin':
        if (!Number.isInteger(params?.bytes) || typeof params?.mimeType !== 'string') throw new Error('Invalid blob begin.');
        return this.blobs.begin(params.bytes as number, params.mimeType);
      case 'blob.chunk':
        if (!blobId || typeof params?.data !== 'string') throw new Error('Invalid blob chunk.');
        this.blobs.chunk(blobId, params.data);
        return {};
      case 'blob.commit': if (!blobId) throw new Error('Invalid blob commit.'); return this.blobs.commit(blobId);
      case 'blob.abort': if (!blobId) throw new Error('Invalid blob abort.'); await this.blobs.abort(blobId); return {};
      default: throw new Error('Unsupported blob operation.');
    }
  }

  private systemStatus(): { readonly providerRuntimes: readonly string[]; readonly status: 'ok'; readonly workspaceGranted: boolean } {
    return { providerRuntimes: this.providers.list(), status: 'ok', workspaceGranted: Boolean(this.workspace?.current) };
  }
}
