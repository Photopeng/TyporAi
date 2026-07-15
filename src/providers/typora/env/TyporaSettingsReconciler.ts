import type { ProviderSettingsReconciler } from '../../../core/providers/types';

export const typoraSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment() {
    return { changed: false, invalidatedConversations: [] };
  },

  normalizeModelVariantSettings() {
    return false;
  },
};
