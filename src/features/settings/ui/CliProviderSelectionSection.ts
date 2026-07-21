import { clearEnabledCliProviders, isCliProviderId, setSingleEnabledCliProvider } from '../../../core/providers/cliProviderSelection';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';

export function renderCliProviderSelectionSection(
  container: HTMLElement,
  settings: Record<string, unknown>,
  save: () => Promise<void>,
  refreshModels: () => void,
): void {
  const builder = new SettingBuilder(container);
  const active = isCliProviderId(settings.settingsProvider as any)
    ? settings.settingsProvider as string
    : 'none';
  builder.select(
    t('settings.cliProvider.name'),
    active,
    [
      { value: 'none', label: t('settings.cliProvider.none') },
      { value: 'claude', label: 'Claude' },
      { value: 'codex', label: 'Codex' },
      { value: 'opencode', label: 'OpenCode' },
    ],
    async (value) => {
      if (value === 'none') clearEnabledCliProviders(settings);
      else if (isCliProviderId(value as any)) setSingleEnabledCliProvider(settings, value as any, true);
      await save();
      refreshModels();
    },
    t('settings.cliProvider.desc'),
  );
}
