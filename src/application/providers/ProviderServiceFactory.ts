import type { HostServices } from '@/core/ports';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type {
  InlineEditService,
  InstructionRefineService,
  ProviderId,
  ProviderServiceFactory as ProviderServiceFactoryPort,
  TitleGenerationService,
} from '@/core/providers/types';
import type TyporAiPlugin from '@/main';

/** Composes provider auxiliary services with the current host capabilities. */
export class ProviderServiceFactory implements ProviderServiceFactoryPort {
  constructor(private readonly host: HostServices) {}

  createTitleGenerationService(plugin: TyporAiPlugin, providerId?: ProviderId): TitleGenerationService {
    return ProviderRegistry.createTitleGenerationService(plugin, providerId, {
      processTransport: this.host.processes,
      fileStore: this.host.files,
      pathService: this.host.paths,
    });
  }

  createInstructionRefineService(
    plugin: TyporAiPlugin,
    providerId: ProviderId,
  ): InstructionRefineService {
    return ProviderRegistry.createInstructionRefineService(plugin, providerId, {
      processTransport: this.host.processes,
      fileStore: this.host.files,
      pathService: this.host.paths,
    });
  }

  createInlineEditService(plugin: TyporAiPlugin, providerId: ProviderId): InlineEditService {
    return ProviderRegistry.createInlineEditService(plugin, providerId, {
      processTransport: this.host.processes,
      fileStore: this.host.files,
      pathService: this.host.paths,
    });
  }
}
