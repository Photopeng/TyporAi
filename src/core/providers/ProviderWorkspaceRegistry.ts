import type TyporAiPlugin from '../../main';
import type { HomeFileStore,HostServices } from '../ports';
import type { ProviderCommandCatalog } from './commands/ProviderCommandCatalog';
import type {
  AgentMentionProvider,
  ProviderCliResolver,
  ProviderId,
  ProviderRuntimeCommandLoader,
  ProviderSettingsTabRenderer,
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from './types';

/**
 * Registry for provider-owned workspace/bootstrap services.
 *
 * Unlike `ProviderRegistry`, this boundary owns app-level provider services such
 * as command catalogs, mention providers, MCP/plugin/agent managers, and
 * provider-specific storage adaptors.
 */
export class ProviderWorkspaceRegistry {
  private static registrations: Partial<Record<ProviderId, ProviderWorkspaceRegistration>> = {};
  private static services: Partial<Record<ProviderId, ProviderWorkspaceServices>> = {};
  private static homeAdapter: HomeFileStore | null = null;

  static register(
    providerId: ProviderId,
    registration: ProviderWorkspaceRegistration,
  ): void {
    this.registrations[providerId] = registration;
  }

  private static getWorkspaceRegistration(providerId: ProviderId): ProviderWorkspaceRegistration {
    const registration = this.registrations[providerId];
    if (!registration) {
      throw new Error(`Provider workspace "${providerId}" is not registered.`);
    }
    return registration;
  }

  static async initializeAll(plugin: TyporAiPlugin): Promise<void> {
    await this.disposeAll();
    const providerIds = Object.keys(this.registrations);
    if (providerIds.length === 0) return;
    const storage = plugin.storage;
    const workspaceFileAdapter = storage.getAdapter();
    const homeAdapter = this.homeAdapter;
    if (!homeAdapter) throw new Error('Provider home storage is not configured for this host.');

    const results = await Promise.allSettled(providerIds.map(async providerId => ({
      providerId,
      services: await this.getWorkspaceRegistration(providerId).initialize({
        plugin,
        storage,
        workspaceFileAdapter,
        vaultAdapter: workspaceFileAdapter,
        homeAdapter,
      }),
    })));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.services[result.value.providerId] = result.value.services;
      }
    }
  }

  static configureHomeAdapter(adapter: HomeFileStore): void {
    this.homeAdapter = adapter;
  }

  static setServices(
    providerId: ProviderId,
    services: ProviderWorkspaceServices | undefined,
  ): void {
    if (services) {
      this.services[providerId] = services;
    } else {
      delete this.services[providerId];
    }
  }

  static clear(): void {
    this.services = {};
  }

  static async disposeAll(): Promise<void> {
    const services = Object.values(this.services).reverse();
    this.services = {};
    for (const service of services) {
      try {
        await service?.dispose?.();
      } catch {
        // Provider teardown is best-effort so one stale service cannot leak all others.
      }
    }
  }

  static configureHostServices(host: HostServices): void {
    for (const service of Object.values(this.services)) {
      service?.configureHostServices?.(host);
    }
  }

  static getServices(
    providerId: ProviderId,
  ): ProviderWorkspaceServices | null {
    return this.services[providerId] ?? null;
  }

  static requireServices(
    providerId: ProviderId,
  ): ProviderWorkspaceServices {
    const services = this.getServices(providerId);
    if (!services) {
      throw new Error(`Provider workspace "${providerId}" is not initialized.`);
    }
    return services;
  }

  static getCommandCatalog(providerId: ProviderId): ProviderCommandCatalog | null {
    return this.getServices(providerId)?.commandCatalog ?? null;
  }

  static getAgentMentionProvider(providerId: ProviderId): AgentMentionProvider | null {
    return this.getServices(providerId)?.agentMentionProvider ?? null;
  }

  static async refreshAgentMentions(providerId: ProviderId): Promise<void> {
    await this.getServices(providerId)?.refreshAgentMentions?.();
  }

  static getCliResolver(providerId: ProviderId): ProviderCliResolver | null {
    return this.getServices(providerId)?.cliResolver ?? null;
  }

  static getRuntimeCommandLoader(providerId: ProviderId): ProviderRuntimeCommandLoader | null {
    return this.getServices(providerId)?.runtimeCommandLoader ?? null;
  }

  static getTabWarmupPolicy(providerId: ProviderId): ProviderTabWarmupPolicy | null {
    return this.getServices(providerId)?.tabWarmupPolicy ?? null;
  }

  static getMcpServerManager(providerId: ProviderId) {
    return this.getServices(providerId)?.mcpServerManager ?? null;
  }

  static getSettingsTabRenderer(providerId: ProviderId): ProviderSettingsTabRenderer | null {
    return this.getServices(providerId)?.settingsTabRenderer ?? null;
  }
}
