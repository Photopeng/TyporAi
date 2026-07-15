import { setSingleEnabledCliProvider } from '../../../core/providers/cliProviderSelection';
import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getCodexWorkspaceServices } from '../app/CodexWorkspaceServices';
import { parseConfiguredCustomModelIds, resolveCodexModelSelection } from '../modelOptions';
import { toCodexRuntimeModelId } from '../modelSelection';
import { isWindowsStyleCliReference } from '../runtime/CodexBinaryLocator';
import { getCodexProviderSettings, updateCodexProviderSettings } from '../settings';
import { CodexSkillSettings } from './CodexSkillSettings';
import { CodexSubagentSettings } from './CodexSubagentSettings';

export const codexSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const codexWorkspace = getCodexWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const codexSettings = getCodexProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();
    const isWindowsHost = context.platform === 'windows';
    let installationMethod = codexSettings.installationMethod;
    const settings = new SettingBuilder(container);

    const reconcileActiveCodexModelSelection = (): void => {
      const activeProvider = settingsBag.settingsProvider;
      if (activeProvider !== 'codex') {
        return;
      }

      const currentModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
      const nextModel = resolveCodexModelSelection(settingsBag, currentModel);
      if (!nextModel || nextModel === currentModel) {
        return;
      }

      settingsBag.model = nextModel;
    };

    // --- Setup ---

    settings.heading(t('settings.setup'));

    settings.toggle(
      t('settings.codex.enable.name'),
      codexSettings.enabled,
      async (value) => {
        setSingleEnabledCliProvider(settingsBag, 'codex', value);
        await context.plugin.saveSettings();
        context.refreshModelSelectors();
      },
      t('settings.codex.enable.desc'),
    );

    if (isWindowsHost) {
      settings.select(
        t('settings.codex.installationMethod.name'),
        installationMethod,
        [
          { value: 'native-windows', label: t('settings.codex.installationMethod.nativeWindows') },
          { value: 'wsl', label: t('settings.codex.installationMethod.wsl') },
        ],
        async (value) => {
          installationMethod = value === 'wsl' ? 'wsl' : 'native-windows';
          updateCodexProviderSettings(settingsBag, { installationMethod });
          refreshInstallationMethodUI();
          await context.plugin.saveSettings();
        },
        t('settings.codex.installationMethod.desc'),
      );
    }

    const getCliPathCopy = (): { desc: string; placeholder: string } => {
      if (!isWindowsHost) {
        return {
          desc: t('settings.codex.cliPath.descNative'),
          placeholder: t('settings.codex.cliPath.placeholderNative'),
        };
      }

      if (installationMethod === 'wsl') {
        return {
          desc: t('settings.codex.cliPath.descWsl'),
          placeholder: t('settings.codex.cliPath.placeholderWsl'),
        };
      }

      return {
        desc: t('settings.codex.cliPath.descWindows'),
        placeholder: t('settings.codex.cliPath.placeholderWindows'),
      };
    };

    const shouldValidateCliPathAsFile = (): boolean => !isWindowsHost || installationMethod !== 'wsl';

    const validationEl = container.ownerDocument.createElement('div');
    validationEl.className = 'typorai-cli-path-validation typorai-setting-validation typorai-setting-validation-error typorai-hidden';
    container.append(validationEl);

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;

      if (!shouldValidateCliPathAsFile()) {
        if (isWindowsStyleCliReference(trimmed)) {
          return t('settings.codex.cliPath.wslModeError');
        }
        return null;
      }

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

    const cliPathsByHost = { ...codexSettings.cliPathsByHost };
    let cliPathInputEl: HTMLInputElement | null = null;
    let wslDistroSettingEl: HTMLElement | null = null;
    let wslDistroInputEl: HTMLInputElement | null = null;

    const refreshInstallationMethodUI = (): void => {
      const cliCopy = getCliPathCopy();
      const description = cliPathInputEl?.closest('.setting-item')
        ?.querySelector<HTMLElement>('.setting-item-description');
      if (description) description.textContent = cliCopy.desc;
      if (cliPathInputEl) {
        cliPathInputEl.placeholder = cliCopy.placeholder;
        updateCliPathValidation(cliPathInputEl.value, cliPathInputEl);
      }
      if (wslDistroSettingEl) {
        wslDistroSettingEl.classList.toggle('typorai-hidden', installationMethod !== 'wsl');
      }
      if (wslDistroInputEl) {
        wslDistroInputEl.disabled = installationMethod !== 'wsl';
      }
    };

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

      updateCodexProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      const view = context.plugin.getView();
      await view?.getTabManager()?.broadcastToAllTabs(
        (service) => Promise.resolve(service.cleanup())
      );
      return true;
    };

    const currentValue = codexSettings.cliPathsByHost[hostnameKey] || '';

    cliPathInputEl = settings.text(
      t('settings.codex.cliPath.name'),
      currentValue,
      async (value) => { await persistCliPath(value); },
      getCliPathCopy().desc,
    );
    cliPathInputEl.placeholder = getCliPathCopy().placeholder;
    cliPathInputEl.classList.add('typorai-settings-cli-path-input');
    updateCliPathValidation(currentValue, cliPathInputEl);

    if (isWindowsHost) {
      wslDistroInputEl = settings.text(
        t('settings.codex.wslDistro.name'),
        codexSettings.wslDistroOverride,
        async (value) => {
          updateCodexProviderSettings(settingsBag, { wslDistroOverride: value });
          await context.plugin.saveSettings();
        },
        t('settings.codex.wslDistro.desc'),
      );
      wslDistroInputEl.placeholder = t('settings.codex.wslDistro.placeholder');
      wslDistroInputEl.classList.add('typorai-settings-cli-path-input');
      wslDistroInputEl.disabled = installationMethod !== 'wsl';
      wslDistroSettingEl = wslDistroInputEl.closest('.setting-item') as HTMLElement | null;
    }

    refreshInstallationMethodUI();

    // --- Safety ---

    settings.heading(t('settings.safety'));

    settings.select(
      t('settings.codexSafeMode.name'),
      codexSettings.safeMode,
      [
        { value: 'workspace-write', label: t('settings.codex.safeMode.workspaceWrite') },
        { value: 'read-only', label: t('settings.codex.safeMode.readOnly') },
      ],
      async (value) => {
        updateCodexProviderSettings(settingsBag, { safeMode: value as 'workspace-write' | 'read-only' });
        await context.plugin.saveSettings();
      },
      t('settings.codexSafeMode.desc'),
    );

    // --- Models ---

    settings.heading(t('settings.models'));

    const SUMMARY_OPTIONS: { value: string; label: string }[] = [
      { value: 'auto', label: t('settings.codex.reasoningSummary.auto') },
      { value: 'concise', label: t('settings.codex.reasoningSummary.concise') },
      { value: 'detailed', label: t('settings.codex.reasoningSummary.detailed') },
      { value: 'none', label: t('settings.codex.reasoningSummary.none') },
    ];

    {
        let pendingCustomModels = codexSettings.customModels;
        let savedCustomModels = codexSettings.customModels;

        const reconcileInactiveCodexProjection = (
          previousCustomModels: string,
        ): boolean => {
          if (settingsBag.settingsProvider === 'codex') {
            return false;
          }

          const savedProviderModel = (
            settingsBag.savedProviderModel
            && typeof settingsBag.savedProviderModel === 'object'
          )
            ? settingsBag.savedProviderModel as Record<string, unknown>
            : {};
          const currentSavedModel = typeof savedProviderModel.codex === 'string'
            ? savedProviderModel.codex
            : '';
          if (!currentSavedModel) {
            return false;
          }

          const previousCustomModelIds = new Set(parseConfiguredCustomModelIds(previousCustomModels));
          if (!previousCustomModelIds.has(toCodexRuntimeModelId(currentSavedModel))) {
            return false;
          }

          const nextSavedModel = resolveCodexModelSelection(settingsBag, currentSavedModel);
          if (!nextSavedModel || nextSavedModel === currentSavedModel) {
            return false;
          }

          settingsBag.savedProviderModel = {
            ...savedProviderModel,
            codex: nextSavedModel,
          };
          return true;
        };

        const commitCustomModels = async (): Promise<void> => {
          const previousCustomModels = savedCustomModels;
          const previousModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
          const previousTitleModel = typeof settingsBag.titleGenerationModel === 'string'
            ? settingsBag.titleGenerationModel
            : '';

          if (pendingCustomModels !== savedCustomModels) {
            updateCodexProviderSettings(settingsBag, { customModels: pendingCustomModels });
            savedCustomModels = pendingCustomModels;
          }

          reconcileActiveCodexModelSelection();
          const didReconcileInactiveProjection = reconcileInactiveCodexProjection(previousCustomModels);
          const didReconcileTitleModel = ProviderSettingsCoordinator
            .reconcileTitleGenerationModelSelection(settingsBag);
          const nextModel = typeof settingsBag.model === 'string' ? settingsBag.model : '';
          const nextTitleModel = typeof settingsBag.titleGenerationModel === 'string'
            ? settingsBag.titleGenerationModel
            : '';
          const didModelSelectionChange = previousModel !== nextModel;
          const didCustomModelsChange = previousCustomModels !== savedCustomModels;

          if (!didCustomModelsChange && !didModelSelectionChange && !didReconcileInactiveProjection
            && !didReconcileTitleModel
            && previousTitleModel === nextTitleModel) {
            return;
          }

          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        };

        const text = settings.textarea(
          t('settings.customModels.name'),
          codexSettings.customModels,
          value => { pendingCustomModels = value; },
          t('settings.customModels.desc'),
        );
        text.placeholder = t('settings.codex.customModels.placeholder');
        text.rows = 4;
        text.cols = 40;
        text.addEventListener('blur', () => {
          void commitCustomModels();
        });
    }

    settings.select(
      t('settings.codex.reasoningSummary.name'),
      codexSettings.reasoningSummary,
      SUMMARY_OPTIONS,
      async (value) => {
        updateCodexProviderSettings(settingsBag, { reasoningSummary: value as 'auto' | 'concise' | 'detailed' | 'none' });
        await context.plugin.saveSettings();
      },
      t('settings.codex.reasoningSummary.desc'),
    );

    // --- Skills ---

    const codexCatalog = codexWorkspace.commandCatalog;
    if (codexCatalog) {
      settings.heading(t('settings.codex.skills.heading'));
      const skillsDesc = container.ownerDocument.createElement('p');
      skillsDesc.className = 'typorai-sp-settings-desc setting-item-description';
      skillsDesc.textContent = t('settings.codex.skills.desc');
      const skillsContainer = container.ownerDocument.createElement('div');
      skillsContainer.className = 'typorai-slash-commands-container';
      container.append(skillsDesc, skillsContainer);
      new CodexSkillSettings(skillsContainer, codexCatalog);
    }

    context.renderHiddenProviderCommandSetting(container, 'codex', {
      name: t('settings.codex.hiddenSkills.name'),
      desc: t('settings.codex.hiddenSkills.desc'),
      placeholder: t('settings.codex.hiddenSkills.placeholder'),
    });

    // --- Subagents ---

    settings.heading(t('settings.codex.subagents.heading'));
    const subagentDesc = container.ownerDocument.createElement('p');
    subagentDesc.className = 'typorai-sp-settings-desc setting-item-description';
    subagentDesc.textContent = t('settings.codex.subagents.desc');
    const subagentContainer = container.ownerDocument.createElement('div');
    subagentContainer.className = 'typorai-slash-commands-container';
    container.append(subagentDesc, subagentContainer);
    new CodexSubagentSettings(subagentContainer, codexWorkspace.subagentStorage, () => {
      void codexWorkspace.refreshAgentMentions?.();
    });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:codex',
      heading: t('settings.environment'),
      name: t('settings.codex.env.name'),
      desc: t('settings.codex.env.desc'),
      placeholder: t('settings.codex.env.placeholder'),
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'codex'),
    });
  },
};
