import type TyporAiPlugin from '../../main';
import { getProviderConfig, setProviderConfig } from './providerConfig';
import { ProviderRegistry } from './ProviderRegistry';
import { ProviderWorkspaceRegistry } from './ProviderWorkspaceRegistry';
import type { ProviderId } from './types';

export const CLI_PROVIDER_IDS = ['claude', 'codex', 'opencode'] as const satisfies readonly ProviderId[];

const CLI_PROVIDER_ID_SET = new Set<string>(CLI_PROVIDER_IDS);

export function isCliProviderId(providerId: ProviderId | null | undefined): providerId is typeof CLI_PROVIDER_IDS[number] {
  return !!providerId && CLI_PROVIDER_ID_SET.has(providerId);
}

export function setSingleEnabledCliProvider(
  settings: Record<string, unknown>,
  providerId: ProviderId,
  enabled: boolean,
): void {
  if (!isCliProviderId(providerId)) {
    return;
  }

  if (!enabled) {
    const current = getProviderConfig(settings, providerId);
    setProviderConfig(settings, providerId, { ...current, enabled: false });
    if (settings.settingsProvider === providerId) {
      settings.settingsProvider = 'typora';
    }
    return;
  }

  for (const cliProviderId of CLI_PROVIDER_IDS) {
    const current = getProviderConfig(settings, cliProviderId);
    setProviderConfig(settings, cliProviderId, {
      ...current,
      enabled: cliProviderId === providerId,
    });
  }

  settings.settingsProvider = providerId;
}

export function clearEnabledCliProviders(settings: Record<string, unknown>): void {
  for (const providerId of CLI_PROVIDER_IDS) {
    const current = getProviderConfig(settings, providerId);
    setProviderConfig(settings, providerId, { ...current, enabled: false });
  }
  if (isCliProviderId(settings.settingsProvider as ProviderId | null | undefined)) {
    settings.settingsProvider = 'typora';
  }
}

export function normalizeSingleEnabledCliProvider(settings: Record<string, unknown>): boolean {
  const enabledProviders = CLI_PROVIDER_IDS.filter(providerId => getProviderConfig(settings, providerId).enabled === true);
  if (enabledProviders.length <= 1) {
    return false;
  }

  const settingsProvider = typeof settings.settingsProvider === 'string'
    && isCliProviderId(settings.settingsProvider as ProviderId)
    && enabledProviders.includes(settings.settingsProvider as typeof CLI_PROVIDER_IDS[number])
    ? settings.settingsProvider as typeof CLI_PROVIDER_IDS[number]
    : enabledProviders[0];

  for (const providerId of CLI_PROVIDER_IDS) {
    const current = getProviderConfig(settings, providerId);
    setProviderConfig(settings, providerId, {
      ...current,
      enabled: providerId === settingsProvider,
    });
  }
  return true;
}

export function isCliProviderConfigured(
  settings: Record<string, unknown>,
  providerId: ProviderId | null | undefined,
): providerId is typeof CLI_PROVIDER_IDS[number] {
  if (!isCliProviderId(providerId) || !ProviderRegistry.hasProvider(providerId)) {
    return false;
  }

  if (!ProviderRegistry.isEnabled(providerId, settings)) {
    return false;
  }

  if (!ProviderRegistry.getCapabilities(providerId).supportsPersistentRuntime) {
    return false;
  }

  return !!ProviderWorkspaceRegistry.getCliResolver(providerId)?.resolveFromSettings(settings);
}

export function resolveConfiguredCliProviderId(
  plugin: TyporAiPlugin,
  preferredProviderId: ProviderId | null | undefined,
): ProviderId | null {
  const settings = plugin.settings as unknown as Record<string, unknown>;
  if (isCliProviderConfigured(settings, preferredProviderId)) {
    return preferredProviderId;
  }

  const settingsProvider = ProviderRegistry.resolveSettingsProviderId(settings);
  if (isCliProviderConfigured(settings, settingsProvider)) {
    return settingsProvider;
  }

  return CLI_PROVIDER_IDS.find(providerId => isCliProviderConfigured(settings, providerId)) ?? null;
}
