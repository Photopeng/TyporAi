import {
  clearEnabledCliProviders,
  CLI_PROVIDER_IDS,
  isCliProviderId,
  setSingleEnabledCliProvider,
} from '../../../core/providers/cliProviderSelection';
import { getProviderConfig } from '../../../core/providers/providerConfig';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';

export function renderCliProviderSelectionSection(
  container: HTMLElement,
  settings: Record<string, unknown>,
  save: () => Promise<void>,
  refreshModels: () => void,
  restartProvider: () => Promise<void>,
): void {
  const builder = new SettingBuilder(container);
  const active = isCliProviderId(settings.settingsProvider as any)
    ? settings.settingsProvider as string
    : CLI_PROVIDER_IDS.find(providerId => getProviderConfig(settings, providerId).enabled === true) ?? 'none';
  const feedback = container.ownerDocument.createElement('p');
  feedback.className = 'setting-item-description typorai-cli-provider-feedback typorai-hidden';
  feedback.setAttribute('role', 'status');

  const selector = builder.select(
    t('settings.cliProvider.name'),
    active,
    [
      { value: 'none', label: t('settings.cliProvider.none') },
      { value: 'claude', label: 'Claude' },
      { value: 'codex', label: 'Codex' },
      { value: 'opencode', label: 'OpenCode' },
    ],
    async (value) => {
      const previousProvider = settings.settingsProvider;
      const previousConfigs = settings.providerConfigs;
      if (value === 'none') clearEnabledCliProviders(settings);
      else if (isCliProviderId(value as any)) setSingleEnabledCliProvider(settings, value as any, true);
      try {
        await save();
        await restartProvider();
        refreshModels();
        feedback.textContent = t('settings.cliProvider.savedAndRestarted');
        feedback.classList.remove('typorai-hidden', 'typorai-setting-validation-error');
      } catch (error) {
        // Keep the displayed choice and in-memory settings aligned if persistence fails.
        settings.settingsProvider = previousProvider;
        settings.providerConfigs = previousConfigs;
        selector.value = active;
        const reason = error instanceof Error ? error.message : String(error);
        feedback.textContent = t('settings.cliProvider.saveFailed', { error: reason });
        feedback.classList.remove('typorai-hidden');
        feedback.classList.add('typorai-setting-validation-error');
      }
    },
    t('settings.cliProvider.desc'),
  );

  container.append(feedback);

  const diagnostic = container.ownerDocument.createElement('p');
  diagnostic.className = 'setting-item-description typorai-cli-provider-status';
  if (active === 'none') {
    diagnostic.textContent = t('common.disabled');
  } else {
    const providerId = active as 'claude' | 'codex' | 'opencode';
    const path = ProviderWorkspaceRegistry.getCliResolver(providerId)
      ?.resolveFromSettings(settings);
    diagnostic.textContent = `${active} · ${t('common.enabled')} · ${path ?? t('common.unknown')}`;
  }
  container.append(diagnostic);
}
