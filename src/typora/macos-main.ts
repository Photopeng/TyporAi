import { BridgeClient } from '@/hosts/bridge/BridgeClient';
import type { SidecarBootstrap } from '@/sidecar/protocol';

declare global {
  interface Window {
    __TYPORAI_BOOTSTRAP__?: SidecarBootstrap;
  }
}

async function boot(): Promise<void> {
  const bootstrap = window.__TYPORAI_BOOTSTRAP__;
  if (!bootstrap) throw new Error('Missing TyporAi macOS bootstrap configuration');
  const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
  root.id = 'typorai-typora-root';
  root.className = 'typorai-macos-bridge-root';
  root.setAttribute('aria-label', 'TyporAi');
  const client = new BridgeClient(bootstrap);
  const health = await client.call<{ version: string }>('system.health');
  root.dataset.typoraiSidecar = 'connected';
  root.dataset.typoraiVersion = health.version;
}

void boot().catch(error => {
  const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
  root.id = 'typorai-typora-root';
  root.dataset.typoraiSidecar = 'error';
  root.textContent = error instanceof Error ? error.message : String(error);
});
