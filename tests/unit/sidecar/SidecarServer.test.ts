import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WebSocket } from 'ws';

import { SidecarServer } from '@/sidecar/SidecarServer';

describe('SidecarServer', () => {
  let root: string;
  let server: SidecarServer;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'typorai-sidecar-'));
    server = new SidecarServer({
      allowedRoots: [root],
      dataDirectory: path.join(root, 'data'),
      port: 0,
      token: 'test-token',
      version: 'test',
    });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
    rmSync(root, { force: true, recursive: true });
  });

  it('authenticates requests and limits file access to permitted roots', async () => {
    const socket = await openSocket(server.port);
    await request(socket, 'handshake', 'system.handshake', { protocolVersion: 1, token: 'test-token' });

    await request(socket, 'write', 'fs.writeText', { data: 'hello', path: path.join(root, 'note.md') });
    await expect(request(socket, 'read', 'fs.readText', { path: path.join(root, 'note.md') })).resolves.toBe('hello');
    await expect(request(socket, 'blocked', 'fs.readText', { path: path.join(tmpdir(), 'outside.md') }))
      .rejects.toThrow('outside TyporAi');
    socket.close();
  });

  it('reports an authenticated Renderer only while its socket remains connected', async () => {
    const renderer = await openSocket(server.port);
    const inspector = await openSocket(server.port);
    await request(renderer, 'renderer-handshake', 'system.handshake', { protocolVersion: 1, token: 'test-token' });
    await request(inspector, 'inspector-handshake', 'system.handshake', { protocolVersion: 1, token: 'test-token' });

    await request(renderer, 'renderer-ready', 'system.rendererReady', { version: 'test-renderer' });
    await expect(request(inspector, 'renderer-status', 'system.rendererStatus', {})).resolves.toEqual({
      connected: true,
      readyAtMs: expect.any(Number),
      version: 'test-renderer',
    });

    const closed = new Promise<void>(resolve => renderer.once('close', () => resolve()));
    renderer.close();
    await closed;
    await expect(request(inspector, 'renderer-disconnected', 'system.rendererStatus', {})).resolves.toEqual({
      connected: false,
      readyAtMs: null,
      version: null,
    });
    inspector.close();
  });

  it('probes only the supported local agents and rejects arbitrary agent launches', async () => {
    const socket = await openSocket(server.port);
    await request(socket, 'handshake', 'system.handshake', { protocolVersion: 1, token: 'test-token' });

    await expect(request(socket, 'probe', 'agent.probe', {})).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'claude' }),
      expect.objectContaining({ providerId: 'codex' }),
      expect.objectContaining({ providerId: 'opencode' }),
    ]));
    await expect(request(socket, 'unsupported', 'agent.start', {
      cwd: root,
      prompt: 'hello',
      providerId: 'shell',
    })).rejects.toThrow('Invalid agent request');
    socket.close();
  });
});

function openSocket(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function request(socket: WebSocket, id: string, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: WebSocket.RawData) => {
      const value = JSON.parse(raw.toString()) as { id?: string; result?: unknown; error?: { message: string } };
      if (value.id !== id) return;
      socket.off('message', onMessage);
      if (value.error) reject(new Error(value.error.message)); else resolve(value.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
