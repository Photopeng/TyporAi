import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { typoraSettingsTabRenderer } from '../ui/TyporaSettingsTab';

export type TyporaWorkspaceServices = ProviderWorkspaceServices;

export async function createTyporaWorkspaceServices(): Promise<TyporaWorkspaceServices> {
  return {
    settingsTabRenderer: typoraSettingsTabRenderer,
  };
}

export const typoraWorkspaceRegistration: ProviderWorkspaceRegistration<TyporaWorkspaceServices> = {
  initialize: async () => createTyporaWorkspaceServices(),
};
