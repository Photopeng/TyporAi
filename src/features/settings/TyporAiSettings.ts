import type { TyporaHostApp } from '@/typora/platform';
import { Notice, Setting,TyporaSettingsPanel } from '@/typora/platform';

import {
  getHiddenProviderCommands,
  normalizeHiddenCommandList,
} from '../../core/providers/commands/hiddenCommands';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderId } from '../../core/providers/types';
import { getAvailableLocales, getLocaleDisplayName, setLocale, t } from '../../i18n/i18n';
import type { Locale, TranslationKey } from '../../i18n/types';
import type TyporAiPlugin from '../../main';
import { SettingBuilder } from '../../ui/SettingBuilder';
import { setTyporAiTooltip } from '../../ui/Tooltip';
import { formatContextLimit, parseContextLimit, parseEnvironmentVariables } from '../../utils/env';
import { buildNavMappingText, parseNavMappings } from './keyboardNavigation';
import { renderEnvironmentSettingsSection } from './ui/EnvironmentSettingsSection';

type SettingsTabId = string;

export class TyporAiSettingTab extends TyporaSettingsPanel {
  plugin: TyporAiPlugin;
  private activeTab: SettingsTabId = 'general';
  private tabBarContainerEl: HTMLElement | null = null;

  constructor(app: TyporaHostApp, plugin: TyporAiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  setTabBarContainer(container: HTMLElement | null): void {
    this.tabBarContainerEl = container;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('typorai-settings');
    this.tabBarContainerEl?.empty();

    setLocale(this.plugin.settings.locale as Locale);

    const providerTabs = ProviderRegistry.getRegisteredProviderIds();
    const tabIds: SettingsTabId[] = ['general', ...providerTabs];
    if (!tabIds.includes(this.activeTab)) {
      this.activeTab = 'general';
    }

    const tabBarHost = this.tabBarContainerEl ?? containerEl;
    const tabBar = tabBarHost.createDiv({ cls: 'typorai-settings-tabs' });
    const tabButtons = new Map<SettingsTabId, HTMLButtonElement>();
    const tabContents = new Map<SettingsTabId, HTMLDivElement>();

    for (const id of tabIds) {
      const label = id === 'general'
        ? t('settings.tabs.general' as TranslationKey)
        : ProviderRegistry.getProviderDisplayName(id);
      const button = tabBar.createEl('button', {
        cls: `typorai-settings-tab${id === this.activeTab ? ' typorai-settings-tab--active' : ''}`,
        text: label,
      });
      button.addEventListener('click', () => {
        this.activeTab = id;
        for (const tabId of tabIds) {
          tabButtons.get(tabId)?.toggleClass('typorai-settings-tab--active', tabId === id);
          tabContents.get(tabId)?.toggleClass('typorai-settings-tab-content--active', tabId === id);
        }
      });
      tabButtons.set(id, button);
    }

    for (const id of tabIds) {
      const content = containerEl.createDiv({
        cls: `typorai-settings-tab-content${id === this.activeTab ? ' typorai-settings-tab-content--active' : ''}`,
      });
      tabContents.set(id, content);
    }

    this.renderGeneralTab(tabContents.get('general')!);

    for (const providerId of providerTabs) {
      const content = tabContents.get(providerId);
      if (!content) {
        continue;
      }

      ProviderWorkspaceRegistry.getSettingsTabRenderer(providerId)?.render(content, {
        plugin: this.plugin,
        renderHiddenProviderCommandSetting: (
          target,
          targetProviderId,
          copy,
        ) => this.renderHiddenProviderCommandSetting(target, targetProviderId, copy),
        refreshModelSelectors: () => {
          for (const view of this.plugin.getAllViews()) {
            view.refreshModelSelector();
          }
        },
        renderCustomContextLimits: (target, providerId) => this.renderCustomContextLimits(target, providerId),
      });
    }
  }

  private renderGeneralTab(container: HTMLElement): void {
    const nativeSettings = new SettingBuilder(container);
    const localeOptions = getAvailableLocales().map((locale) => ({
      value: locale,
      label: getLocaleDisplayName(locale),
    }));
    const localeSelect = nativeSettings.select(
      t('settings.language.name'),
      this.plugin.settings.locale,
      localeOptions,
      (value) => {
        const locale = value as Locale;
        if (!setLocale(locale)) {
          localeSelect.value = this.plugin.settings.locale;
          return;
        }
        this.plugin.settings.locale = locale;
        void this.plugin.saveSettings().then(() => {
          for (const view of this.plugin.getAllViews()) {
            view.refreshLocalizedUI();
          }
          const modal = this.tabBarContainerEl?.closest('.typorai-typora-settings-modal');
          modal?.querySelector<HTMLElement>('.typorai-typora-settings-close')
            ?.setAttribute('aria-label', t('common.close'));
          this.display();
        });
      },
      t('settings.language.desc'),
    );

    // --- Display ---

    nativeSettings.heading(t('settings.display'));

    const maxTabsWarningEl = container.createDiv({
      cls: 'typorai-max-tabs-warning typorai-setting-validation typorai-setting-validation-warning typorai-hidden',
    });
    maxTabsWarningEl.setText(t('settings.maxTabs.warning'));

    const updateMaxTabsWarning = (value: number): void => {
      maxTabsWarningEl.toggleClass('typorai-hidden', value <= 5);
    };

    nativeSettings.range(
      t('settings.maxTabs.name'),
      this.plugin.settings.maxTabs ?? 3,
      { min: 3, max: 10, step: 1 },
      (value) => {
        this.plugin.settings.maxTabs = value;
        void this.plugin.saveSettings();
        updateMaxTabsWarning(value);
        for (const view of this.plugin.getAllViews()) {
          view.refreshTabControls();
        }
      },
      t('settings.maxTabs.desc'),
    );
    updateMaxTabsWarning(this.plugin.settings.maxTabs ?? 3);

    nativeSettings.toggle(
      t('settings.enableAutoScroll.name'),
      this.plugin.settings.enableAutoScroll ?? true,
      (value) => {
        this.plugin.settings.enableAutoScroll = value;
        void this.plugin.saveSettings();
      },
      t('settings.enableAutoScroll.desc'),
    );

    nativeSettings.toggle(
      t('settings.deferMathRenderingDuringStreaming.name'),
      this.plugin.settings.deferMathRenderingDuringStreaming ?? true,
      (value) => {
        this.plugin.settings.deferMathRenderingDuringStreaming = value;
        void this.plugin.saveSettings();
      },
      t('settings.deferMathRenderingDuringStreaming.desc'),
    );

    nativeSettings.toggle(
      t('settings.expandFileEditsByDefault.name'),
      this.plugin.settings.expandFileEditsByDefault ?? false,
      (value) => {
        this.plugin.settings.expandFileEditsByDefault = value;
        void this.plugin.saveSettings();
      },
      t('settings.expandFileEditsByDefault.desc'),
    );

    // --- Conversations ---

    nativeSettings.heading(t('settings.conversations'));

    nativeSettings.toggle(
      t('settings.autoTitle.name'),
      this.plugin.settings.enableAutoTitleGeneration,
      (value) => {
        this.plugin.settings.enableAutoTitleGeneration = value;
        void this.plugin.saveSettings().then(() => this.display());
      },
      t('settings.autoTitle.desc'),
    );

    if (this.plugin.settings.enableAutoTitleGeneration) {
      const titleModelOptions = [{ value: '', label: t('settings.titleModel.auto') }];
      const settingsBag = this.plugin.settings as unknown as Record<string, unknown>;
      const seenValues = new Set<string>();
      for (const providerId of ProviderRegistry.getRegisteredProviderIds()) {
        const uiConfig = ProviderRegistry.getChatUIConfig(providerId);
        for (const model of uiConfig.getModelOptions(settingsBag)) {
          if (!seenValues.has(model.value)) {
            seenValues.add(model.value);
            titleModelOptions.push({ value: model.value, label: model.label });
          }
        }
      }
      nativeSettings.select(
        t('settings.titleModel.name'),
        this.plugin.settings.titleGenerationModel || '',
        titleModelOptions,
        (value) => {
          this.plugin.settings.titleGenerationModel = value;
          void this.plugin.saveSettings();
        },
        t('settings.titleModel.desc'),
      );
    }

    // --- Content ---

    nativeSettings.heading(t('settings.content'));

    const userNameInput = nativeSettings.text(
      t('settings.userName.name'),
      this.plugin.settings.userName,
      (value) => {
        this.plugin.settings.userName = value;
        void this.plugin.saveSettings();
      },
      t('settings.userName.desc'),
    );
    userNameInput.placeholder = t('settings.userName.name');
    userNameInput.addEventListener('blur', () => { void this.restartServiceForPromptChange(); });

    const systemPromptInput = nativeSettings.textarea(
      t('settings.systemPrompt.name'),
      this.plugin.settings.systemPrompt,
      (value) => {
        this.plugin.settings.systemPrompt = value;
        void this.plugin.saveSettings();
      },
      t('settings.systemPrompt.desc'),
    );
    systemPromptInput.placeholder = t('settings.systemPrompt.name');
    systemPromptInput.rows = 6;
    systemPromptInput.cols = 50;
    systemPromptInput.addEventListener('blur', () => { void this.restartServiceForPromptChange(); });

    const excludedTagsInput = nativeSettings.textarea(
      t('settings.excludedTags.name'),
      this.plugin.settings.excludedTags.join('\n'),
      (value) => {
        this.plugin.settings.excludedTags = value
          .split(/\r?\n/)
          .map((entry) => entry.trim().replace(/^#/, ''))
          .filter((entry) => entry.length > 0);
        void this.plugin.saveSettings();
      },
      t('settings.excludedTags.desc'),
    );
    excludedTagsInput.placeholder = 'System\nprivate\ndraft';
    excludedTagsInput.rows = 4;
    excludedTagsInput.cols = 30;

    const mediaFolderInput = nativeSettings.text(
      t('settings.mediaFolder.name'),
      this.plugin.settings.mediaFolder,
      (value) => {
        this.plugin.settings.mediaFolder = value.trim();
        void this.plugin.saveSettings();
      },
      t('settings.mediaFolder.desc'),
    );
    mediaFolderInput.placeholder = 'Attachments';
    mediaFolderInput.addClass('typorai-settings-media-input');
    mediaFolderInput.addEventListener('blur', () => { void this.restartServiceForPromptChange(); });

    // --- Input ---

    nativeSettings.heading(t('settings.input'));

    nativeSettings.toggle(
      t('settings.requireCommandOrControlEnterToSend.name'),
      this.plugin.settings.requireCommandOrControlEnterToSend ?? false,
      (value) => {
        this.plugin.settings.requireCommandOrControlEnterToSend = value;
        void this.plugin.saveSettings();
      },
      t('settings.requireCommandOrControlEnterToSend.desc'),
    );

    let pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
    let saveTimeout: number | null = null;
    const navMappingsInput = nativeSettings.textarea(
      t('settings.navMappings.name'),
      pendingValue,
      (value) => {
        pendingValue = value;
        if (saveTimeout !== null) window.clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => { void commitNavMappings(false); }, 500);
      },
      t('settings.navMappings.desc'),
    );
    const commitNavMappings = async (showError: boolean): Promise<void> => {
      if (saveTimeout !== null) {
        window.clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      const result = parseNavMappings(pendingValue);
      if (!result.settings) {
        if (showError) {
          new Notice(`${t('common.error')}: ${result.error}`);
          pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
          navMappingsInput.value = pendingValue;
        }
        return;
      }
      this.plugin.settings.keyboardNavigation.scrollUpKey = result.settings.scrollUp;
      this.plugin.settings.keyboardNavigation.scrollDownKey = result.settings.scrollDown;
      this.plugin.settings.keyboardNavigation.focusInputKey = result.settings.focusInput;
      await this.plugin.saveSettings();
      pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
      navMappingsInput.value = pendingValue;
    };
    navMappingsInput.placeholder = 'Map w scrollup\nmap s scrolldown\nmap i focusinput';
    navMappingsInput.rows = 3;
    navMappingsInput.addEventListener('blur', () => { void commitNavMappings(true); });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: this.plugin,
      scope: 'shared',
      heading: t('settings.environment'),
      name: 'Shared environment',
      desc: 'Provider-neutral runtime variables shared across all providers. Use this for PATH, proxy, cert, and temp variables.',
      placeholder: 'PATH=/opt/homebrew/bin:/usr/local/bin\nHTTPS_PROXY=http://proxy.example.com:8080\nSSL_CERT_FILE=/path/to/cert.pem',
      renderCustomContextLimits: (target) => this.renderCustomContextLimits(target),
    });
  }

  private renderHiddenProviderCommandSetting(
    container: HTMLElement,
    providerId: ProviderId,
    copy: { name: string; desc: string; placeholder: string },
  ): void {
    new Setting(container)
      .setName(copy.name)
      .setDesc(copy.desc)
      .addTextArea((text) => {
        text
          .setPlaceholder(copy.placeholder)
          .setValue(getHiddenProviderCommands(this.plugin.settings, providerId).join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.hiddenProviderCommands = {
              ...this.plugin.settings.hiddenProviderCommands,
              [providerId]: normalizeHiddenCommandList(value.split(/\r?\n/)),
            };
            await this.plugin.saveSettings();
            this.plugin.getView()?.updateHiddenProviderCommands();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
      });
  }

  private renderCustomContextLimits(container: HTMLElement, providerId?: ProviderId): void {
    container.empty();

    const uniqueModelIds = new Set<string>();
    const providerIds = providerId
      ? [providerId]
      : ProviderRegistry.getRegisteredProviderIds();

    for (const targetProviderId of providerIds) {
      const envVars = parseEnvironmentVariables(
        this.plugin.getActiveEnvironmentVariables(targetProviderId),
      );
      for (const modelId of ProviderRegistry.getChatUIConfig(targetProviderId).getCustomModelIds(envVars)) {
        uniqueModelIds.add(modelId);
      }
    }

    if (uniqueModelIds.size === 0) {
      return;
    }

    const headerEl = container.createDiv({ cls: 'typorai-context-limits-header' });
    headerEl.createSpan({
      text: t('settings.customModelOverrides.name'),
      cls: 'typorai-context-limits-label',
    });

    const descEl = container.createDiv({ cls: 'typorai-context-limits-desc' });
    descEl.setText(t('settings.customModelOverrides.desc'));

    const listEl = container.createDiv({ cls: 'typorai-context-limits-list' });

    for (const modelId of uniqueModelIds) {
      const currentValue = this.plugin.settings.customContextLimits?.[modelId];
      const currentAlias = this.plugin.settings.customModelAliases?.[modelId] ?? '';

      const itemEl = listEl.createDiv({ cls: 'typorai-context-limits-item' });
      const nameEl = itemEl.createDiv({ cls: 'typorai-context-limits-model' });
      nameEl.setText(modelId);

      const inputWrapper = itemEl.createDiv({ cls: 'typorai-context-limits-input-wrapper' });
      const aliasInputEl = inputWrapper.createEl('input', {
        type: 'text',
        placeholder: t('settings.customModelAliases.placeholder'),
        cls: 'typorai-context-alias-input',
        value: currentAlias,
      });
      aliasInputEl.setAttribute('aria-label', t('settings.customModelAliases.ariaLabel', { modelId }));
      setTyporAiTooltip(aliasInputEl, t('settings.customModelAliases.aliasTitle'));

      const inputEl = inputWrapper.createEl('input', {
        type: 'text',
        placeholder: '200k',
        cls: 'typorai-context-limits-input',
        value: currentValue ? formatContextLimit(currentValue) : '',
      });
      inputEl.setAttribute('aria-label', t('settings.customContextLimits.ariaLabel', { modelId }));

      const validationEl = inputWrapper.createDiv({ cls: 'typorai-context-limit-validation typorai-hidden' });

      const saveAlias = async (): Promise<void> => {
        if (!this.plugin.settings.customModelAliases) {
          this.plugin.settings.customModelAliases = {};
        }

        const existing = this.plugin.settings.customModelAliases[modelId] ?? '';
        const trimmed = aliasInputEl.value.trim();
        if (trimmed === existing) {
          aliasInputEl.value = existing;
          return;
        }

        if (trimmed) {
          this.plugin.settings.customModelAliases[modelId] = trimmed;
        } else {
          delete this.plugin.settings.customModelAliases[modelId];
        }

        await this.plugin.saveSettings();
        for (const view of this.plugin.getAllViews()) {
          view.refreshModelSelector();
        }
      };

      const saveContextLimit = async (): Promise<void> => {
        const trimmed = inputEl.value.trim();

        if (!this.plugin.settings.customContextLimits) {
          this.plugin.settings.customContextLimits = {};
        }

        if (!trimmed) {
          delete this.plugin.settings.customContextLimits[modelId];
          validationEl.toggleClass('typorai-hidden', true);
          inputEl.classList.remove('typorai-input-error');
        } else {
          const parsed = parseContextLimit(trimmed);
          if (parsed === null) {
            validationEl.setText(t('settings.customContextLimits.invalid'));
            validationEl.toggleClass('typorai-hidden', false);
            inputEl.classList.add('typorai-input-error');
            return;
          }

          this.plugin.settings.customContextLimits[modelId] = parsed;
          validationEl.toggleClass('typorai-hidden', true);
          inputEl.classList.remove('typorai-input-error');
        }

        await this.plugin.saveSettings();
      };

      inputEl.addEventListener('input', () => {
        void saveContextLimit();
      });
      aliasInputEl.addEventListener('blur', () => {
        void saveAlias();
      });
      aliasInputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          aliasInputEl.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          aliasInputEl.value = this.plugin.settings.customModelAliases?.[modelId] ?? '';
          aliasInputEl.blur();
        }
      });
    }
  }

  private async restartServiceForPromptChange(): Promise<void> {
    const view = this.plugin.getView();
    const tabManager = view?.getTabManager();
    if (!tabManager) return;

    try {
      await tabManager.broadcastToAllTabs(
        async (service) => { await service.ensureReady({ force: true }); }
      );
    } catch {
      // Changes will apply on the next conversation if the restart fails.
    }
  }
}
