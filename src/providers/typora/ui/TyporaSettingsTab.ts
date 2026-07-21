import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { testApiConnection } from '../../../engines/api-engine/ApiEngine';
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
    renderApiSettings(apiSectionEl, settingsBag, typoraSettings, persist);
  },
};

function renderApiSettings(
  container: HTMLElement,
  settingsBag: Record<string, unknown>,
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

  settings.select(
    t('settings.typora.apiProtocol.name'),
    typoraSettings.apiProtocol ?? 'auto',
    [
      { value: 'auto', label: t('settings.typora.apiProtocol.auto') },
      { value: 'anthropic', label: t('settings.typora.apiProtocol.anthropic') },
      { value: 'openai', label: t('settings.typora.apiProtocol.openai') },
    ],
    async (value) => {
      await persist({
        apiProtocol: value === 'anthropic' || value === 'openai' ? value : 'auto',
      }, { recycleRuntime: true });
    },
    t('settings.typora.apiProtocol.desc'),
  );

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

  const testField = container.ownerDocument.createElement('div');
  testField.className = 'setting-item';
  const info = container.ownerDocument.createElement('div');
  info.className = 'setting-item-info';
  const name = container.ownerDocument.createElement('div');
  name.className = 'setting-item-name';
  name.textContent = t('settings.typora.connectionTest.name');
  const description = container.ownerDocument.createElement('div');
  description.className = 'setting-item-description';
  description.textContent = t('settings.typora.connectionTest.desc');
  info.append(name, description);
  const control = container.ownerDocument.createElement('div');
  control.className = 'setting-item-control';
  const button = container.ownerDocument.createElement('button');
  button.type = 'button';
  button.textContent = t('settings.typora.connectionTest.button');
  const result = container.ownerDocument.createElement('div');
  result.className = 'typorai-setting-validation typorai-hidden';
  control.append(button, result);
  testField.append(info, control);
  container.append(testField);

  button.addEventListener('click', () => {
    void (async () => {
      button.disabled = true;
      result.textContent = t('settings.typora.connectionTest.running');
      result.classList.remove('typorai-hidden');
      try {
        const current = getTyporaProviderSettings(settingsBag);
        const outcome = await testApiConnection(current);
        result.textContent = t('settings.typora.connectionTest.success', {
          latency: outcome.latencyMs,
          protocol: outcome.endpoint.protocol,
        });
      } catch (error) {
        result.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        button.disabled = false;
      }
    })();
  });
}
