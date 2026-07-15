import { ApplicationActivityScheduler } from '@/application/activity/ApplicationActivityScheduler';
import { type ApplicationRuntime,createApplicationRuntime } from '@/application/createApplicationRuntime';
import type { NotificationService } from '@/core/ports';
import { BridgeClient } from '@/hosts/bridge/BridgeClient';
import { BridgeSettingsStorageAdapter } from '@/hosts/bridge/BridgeSettingsStorageAdapter';
import { createBridgeHost } from '@/hosts/bridge/createBridgeHost';
import type { SidecarBootstrap } from '@/sidecar/protocol';

import type { TyporaEditorApi } from './editor-api';
import { TyporaDocumentService } from './TyporaDocumentService';

export interface MacosApplicationRuntime {
  readonly client: BridgeClient;
  readonly runtime: ApplicationRuntime;
  dispose(): Promise<void>;
}

/**
 * Builds the browser-safe host used by macOS Typora. Provider execution stays
 * in the Sidecar, but document, file, process, and settings ports are already
 * available to the renderer through this runtime.
 */
export function createMacosApplicationRuntime(
  editor: TyporaEditorApi,
  bootstrap: SidecarBootstrap,
  notifications: NotificationService = { show: () => undefined },
): MacosApplicationRuntime {
  const scheduler = new ApplicationActivityScheduler();
  const client = new BridgeClient(bootstrap);
  const configPath = `${bootstrap.homeDirectory ?? ''}/Library/Application Support/TyporAi/sidecar/renderer-settings.json`;
  let storage: BridgeSettingsStorageAdapter | null = null;
  const runtime = createApplicationRuntime(createBridgeHost({
    bootstrap,
    client,
    createDocuments: watches => new TyporaDocumentService(editor, watches, scheduler),
    notifications,
    scheduler,
    settings: {
      get: key => storage!.get(key),
      set: (key, value) => storage!.set(key, value),
      delete: async () => undefined,
    },
    workspace: null,
  }));
  storage = new BridgeSettingsStorageAdapter(configPath, runtime.host.files, runtime.host.watches);

  return {
    client,
    runtime,
    async dispose(): Promise<void> {
      storage?.dispose();
      await runtime.dispose();
    },
  };
}
