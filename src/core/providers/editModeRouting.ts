import type TyporAiPlugin from '../../main';
import { resolveConfiguredCliProviderId } from './cliProviderSelection';
import type { ProviderId } from './types';

export const TYPORA_API_PROVIDER_ID = 'typora' as const satisfies ProviderId;

export function resolveEditModeProviderId(
  plugin: TyporAiPlugin,
  currentProviderId: ProviderId | null | undefined,
): ProviderId | null {
  const settings = plugin.settings as unknown as Record<string, unknown>;

  // Default to Typora API for edit mode
  if (!isTyporaApiProviderEnabled(settings)) {
    // Fall back to CLI if Typora API is disabled
    const cliProviderId = resolveConfiguredCliProviderId(plugin, currentProviderId);
    if (!cliProviderId) {
      return null;
    }
    return cliProviderId;
  }
  return TYPORA_API_PROVIDER_ID;
}

function isTyporaApiProviderEnabled(settings: Record<string, unknown>): boolean {
  const providerConfigs = settings.providerConfigs;
  if (!providerConfigs || typeof providerConfigs !== 'object' || Array.isArray(providerConfigs)) {
    return true;
  }

  const typoraConfig = (providerConfigs as Record<string, unknown>).typora;
  if (!typoraConfig || typeof typoraConfig !== 'object' || Array.isArray(typoraConfig)) {
    return true;
  }

  return (typoraConfig as Record<string, unknown>).enabled !== false;
}
