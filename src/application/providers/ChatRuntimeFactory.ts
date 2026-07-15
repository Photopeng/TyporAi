import type { HostServices } from '@/core/ports';
import type { CreateChatRuntimeOptions } from '@/core/providers/types';
import type { ChatRuntime } from '@/core/runtime/ChatRuntime';

import { ProviderRuntimeContainer } from './ProviderRuntimeContainer';

export class ChatRuntimeFactory {
  private readonly container: ProviderRuntimeContainer<ChatRuntime>;

  constructor(
    host: HostServices,
    private readonly createRegisteredRuntime: (options: CreateChatRuntimeOptions) => ChatRuntime,
  ) {
    this.container = new ProviderRuntimeContainer(host);
  }

  create = (options: CreateChatRuntimeOptions): ChatRuntime => this.container.create({
    create: (host) => this.createRegisteredRuntime({
      ...options,
      processTransport: options.processTransport ?? host.processes,
      notificationService: options.notificationService ?? host.notifications,
      fileStore: options.fileStore ?? host.files,
      fileBackupService: options.fileBackupService ?? host.fileBackups,
      fileProbe: options.fileProbe ?? host.fileProbe,
      pathService: options.pathService ?? host.paths,
      environmentService: options.environmentService ?? host.environment,
    }),
  });

  dispose(): Promise<void> { return this.container.dispose(); }
}
