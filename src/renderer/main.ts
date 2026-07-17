import { type RpcSocket,WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import type { SidecarBootstrap } from '@/sidecar/protocol';

import { RENDERER_PROVIDERS } from './RendererProviderRegistry';
import { SidecarChatPanel } from './SidecarChatPanel';

export {};

declare global {
  interface Window { __TYPORAI_BOOTSTRAP__?: SidecarBootstrap; }
}

function mountRenderer(): void {
  const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
  root.id = 'typorai-typora-root';
  installRendererShellStyles();
  root.dataset.typoraiRuntime = 'browser';
  root.dataset.typoraiProviders = RENDERER_PROVIDERS.map(provider => provider.providerId).join(',');
  const bootstrap = window.__TYPORAI_BOOTSTRAP__;
  root.dataset.typoraiSidecar = bootstrap ? 'pending' : 'unavailable';
  if (!bootstrap) {
    root.className = 'typorai-sidecar-panel typorai-sidecar-panel--error';
    root.textContent = 'TyporAi bootstrap configuration is unavailable.';
    return;
  }
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
    const panel = new SidecarChatPanel(root, client);
    await panel.initialize();
    window.addEventListener('offline', () => { root.dataset.typoraiSidecar = 'reconnecting'; }, { once: true });
  } catch (error) {
    root.dataset.typoraiSidecar = client.state === 'incompatible' ? 'incompatible' : 'error';
    root.className = 'typorai-sidecar-panel typorai-sidecar-panel--error';
    root.textContent = `TyporAi could not connect to its Sidecar: ${error instanceof Error ? error.message : 'unknown error'}`;
  }
}

function installRendererShellStyles(): void {
  if (document.getElementById('typorai-sidecar-shell-style')) return;
  const style = document.createElement('style');
  style.id = 'typorai-sidecar-shell-style';
  style.textContent = `
    #typorai-typora-root {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 9999;
      width: min(430px, 48vw);
      min-width: 320px;
      overflow: hidden;
      border-left: 1px solid rgba(0, 0, 0, 0.16);
    }
    body > content { right: min(430px, 48vw) !important; }
    .typorai-sidecar-panel--error { padding: 16px; background: #f7f0e2; color: #25211b; }
  `;
  document.head.append(style);
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
