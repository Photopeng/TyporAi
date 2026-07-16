import { type RpcSocket,WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import type { SidecarBootstrap } from '@/sidecar/protocol';

import { RENDERER_PROVIDERS } from './RendererProviderRegistry';

export {};

declare global {
  interface Window { __TYPORAI_BOOTSTRAP__?: SidecarBootstrap; }
}

function mountRenderer(): void {
  const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
  root.id = 'typorai-typora-root';
  root.dataset.typoraiRuntime = 'browser';
  root.dataset.typoraiProviders = RENDERER_PROVIDERS.map(provider => provider.providerId).join(',');
  const bootstrap = window.__TYPORAI_BOOTSTRAP__;
  root.dataset.typoraiSidecar = bootstrap ? 'pending' : 'unavailable';
  if (!bootstrap) return;
  void connect(root, bootstrap);
}

async function connect(root: HTMLElement, bootstrap: SidecarBootstrap): Promise<void> {
  const client = new WebSocketRpcClient(bootstrap.endpoint, { socketFactory: endpoint => new WebSocket(endpoint) as unknown as RpcSocket });
  try {
    await client.connect();
    const initialized = await client.initialize({
      clientId: getClientId(), lastConnectionId: getLastConnectionId(),
      platform: navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'windows',
      protocol: { min: 1, max: 1 }, rendererVersion: '2.x', token: bootstrap.token,
    });
    localStorage.setItem('typorai.renderer.last-connection-id', initialized.connectionId);
    root.dataset.typoraiSidecar = 'connected';
    window.addEventListener('offline', () => { root.dataset.typoraiSidecar = 'reconnecting'; }, { once: true });
  } catch {
    root.dataset.typoraiSidecar = client.state === 'incompatible' ? 'incompatible' : 'error';
  }
}

function getLastConnectionId(): string | null { return localStorage.getItem('typorai.renderer.last-connection-id'); }

function getClientId(): string {
  const key = 'typorai.renderer.client-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(key, generated);
  return generated;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountRenderer, { once: true });
else mountRenderer();
