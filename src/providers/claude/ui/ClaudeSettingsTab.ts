import { testMcpServer } from '../../../core/mcp/McpTester';
import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { renderCliProviderSelectionSection } from '../../../features/settings/ui/CliProviderSelectionSection';
import { McpSettingsManager } from '../../../features/settings/ui/McpSettingsManager';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getClaudeWorkspaceServices } from '../app/ClaudeWorkspaceServices';
import { resolveClaudeModelSelection } from '../modelOptions';
import {
  CLAUDE_SAFE_MODES,
  type ClaudeSafeMode,
  getClaudeProviderSettings,
  updateClaudeProviderSettings,
} from '../settings';
import { AgentSettings } from './AgentSettings';
import { claudeChatUIConfig } from './ClaudeChatUIConfig';
import { PluginSettingsManager } from './PluginSettingsManager';
import { SlashCommandSettings } from './SlashCommandSettings';

export const claudeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const claudeWorkspace = getClaudeWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const claudeSettings = getClaudeProviderSettings(settingsBag);
    const settings = new SettingBuilder(container);

    const reconcileActiveClaudeModelSelection = (): void => {
      const activeProvider = settingsBag.settingsProvider;
      if (activeProvider !== undefined && activeProvider !== 'claude') {
        return;
      }

      const currentModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
      const nextModel = resolveClaudeModelSelection(settingsBag, currentModel);
      if (!nextModel || nextModel === currentModel) {
        return;
      }

      settingsBag.model = nextModel;
      claudeChatUIConfig.applyModelDefaults(nextModel, settingsBag);
    };

    // --- Setup ---

    settings.heading(t('settings.setup'));

    renderCliProviderSelectionSection(
      container, settingsBag, () => context.plugin.saveSettings(), context.refreshModelSelectors,
    );

    const hostnameKey = getHostnameKey();
    const platformDesc = context.platform === 'windows'
      ? t('settings.cliPath.descWindows')
      : t('settings.cliPath.descUnix');
    const cliPathDescription = `${t('settings.cliPath.desc')} ${platformDesc}`;

    const validationEl = container.ownerDocument.createElement('div');
    validationEl.className = 'typorai-cli-path-validation typorai-setting-validation typorai-setting-validation-error typorai-hidden';
    container.append(validationEl);

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const expandedPath = expandHomePath(trimmed);

      if (context.fileProbe && !context.fileProbe.exists(expandedPath)) {
        return t('settings.cliPath.validation.notExist');
      }
      if (context.fileProbe && !context.fileProbe.isFile(expandedPath)) {
        return t('settings.cliPath.validation.isDirectory');
      }
      return null;
    };

    const updateCliPathValidation = (value: string, inputEl?: HTMLInputElement): boolean => {
      const error = validatePath(value);
      if (error) {
        validationEl.textContent = error;
        validationEl.classList.remove('typorai-hidden');
        if (inputEl) {
          inputEl.classList.add('typorai-input-error');
        }
        return false;
      }

      validationEl.classList.add('typorai-hidden');
      if (inputEl) {
        inputEl.classList.remove('typorai-input-error');
      }
      return true;
    };

    const currentValue = claudeSettings.cliPathsByHost[hostnameKey] || '';
    const cliPathsByHost = { ...claudeSettings.cliPathsByHost };
    let cliPathInputEl: HTMLInputElement | null = null;

    const persistCliPath = async (value: string): Promise<boolean> => {
      const isValid = updateCliPathValidation(value, cliPathInputEl ?? undefined);
      if (!isValid) {
        return false;
      }

      const trimmed = value.trim();
      if (trimmed) {
        cliPathsByHost[hostnameKey] = trimmed;
      } else {
        delete cliPathsByHost[hostnameKey];
      }

      updateClaudeProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      claudeWorkspace.cliResolver.reset();
      const view = context.plugin.getView();
      await view?.getTabManager()?.broadcastToAllTabs(
        (service) => Promise.resolve(service.cleanup())
      );
      return true;
    };

    const placeholder = context.platform === 'windows'
      ? 'D:\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli-wrapper.cjs'
      : '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli-wrapper.cjs';
    cliPathInputEl = settings.text(
      t('settings.cliPath.name'), currentValue,
      async (value) => { await persistCliPath(value); }, cliPathDescription,
    );
    cliPathInputEl.placeholder = placeholder;
    cliPathInputEl.classList.add('typorai-settings-cli-path-input');
    updateCliPathValidation(currentValue, cliPathInputEl);

    // --- Safety ---

    settings.heading(t('settings.safety'));

    settings.select(
      t('settings.claudeSafeMode.name'), claudeSettings.safeMode,
      CLAUDE_SAFE_MODES.map(value => ({ value, label: value })),
      async (value) => {
        updateClaudeProviderSettings(settingsBag, { safeMode: value as ClaudeSafeMode });
        await context.plugin.saveSettings();
      },
      t('settings.claudeSafeMode.desc'),
    );

    settings.toggle(
      t('settings.loadUserSettings.name'), claudeSettings.loadUserSettings,
      async (value) => {
        updateClaudeProviderSettings(settingsBag, { loadUserSettings: value });
        await context.plugin.saveSettings();
      },
      t('settings.loadUserSettings.desc'),
    );

    // --- Models ---

    settings.heading(t('settings.models'));

    settings.toggle(
      t('settings.enableOpus1M.name'), claudeSettings.enableOpus1M,
      async (value) => {
        updateClaudeProviderSettings(settingsBag, { enableOpus1M: value });
        context.plugin.normalizeModelVariantSettings();
        await context.plugin.saveSettings();
        context.refreshModelSelectors();
      },
      t('settings.enableOpus1M.desc'),
    );

    settings.toggle(
      t('settings.enableSonnet1M.name'), claudeSettings.enableSonnet1M,
      async (value) => {
        updateClaudeProviderSettings(settingsBag, { enableSonnet1M: value });
        context.plugin.normalizeModelVariantSettings();
        await context.plugin.saveSettings();
        context.refreshModelSelectors();
      },
      t('settings.enableSonnet1M.desc'),
    );

    {
        let pendingCustomModels = claudeSettings.customModels;
        let savedCustomModels = claudeSettings.customModels;

        const commitCustomModels = async (): Promise<void> => {
          const previousCustomModels = savedCustomModels;
          const previousModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
          const previousTitleModel = typeof settingsBag.titleGenerationModel === 'string'
            ? settingsBag.titleGenerationModel
            : '';

          if (pendingCustomModels !== savedCustomModels) {
            updateClaudeProviderSettings(settingsBag, { customModels: pendingCustomModels });
            savedCustomModels = pendingCustomModels;
          }

          reconcileActiveClaudeModelSelection();
          const didReconcileTitleModel = ProviderSettingsCoordinator
            .reconcileTitleGenerationModelSelection(settingsBag);
          const nextModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
          const nextTitleModel = typeof settingsBag.titleGenerationModel === 'string'
            ? settingsBag.titleGenerationModel
            : '';
          const didModelSelectionChange = previousModel !== nextModel;
          const didCustomModelsChange = previousCustomModels !== savedCustomModels;

          if (!didCustomModelsChange && !didModelSelectionChange && !didReconcileTitleModel
            && previousTitleModel === nextTitleModel) {
            return;
          }

          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        };

        const text = settings.textarea(
          t('settings.customModels.name'), claudeSettings.customModels,
          value => { pendingCustomModels = value; }, t('settings.customModels.desc'),
        );
        text.placeholder = t('settings.customModels.placeholder');
        text.rows = 6;
        text.cols = 40;
        text.addEventListener('blur', () => {
          void commitCustomModels();
        });
    }

    // --- Slash Commands ---

    settings.heading(t('settings.slashCommands.name'));
    const slashCommandsDesc = container.ownerDocument.createElement('p');
    slashCommandsDesc.className = 'typorai-sp-settings-desc setting-item-description';
    slashCommandsDesc.append(`${t('settings.slashCommands.desc')} `);
    const learnMore = container.ownerDocument.createElement('a');
    learnMore.textContent = t('settings.claude.slashCommands.learnMore');
    learnMore.href = 'https://code.claude.com/docs/en/skills';
    slashCommandsDesc.append(learnMore);
    const slashCommandsContainer = container.ownerDocument.createElement('div');
    slashCommandsContainer.className = 'typorai-slash-commands-container';
    container.append(slashCommandsDesc, slashCommandsContainer);
    new SlashCommandSettings(
      slashCommandsContainer,
      claudeWorkspace.commandCatalog,
    );

    context.renderHiddenProviderCommandSetting(container, 'claude', {
      name: t('settings.hiddenSlashCommands.name'),
      desc: t('settings.hiddenSlashCommands.desc'),
      placeholder: t('settings.hiddenSlashCommands.placeholder'),
    });

    // --- Subagents ---

    settings.heading(t('settings.subagents.name'));
    const agentsDesc = container.ownerDocument.createElement('p');
    agentsDesc.className = 'typorai-sp-settings-desc setting-item-description';
    agentsDesc.textContent = t('settings.subagents.desc');
    const agentsContainer = container.ownerDocument.createElement('div');
    agentsContainer.className = 'typorai-agents-container';
    container.append(agentsDesc, agentsContainer);
    new AgentSettings(agentsContainer, {
      agentManager: claudeWorkspace.agentManager,
      agentStorage: claudeWorkspace.agentStorage,
    });

    // --- MCP Servers ---

    settings.heading(t('settings.mcpServers.name'));
    const mcpDesc = container.ownerDocument.createElement('p');
    mcpDesc.className = 'typorai-mcp-settings-desc setting-item-description';
    mcpDesc.textContent = t('settings.mcpServers.desc');
    const mcpContainer = container.ownerDocument.createElement('div');
    mcpContainer.className = 'typorai-mcp-container';
    container.append(mcpDesc, mcpContainer);
    new McpSettingsManager(mcpContainer, {
      mcpStorage: claudeWorkspace.mcpStorage,
      testServer: testMcpServer,
      broadcastMcpReload: async () => {
        for (const view of context.plugin.getAllViews()) {
          await view.getTabManager()?.broadcastToAllTabs(
            (service) => service.reloadMcpServers(),
          );
        }
      },
    });

    // --- Plugins ---

    settings.heading(t('settings.plugins.name'));
    const pluginsDesc = container.ownerDocument.createElement('p');
    pluginsDesc.className = 'typorai-plugin-settings-desc setting-item-description';
    pluginsDesc.textContent = t('settings.plugins.desc');
    const pluginsContainer = container.ownerDocument.createElement('div');
    pluginsContainer.className = 'typorai-plugins-container';
    container.append(pluginsDesc, pluginsContainer);
    new PluginSettingsManager(pluginsContainer, {
      pluginManager: claudeWorkspace.pluginManager,
      agentManager: claudeWorkspace.agentManager,
      restartTabs: async () => {
        const view = context.plugin.getView();
        const tabManager = view?.getTabManager();
        if (!tabManager) {
          return;
        }

        await tabManager.broadcastToAllTabs(
          async (service) => { await service.ensureReady({ force: true }); },
        );
      },
    });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:claude',
      heading: t('settings.environment'),
      name: t('settings.customVariables.name'),
      desc: t('settings.claude.customVariables.desc'),
      placeholder: t('settings.claude.customVariables.placeholder'),
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'claude'),
    });

    // --- Experimental ---

    settings.heading(t('settings.experimental'));

    settings.toggle(
      t('settings.enableChrome.name'), claudeSettings.enableChrome,
      async (value) => {
        updateClaudeProviderSettings(settingsBag, { enableChrome: value });
        await context.plugin.saveSettings();
      },
      t('settings.enableChrome.desc'),
    );

    const bangBashValidationEl = container.ownerDocument.createElement('div');
    bangBashValidationEl.className = 'typorai-bang-bash-validation typorai-setting-validation typorai-setting-validation-error typorai-hidden';
    container.append(bangBashValidationEl);
    const bangBashToggle = settings.toggle(
      t('settings.enableBangBash.name'), claudeSettings.enableBangBash,
      async (value) => {
        bangBashValidationEl.classList.add('typorai-hidden');
        if (value) {
          const { findNodeExecutable, getEnhancedPath } = await import('../../../utils/env');
          const nodePath = findNodeExecutable(getEnhancedPath());
          if (!nodePath) {
            bangBashValidationEl.textContent = t('settings.enableBangBash.validation.noNode');
            bangBashValidationEl.classList.remove('typorai-hidden');
            bangBashToggle.checked = false;
            return;
          }
        }
        updateClaudeProviderSettings(settingsBag, { enableBangBash: value });
        await context.plugin.saveSettings();
      },
      t('settings.enableBangBash.desc'),
    );
  },
};
