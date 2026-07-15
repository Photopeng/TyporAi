import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import {
  getTyporaProviderSettings,
  type TyporaProviderSettings,
  updateTyporaProviderSettings,
} from '../settings';

export const typoraSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const typoraSettings = getTyporaProviderSettings(settingsBag);

    const recycleTyporaRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('typora', (service) => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(
            (service) => Promise.resolve(service.cleanup()),
          );
        }
        view.refreshModelSelector?.();
      }
    };

    const persist = async (updates: Partial<TyporaProviderSettings>, options: {
      refreshModels?: boolean;
      recycleRuntime?: boolean;
    } = {}): Promise<void> => {
      updateTyporaProviderSettings(settingsBag, updates);
      await context.plugin.saveSettings();
      if (options.refreshModels) {
        context.refreshModelSelectors();
      }
      if (options.recycleRuntime) {
        await recycleTyporaRuntime();
      }
    };

    const settings = new SettingBuilder(container);
    settings.heading(t('settings.typora.setup.heading'));
    settings.toggle(
      t('settings.typora.enable.name'),
      typoraSettings.enabled,
      async (enabled) => {
        await persist({ enabled }, { refreshModels: true });
      },
      t('settings.typora.enable.desc'),
    );

    const apiSectionEl = container.ownerDocument.createElement('div');
    apiSectionEl.className = 'typorai-typora-api-settings';
    container.append(apiSectionEl);
    renderApiSettings(apiSectionEl, typoraSettings, persist);
  },
};

function renderApiSettings(
  container: HTMLElement,
  typoraSettings: TyporaProviderSettings,
  persist: (updates: Partial<TyporaProviderSettings>, options?: {
    refreshModels?: boolean;
    recycleRuntime?: boolean;
  }) => Promise<void>,
): void {
  const settings = new SettingBuilder(container);
  settings.heading(t('settings.typora.api.heading'));

  const apiKey = settings.text(
    t('settings.typora.apiKey.name'),
    typoraSettings.apiKey,
    async (value) => {
      await persist({ apiKey: value }, { recycleRuntime: true });
    },
    t('settings.typora.apiKey.desc'),
  );
  apiKey.type = 'password';
  apiKey.placeholder = 'sk-ant-...';
  apiKey.classList.add('typorai-settings-api-key-input');

  const apiBaseUrl = settings.text(
    t('settings.typora.apiBaseUrl.name'),
    typoraSettings.apiBaseUrl,
    async (value) => {
      await persist({ apiBaseUrl: value }, { recycleRuntime: true });
    },
    t('settings.typora.apiBaseUrl.desc'),
  );
  apiBaseUrl.placeholder = 'https://api.anthropic.com/v1/messages';
  apiBaseUrl.classList.add('typorai-settings-url-input');

  const apiModel = settings.text(
    t('settings.typora.apiModel.name'),
    typoraSettings.apiModel,
    async (value) => {
      await persist({ apiModel: value }, { refreshModels: true, recycleRuntime: true });
    },
    t('settings.typora.apiModel.desc'),
  );
  apiModel.placeholder = 'claude-sonnet-4-20250514';
  apiModel.classList.add('typorai-settings-model-input');
}
