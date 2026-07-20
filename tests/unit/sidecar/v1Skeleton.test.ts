import { access, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { WebSocket } from 'ws';

import { SingleInstanceLock } from '@/sidecar/lifecycle/SingleInstanceLock';
import { writeConnectionDescriptor } from '@/sidecar/server/ConnectionDescriptor';
import { RpcRouter } from '@/sidecar/server/RpcRouter';
import { SidecarServer } from '@/sidecar/server/SidecarServer';

describe('v1 Sidecar skeleton', () => {
  it('permits one live instance lock', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-lock-'));
    const first = new SingleInstanceLock(path.join(directory, 'sidecar.lock'));
    const second = new SingleInstanceLock(path.join(directory, 'sidecar.lock'));
    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(false);
    await first.release();
  });

  it('writes a complete connection descriptor atomically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-descriptor-'));
    const descriptorPath = path.join(directory, 'connection.json');
    await writeConnectionDescriptor(descriptorPath, { host: '127.0.0.1', port: 8123, token: 'redacted', pid: 1, sidecarVersion: '2.0.27', protocolMin: 1, protocolMax: 1, startedAt: 1 });
    await expect(readFile(descriptorPath, 'utf8')).resolves.toContain('127.0.0.1');
  });

  it('binds the configured stable port for browser-only renderers', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-fixed-port-'));
    const port = await findAvailablePort();
    const server = new SidecarServer({
      dataDirectory: directory,
      descriptorPath: path.join(directory, 'descriptor.json'),
      lockPath: path.join(directory, 'lock'),
      port,
      sidecarVersion: '2.0.27',
      token: 'test-token',
    });

    const descriptor = await server.start();
    try {
      expect(descriptor).toMatchObject({ port });
    } finally {
      await server.close();
    }
  });

  it('reports a scrubbed, machine-readable health snapshot', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-health-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    try {
      const health = await (await fetch(`http://127.0.0.1:${descriptor.port}/health`)).json() as Record<string, unknown>;
      expect(health).toMatchObject({ persistence: true, processManager: true, protocolMin: 1, protocolMax: 1, sidecarVersion: '2.0.27', status: 'ok' });
      expect(JSON.stringify(health)).not.toContain('test-token');
    } finally {
      await server.close();
    }
  });

  it('removes its connection descriptor during an orderly shutdown', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-descriptor-close-'));
    const descriptorPath = path.join(directory, 'descriptor.json');
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath, lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    await server.start();
    await server.close();

    await expect(access(descriptorPath)).rejects.toThrow();
  });

  it('requires initialize authentication and version compatibility', () => {
    const router = new RpcRouter({ token: 'test-token', sidecarVersion: '2.0.27' });
    const parameters = { token: 'test-token', clientId: 'client', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null };
    expect(router.route({ jsonrpc: '2.0', id: '1', method: 'system.initialize', params: parameters })).toHaveProperty('result');
    expect(router.route({ jsonrpc: '2.0', id: '2', method: 'system.initialize', params: { ...parameters, token: 'wrong' } })).toMatchObject({ error: { code: 'AUTH_FAILED' } });
    expect(router.route({ jsonrpc: '2.0', id: '3', method: 'system.initialize', params: { ...parameters, protocol: { min: 2, max: 2 } } })).toMatchObject({ error: { code: 'PROTOCOL_VERSION_MISMATCH' } });
    expect(router.routeAuthenticated({ jsonrpc: '2.0', id: '4', method: 'system.health' })).toMatchObject({ result: { status: 'ok' } });
    expect(router.routeAuthenticated({ jsonrpc: '2.0', id: '5', method: 'unknown.method' })).toMatchObject({ error: { code: 'METHOD_NOT_SUPPORTED' } });
  });

  it('closes an incompatible client before it can issue persistent writes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-incompatible-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    const socket = await openSocket(descriptor.port);
    const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'system.initialize', params: { token: 'test-token', clientId: 'client', rendererVersion: '2.0.27', protocol: { min: 2, max: 2 }, platform: 'windows', lastConnectionId: null } }));
    await closed;
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
    await server.close();
  });

  it('streams fake provider events after an authenticated turn request', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-server-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    const socket = await openSocket(descriptor.port);
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'system.initialize', params: { token: 'test-token', clientId: 'client', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null } }));
    await waitFor(() => messages.some(message => message.id === 'init'));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'settings', method: 'settings.applyPatch', params: { expectedRevision: 0, idempotencyKey: 'settings-1', patch: { mode: 'safe' } } }));
    await waitFor(() => messages.some(message => message.id === 'settings'));
    expect(messages.find(message => message.id === 'settings')).toMatchObject({ result: { revision: 1, value: { mode: 'safe' } } });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'stale-settings', method: 'settings.applyPatch', params: { expectedRevision: 0, idempotencyKey: 'settings-2', patch: { mode: 'stale' } } }));
    await waitFor(() => messages.some(message => message.id === 'stale-settings'));
    expect(messages.find(message => message.id === 'stale-settings')).toMatchObject({ error: { code: 'SETTINGS_REVISION_CONFLICT' } });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'session', method: 'session.create', params: { idempotencyKey: 'session-1', conversation: { id: 'conversation-1', providerId: 'fake', title: 'Test', createdAt: 1, updatedAt: 1, sessionId: null, messages: [] } } }));
    await waitFor(() => messages.some(message => message.id === 'session'));
    expect(messages.find(message => message.id === 'session')).toMatchObject({ result: { revision: 1, conversation: { id: 'conversation-1' } } });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'sessions', method: 'session.list', params: {} }));
    await waitFor(() => messages.some(message => message.id === 'sessions'));
    expect(messages.find(message => message.id === 'sessions')).toMatchObject({ result: [expect.objectContaining({ conversation: expect.objectContaining({ id: 'conversation-1' }), revision: 1 })] });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'turn', method: 'chat.startTurn', params: { prompt: 'hello', turnId: 'turn-1' } }));
    await waitFor(() => messages.some(message => message.method === 'stream.event'));
    expect(messages.some(message => message.method === 'stream.event')).toBe(true);
    socket.close();
    await server.close();
  });

  it('resumes a disconnected client lease during its reconnect window', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-resume-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), reconnectGraceMs: 100, sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    const first = await openSocket(descriptor.port);
    const firstMessages: Array<Record<string, unknown>> = [];
    first.on('message', raw => firstMessages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    first.send(JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'system.initialize', params: { token: 'test-token', clientId: 'window-a', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null } }));
    await waitFor(() => firstMessages.some(message => message.id === 'init'));
    const firstConnectionId = ((firstMessages.find(message => message.id === 'init')?.result as { connectionId: string }).connectionId);
    first.send(JSON.stringify({ jsonrpc: '2.0', id: 'runtime', method: 'chat.createRuntime', params: { providerId: 'fake', runtimeId: 'runtime-a' } }));
    await waitFor(() => firstMessages.some(message => message.id === 'runtime'));
    first.send(JSON.stringify({ jsonrpc: '2.0', id: 'turn', method: 'chat.startTurn', params: { providerId: 'fake', runtimeId: 'runtime-a', prompt: 'hello', turnId: 'turn-a' } }));
    await waitFor(() => firstMessages.some(message => message.method === 'stream.event'));
    first.close();
    await new Promise(resolve => setTimeout(resolve, 10));

    const second = await openSocket(descriptor.port);
    const secondMessages: Array<Record<string, unknown>> = [];
    second.on('message', raw => secondMessages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    second.send(JSON.stringify({ jsonrpc: '2.0', id: 'resume', method: 'system.initialize', params: { token: 'test-token', clientId: 'window-a', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: firstConnectionId } }));
    await waitFor(() => secondMessages.some(message => message.id === 'resume'));
    expect(secondMessages.find(message => message.id === 'resume')).toMatchObject({ result: { connectionId: firstConnectionId, resumed: true } });
    second.send(JSON.stringify({ jsonrpc: '2.0', id: 'replay', method: 'stream.replay', params: { positions: { 'turn-a': 0 } } }));
    await waitFor(() => secondMessages.some(message => message.id === 'replay'));
    expect(secondMessages.find(message => message.id === 'replay')).toMatchObject({ result: { events: expect.arrayContaining([expect.objectContaining({ streamId: 'turn-a', seq: 1 })]), unavailable: [] } });
    second.send(JSON.stringify({ jsonrpc: '2.0', id: 'state', method: 'chat.getRuntimeState', params: { providerId: 'fake', runtimeId: 'runtime-a' } }));
    await waitFor(() => secondMessages.some(message => message.id === 'state'));
    expect(secondMessages.find(message => message.id === 'state')).toHaveProperty('result');
    const closed = new Promise<void>(resolve => second.once('close', () => resolve()));
    second.close();
    await closed;
    await server.close();
  });

  it('keeps Sidecar blob staging paths out of authenticated RPC responses', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-blob-rpc-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    const socket = await openSocket(descriptor.port);
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'system.initialize', params: { token: 'test-token', clientId: 'client', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null } }));
    await waitFor(() => messages.some(message => message.id === 'init'));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'begin', method: 'blob.begin', params: { bytes: 2, mimeType: 'image/png' } }));
    await waitFor(() => messages.some(message => message.id === 'begin'));
    const blobId = ((messages.find(message => message.id === 'begin')?.result as { blobId: string }).blobId);
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'chunk', method: 'blob.chunk', params: { blobId, data: 'aGk=' } }));
    await waitFor(() => messages.some(message => message.id === 'chunk'));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'commit', method: 'blob.commit', params: { blobId } }));
    await waitFor(() => messages.some(message => message.id === 'commit'));
    expect(messages.find(message => message.id === 'commit')).toMatchObject({ result: { blobId, mimeType: 'image/png', size: 2 } });
    expect(JSON.stringify(messages.find(message => message.id === 'commit'))).not.toContain(directory);
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'turn', method: 'chat.startTurn', params: { blobIds: [blobId], prompt: 'describe attachment', turnId: 'attachment-turn' } }));
    await waitFor(() => messages.some(message => JSON.stringify(message).includes('typorai_attachments')));
    expect(JSON.stringify(messages.find(message => JSON.stringify(message).includes('typorai_attachments')))).toContain('.blob');
    socket.close();
    await server.close();
  });

  it('deduplicates retried workspace writes by method and idempotency key', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-idempotency-'));
    const server = new SidecarServer({ dataDirectory: directory, descriptorPath: path.join(directory, 'descriptor.json'), lockPath: path.join(directory, 'lock'), sidecarVersion: '2.0.27', token: 'test-token' });
    const descriptor = await server.start();
    const socket = await openSocket(descriptor.port);
    const messages: Array<Record<string, unknown>> = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'system.initialize', params: { token: 'test-token', clientId: 'client', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null } }));
    await waitFor(() => messages.some(message => message.id === 'init'));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'grant', method: 'workspace.grant', params: { root: directory } }));
    await waitFor(() => messages.some(message => message.id === 'grant'));
    const params = { path: 'retry.md', idempotencyKey: 'write-1' };
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'first', method: 'fs.writeText', params: { ...params, data: 'first' } }));
    await waitFor(() => messages.some(message => message.id === 'first'));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'retry', method: 'fs.writeText', params: { ...params, data: 'second' } }));
    await waitFor(() => messages.some(message => message.id === 'retry'));
    expect(messages.find(message => message.id === 'retry')).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 'read', method: 'fs.readText', params: { path: 'retry.md' } }));
    await waitFor(() => messages.some(message => message.id === 'read'));
    expect(messages.find(message => message.id === 'read')).toMatchObject({ result: 'first' });
    socket.close();
    await server.close();
  });
});

function openSocket(port: number): Promise<WebSocket> { return new Promise((resolve, reject) => { const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`); socket.once('open', () => resolve(socket)); socket.once('error', reject); }); }
function findAvailablePort(): Promise<number> { return new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') { server.close(); reject(new Error('Unable to reserve a test port')); return; } server.close(error => { if (error) reject(error); else resolve(address.port); }); }); }); }
async function waitFor(predicate: () => boolean): Promise<void> { for (let index = 0; index < 50; index += 1) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Timed out waiting for WebSocket message.'); }
