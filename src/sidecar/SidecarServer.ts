import { type ChildProcess,spawn } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, watch as watchFile } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { WebSocket, WebSocketServer } from 'ws';

import { type RpcEvent, type RpcRequest, type RpcResponse,SIDECAR_PROTOCOL_VERSION } from './protocol';

interface SidecarOptions {
  readonly allowedRoots: readonly string[];
  readonly dataDirectory: string;
  readonly host?: string;
  readonly port: number;
  readonly token: string;
  readonly version: string;
}

interface ProcessStartParams {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly envDelta?: Readonly<Record<string, string | null>>;
  readonly executable: string;
}

interface ManagedProcess {
  readonly child: ChildProcess;
  readonly socket: WebSocket;
}

export class SidecarServer {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly watches = new Map<string, { close(): void }>();
  private readonly allowedRoots: readonly string[];
  private readonly server = createServer((request, response) => this.handleHttp(request, response));
  private readonly sockets = new Set<WebSocket>();
  private readonly webSocketServer = new WebSocketServer({ noServer: true });
  private rendererConnection: WebSocket | null = null;
  private rendererReadyAtMs: number | null = null;
  private rendererVersion: string | null = null;

  constructor(private readonly options: SidecarOptions) {
    this.allowedRoots = [...new Set([...options.allowedRoots, options.dataDirectory])]
      .map(value => path.resolve(value));
    this.server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/rpc') {
        socket.destroy();
        return;
      }
      this.webSocketServer.handleUpgrade(request, socket, head, webSocket => {
        this.webSocketServer.emit('connection', webSocket, request);
      });
    });
    this.webSocketServer.on('connection', socket => this.handleSocket(socket));
  }

  async listen(): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host ?? '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  get port(): number {
    const address = this.server.address();
    return typeof address === 'object' && address ? (address as AddressInfo).port : this.options.port;
  }

  async close(): Promise<void> {
    for (const watcher of this.watches.values()) watcher.close();
    this.watches.clear();
    for (const [id] of this.processes) await this.stopProcess(id, 'SIGKILL');
    for (const socket of this.sockets) socket.close();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }

  private handleHttp(request: IncomingMessage, response: ServerResponse): void {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ protocolVersion: SIDECAR_PROTOCOL_VERSION, status: 'ok', version: this.options.version }));
  }

  private handleSocket(socket: WebSocket): void {
    let authenticated = false;
    this.sockets.add(socket);
    socket.on('close', () => this.disposeSocket(socket));
    socket.on('message', raw => {
      void this.handleMessage(socket, raw.toString(), () => authenticated, () => { authenticated = true; });
    });
  }

  private async handleMessage(
    socket: WebSocket,
    raw: string,
    isAuthenticated: () => boolean,
    authenticate: () => void,
  ): Promise<void> {
    let request: RpcRequest | null = null;
    try {
      request = JSON.parse(raw) as RpcRequest;
      if (!request.id || !request.method) throw new Error('Invalid JSON-RPC request');
      if (!isAuthenticated()) {
        if (request.method !== 'system.handshake' || !this.isValidHandshake(request.params)) {
          throw new Error('Sidecar authentication failed');
        }
        authenticate();
        this.respond(socket, { id: request.id, result: { protocolVersion: SIDECAR_PROTOCOL_VERSION, version: this.options.version } });
        return;
      }
      this.respond(socket, { id: request.id, result: await this.dispatch(socket, request) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.respond(socket, { id: request?.id ?? 'unknown', error: { code: 'SIDECAR_ERROR', message } });
      if (!isAuthenticated()) socket.close(1008, 'Authentication required');
    }
  }

  private isValidHandshake(params: unknown): boolean {
    if (!params || typeof params !== 'object') return false;
    const value = params as { protocolVersion?: unknown; token?: unknown };
    if (value.protocolVersion !== SIDECAR_PROTOCOL_VERSION || typeof value.token !== 'string') return false;
    const expected = Buffer.from(this.options.token);
    const received = Buffer.from(value.token);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private async dispatch(socket: WebSocket, request: RpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'system.health': return { protocolVersion: SIDECAR_PROTOCOL_VERSION, status: 'ok', version: this.options.version };
      case 'system.rendererReady': return this.rendererReady(socket, request.params);
      case 'system.rendererStatus': return this.rendererStatus();
      case 'environment.get': return this.environmentGet(request.params);
      case 'environment.homeDirectory': return os.homedir();
      case 'environment.findExecutable': return this.findExecutable(request.params);
      case 'fs.exists': return existsSync(this.allowedPath(this.pathParam(request.params)));
      case 'fs.readText': return readFile(this.allowedPath(this.pathParam(request.params)), 'utf8');
      case 'fs.writeText': return this.writeText(request.params);
      case 'fs.writeBinary': return this.writeBinary(request.params);
      case 'fs.remove': return rm(this.allowedPath(this.pathParam(request.params)), { force: true, recursive: true });
      case 'fs.list': return this.list(this.pathParam(request.params));
      case 'fs.stat': return this.fileStat(this.pathParam(request.params));
      case 'fs.rename': return this.rename(request.params);
      case 'fs.mkdir': return mkdir(this.allowedPath(this.pathParam(request.params)), { recursive: true });
      case 'watch.start': return this.startWatch(socket, this.pathParam(request.params));
      case 'watch.stop': return this.stopWatch(request.params);
      case 'process.start': return this.startProcess(socket, request.params);
      case 'process.write': return this.writeProcess(request.params);
      case 'process.closeStdin': return this.closeStdin(request.params);
      case 'process.terminate': return this.terminateProcess(request.params);
      default: throw new Error(`Unsupported sidecar method: ${request.method}`);
    }
  }

  private rendererReady(socket: WebSocket, params: unknown): { readyAtMs: number; version: string | null } {
    const value = params && typeof params === 'object' ? params as { version?: unknown } : {};
    this.rendererConnection = socket;
    this.rendererReadyAtMs = Date.now();
    this.rendererVersion = typeof value.version === 'string' ? value.version : null;
    return { readyAtMs: this.rendererReadyAtMs, version: this.rendererVersion };
  }

  private rendererStatus(): { connected: boolean; readyAtMs: number | null; version: string | null } {
    const connected = this.rendererConnection?.readyState === WebSocket.OPEN;
    if (!connected) {
      return { connected: false, readyAtMs: null, version: null };
    }
    return {
      connected,
      readyAtMs: this.rendererReadyAtMs,
      version: this.rendererVersion,
    };
  }

  private environmentGet(params: unknown): string | null {
    const name = this.stringParam(params, 'name');
    return process.env[name] ?? null;
  }

  private async findExecutable(params: unknown): Promise<string | null> {
    const name = this.stringParam(params, 'name');
    const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    for (const entry of entries) {
      const candidate = path.join(entry, name);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  private async writeText(params: unknown): Promise<void> {
    const value = this.objectParam(params);
    const target = this.allowedPath(this.stringParam(value, 'path'));
    const data = this.stringParam(value, 'data');
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
    await writeFile(temporary, data, 'utf8');
    await rename(temporary, target);
  }

  private async writeBinary(params: unknown): Promise<void> {
    const value = this.objectParam(params);
    const target = this.allowedPath(this.stringParam(value, 'path'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(this.stringParam(value, 'data'), 'base64'));
  }

  private async list(inputPath: string): Promise<unknown> {
    const root = this.allowedPath(inputPath);
    const entries = await readdir(root, { withFileTypes: true });
    return entries.map(entry => ({
      kind: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
      name: entry.name,
      path: path.join(root, entry.name),
    }));
  }

  private async fileStat(inputPath: string): Promise<unknown> {
    const value = await stat(this.allowedPath(inputPath));
    return { kind: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other', modifiedAtMs: value.mtimeMs, size: value.size };
  }

  private async rename(params: unknown): Promise<void> {
    const value = this.objectParam(params);
    const from = this.allowedPath(this.stringParam(value, 'from'));
    const to = this.allowedPath(this.stringParam(value, 'to'));
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
  }

  private startWatch(socket: WebSocket, inputPath: string): { watchId: string } {
    const target = this.allowedPath(inputPath);
    const watchId = randomUUID();
    const watcher = watchFile(target, { persistent: false }, eventType => {
      this.emit(socket, 'watch.changed', { path: target, type: eventType === 'change' ? 'modified' : existsSync(target) ? 'renamed' : 'deleted', watchId });
    });
    this.watches.set(watchId, watcher);
    return { watchId };
  }

  private stopWatch(params: unknown): void {
    const watchId = this.stringParam(params, 'watchId');
    this.watches.get(watchId)?.close();
    this.watches.delete(watchId);
  }

  private startProcess(socket: WebSocket, params: unknown): { pid: number | null; sessionId: string } {
    const spec = this.objectParam(params) as unknown as ProcessStartParams;
    if (!Array.isArray(spec.args) || typeof spec.executable !== 'string' || typeof spec.cwd !== 'string') {
      throw new Error('Invalid process specification');
    }
    const cwd = this.allowedPath(spec.cwd);
    const environment = { ...process.env } as Record<string, string>;
    for (const [key, value] of Object.entries(spec.envDelta ?? {})) {
      if (value === null) delete environment[key]; else environment[key] = value;
    }
    const child = spawn(spec.executable, spec.args, { cwd, detached: process.platform !== 'win32', env: environment, stdio: 'pipe' });
    const sessionId = randomUUID();
    this.processes.set(sessionId, { child, socket });
    child.stdout.on('data', value => this.emit(socket, 'process.stdout', { data: value.toString(), sessionId }));
    child.stderr.on('data', value => this.emit(socket, 'process.stderr', { data: value.toString(), sessionId }));
    child.on('exit', (code, signal) => {
      this.processes.delete(sessionId);
      this.emit(socket, 'process.exit', { code, sessionId, signal });
    });
    return { pid: child.pid ?? null, sessionId };
  }

  private writeProcess(params: unknown): void {
    const value = this.objectParam(params);
    const process = this.requireProcess(this.stringParam(value, 'sessionId'));
    process.child.stdin?.write(this.stringParam(value, 'data'));
  }

  private closeStdin(params: unknown): void {
    this.requireProcess(this.stringParam(params, 'sessionId')).child.stdin?.end();
  }

  private async terminateProcess(params: unknown): Promise<void> {
    const value = this.objectParam(params);
    await this.stopProcess(this.stringParam(value, 'sessionId'), this.stringParam(value, 'signal') as NodeJS.Signals);
  }

  private async stopProcess(sessionId: string, signal: NodeJS.Signals): Promise<void> {
    const managed = this.processes.get(sessionId);
    if (!managed) return;
    if (managed.child.pid && process.platform !== 'win32') {
      try { process.kill(-managed.child.pid, signal); } catch { managed.child.kill(signal); }
    } else {
      managed.child.kill(signal);
    }
  }

  private requireProcess(sessionId: string): ManagedProcess {
    const process = this.processes.get(sessionId);
    if (!process) throw new Error(`Unknown process session: ${sessionId}`);
    return process;
  }

  private disposeSocket(socket: WebSocket): void {
    if (this.rendererConnection === socket) {
      this.rendererConnection = null;
      this.rendererReadyAtMs = null;
      this.rendererVersion = null;
    }
    this.sockets.delete(socket);
    for (const [watchId, watcher] of this.watches) {
      watcher.close();
      this.watches.delete(watchId);
    }
    for (const [sessionId, process] of this.processes) {
      if (process.socket === socket) void this.stopProcess(sessionId, 'SIGTERM');
    }
  }

  private allowedPath(inputPath: string): string {
    const resolved = path.resolve(inputPath);
    const allowed = this.allowedRoots.some(root => {
      const relative = path.relative(root, resolved);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
    if (!allowed) throw new Error(`Path is outside TyporAi's permitted directories: ${inputPath}`);
    return resolved;
  }

  private pathParam(params: unknown): string { return this.stringParam(params, 'path'); }
  private objectParam(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') throw new Error('Expected object parameters');
    return value as Record<string, unknown>;
  }
  private stringParam(value: unknown, key: string): string {
    const result = this.objectParam(value)[key];
    if (typeof result !== 'string' || result.length === 0) throw new Error(`Expected string parameter: ${key}`);
    return result;
  }
  private respond(socket: WebSocket, response: RpcResponse): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(response)); }
  private emit(socket: WebSocket, event: string, params: unknown): void {
    const payload: RpcEvent = { type: 'event', event, params };
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }
}
