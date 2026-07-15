import { getEnabledProviderForModel } from '../../../core/providers/modelRouting';
import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import { DEFAULT_CHAT_PROVIDER_ID, type ProviderId } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import type TyporAiPlugin from '../../../main';
import type { TabProviderContext } from './types';

export function resolveRegisteredProviderId(
  providerId: ProviderId | null | undefined,
  plugin: TyporAiPlugin,
): ProviderId {
  if (ProviderRegistry.hasProvider(providerId)) {
    return providerId;
  }

  const settings = plugin.settings as unknown as Record<string, unknown>;
  const settingsProvider = ProviderRegistry.resolveSettingsProviderId(settings);
  if (ProviderRegistry.hasProvider(settingsProvider)) {
    return settingsProvider;
  }

  return DEFAULT_CHAT_PROVIDER_ID;
}

function getStoredConversationProviderId(
  tab: TabProviderContext,
  plugin: TyporAiPlugin,
): ProviderId {
  if (tab.conversationId) {
    const conversation = plugin.getConversationSync(tab.conversationId);
    if (conversation?.providerId) {
      return resolveRegisteredProviderId(conversation.providerId, plugin);
    }
  }

  if (tab.lifecycleState === 'blank' && tab.draftModel) {
    return getEnabledProviderForModel(
      tab.draftModel,
      plugin.settings,
    );
  }

  return resolveRegisteredProviderId(tab.service?.providerId ?? tab.providerId, plugin);
}

export function getTabProviderId(
  tab: TabProviderContext,
  plugin: TyporAiPlugin,
  conversation?: Conversation | null,
): ProviderId {
  return conversation?.providerId
    ? resolveRegisteredProviderId(conversation.providerId, plugin)
    : getStoredConversationProviderId(tab, plugin);
}
