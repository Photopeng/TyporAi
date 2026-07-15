import { ApplicationActivityScheduler } from '@/application/activity/ApplicationActivityScheduler';
import { type ApplicationRuntime,createApplicationRuntime } from '@/application/createApplicationRuntime';
import { ChatRuntimeFactory } from '@/application/providers/ChatRuntimeFactory';
import { ProviderServiceFactory } from '@/application/providers/ProviderServiceFactory';
import type { KeyValueStore, NotificationService } from '@/core/ports';
import { CapabilityUnavailableError } from '@/core/ports';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { createElectronHost } from '@/hosts/electron/createElectronHost';

import type { FileSettingsStorageAdapter } from '../adapters/settingsStorage';
import type { TyporaEditorApi } from './editor-api';
import { TyporaDocumentService } from './TyporaDocumentService';

export function createTyporaApplicationRuntime(
  editor: TyporaEditorApi,
  storage: FileSettingsStorageAdapter,
): ApplicationRuntime {
  const scheduler = new ApplicationActivityScheduler();
  const settings: KeyValueStore = {
    get: key => storage.get(key), set: (key, value) => storage.set(key, value), delete: async () => undefined,
  };
  const notifications: NotificationService = { show: () => undefined };
  return createApplicationRuntime(createElectronHost({
    createDocuments: watches => new TyporaDocumentService(editor, watches, scheduler),
    notifications,
    scheduler,
    settings,
    workspace: null,
  }));
}

export function tryCreateTyporaApplicationRuntime(
  editor: TyporaEditorApi,
  storage: FileSettingsStorageAdapter,
): ApplicationRuntime | null {
  try { return createTyporaApplicationRuntime(editor, storage); }
  catch (error) {
    if (error instanceof CapabilityUnavailableError) return null;
    throw error;
  }
}

export function createTyporaChatRuntimeFactory(runtime: ApplicationRuntime): ChatRuntimeFactory {
  return new ChatRuntimeFactory(runtime.host, options => ProviderRegistry.createChatRuntime(options));
}

export function createTyporaProviderServiceFactory(runtime: ApplicationRuntime): ProviderServiceFactory {
  return new ProviderServiceFactory(runtime.host);
}
