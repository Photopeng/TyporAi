import type { SidecarBootstrap } from '@/sidecar/protocol';

import { createMacosApplicationRuntime } from './createMacosApplicationRuntime';
import { TyporaEditorApi } from './editor-api';
import { MacosChatPanel } from './MacosChatPanel';

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
  const editor = new TyporaEditorApi();
  const application = createMacosApplicationRuntime(editor, bootstrap);
  const health = await application.client.call<{ version: string }>('system.health');
  await application.client.call('system.rendererReady', { version: health.version });
  const panel = new MacosChatPanel(root, application.client, editor, application.settings);
  await panel.initialize();
  root.dataset.typoraiSidecar = 'connected';
  root.dataset.typoraiVersion = health.version;
  root.dataset.typoraiRuntime = application.runtime.host.platform.runtime;
}

void boot().catch(error => {
  const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
  root.id = 'typorai-typora-root';
  root.dataset.typoraiSidecar = 'error';
  root.textContent = error instanceof Error ? error.message : String(error);
});
