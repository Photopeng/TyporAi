import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderCliProviderSelectionSection } from '../../../features/settings/ui/CliProviderSelectionSection';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { setTyporAiTooltip } from '../../../ui/Tooltip';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { maybeGetOpencodeWorkspaceServices } from '../app/OpencodeWorkspaceServices';
import { clearOpencodeDiscoveryState } from '../discoveryState';
import { sameStringList } from '../internal/compareCollections';
import {
  buildOpencodeBaseModels,
  encodeOpencodeModelId,
  type OpencodeDiscoveredModel,
  splitOpencodeModelLabel,
} from '../models';
import { getManagedOpencodeModes } from '../modes';
import { OpencodeChatRuntime } from '../runtime/OpencodeChatRuntime';
import {
  getOpencodeProviderSettings,
  normalizeOpencodeVisibleModels,
  OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES,
  updateOpencodeProviderSettings,
} from '../settings';
import { OpencodeAgentSettings } from './OpencodeAgentSettings';

const ALL_PROVIDERS_KEY = 'all';
const OPENCODE_METADATA_WARMUP_DB = ':memory:';

interface EnrichedModel {
  description: string;
  isAvailable: boolean;
  modelLabel: string;
  providerKey: string;
  providerLabel: string;
  rawId: string;
}

function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  options: { className?: string; text?: string; type?: string; value?: string } = {},
): HTMLElementTagNameMap[K] {
  const element = parent.ownerDocument.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type && tag === 'input') (element as HTMLInputElement).type = options.type;
  if (options.value !== undefined && 'value' in element) element.value = options.value;
  parent.append(element);
  return element;
}

export const opencodeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const opencodeWorkspace = maybeGetOpencodeWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const opencodeSettings = getOpencodeProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();
    const settings = new SettingBuilder(container);

    settings.heading(t('settings.opencode.setup.heading'));

    renderCliProviderSelectionSection(
      container, settingsBag, () => context.plugin.saveSettings(), context.refreshModelSelectors,
    );

    const validationEl = container.ownerDocument.createElement('div');
    validationEl.className = 'typorai-cli-path-validation typorai-setting-validation typorai-setting-validation-error typorai-hidden';
    container.append(validationEl);

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const expandedPath = expandHomePath(trimmed);
      if (context.fileProbe && !context.fileProbe.exists(expandedPath)) {
        return t('settings.opencode.cliPath.validation.notExist');
      }

      if (context.fileProbe && !context.fileProbe.isFile(expandedPath)) {
        return t('settings.opencode.cliPath.validation.isDirectory');
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

    const cliPathsByHost = { ...opencodeSettings.cliPathsByHost };
    const currentValue = opencodeSettings.cliPathsByHost[hostnameKey] || '';
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

      updateOpencodeProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      clearOpencodeDiscoveryState(settingsBag);
      await context.plugin.saveSettings();
      opencodeWorkspace?.cliResolver?.reset();
      await recycleOpencodeRuntime();
      return true;
    };

    const recycleOpencodeRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('opencode', (service) => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(
            (service) => Promise.resolve(service.cleanup()),
          );
        }
        view.invalidateProviderCommandCaches?.(['opencode']);
        view.refreshModelSelector?.();
      }
    };

    cliPathInputEl = settings.text(
      t('settings.opencode.cliPath.name'), currentValue,
      async (value) => { await persistCliPath(value); },
      t('settings.opencode.cliPath.desc'),
    );
    cliPathInputEl.placeholder = context.platform === 'windows'
      ? t('settings.opencode.cliPath.placeholderWin')
      : t('settings.opencode.cliPath.placeholderUnix');
    cliPathInputEl.classList.add('typorai-settings-cli-path-input');
    updateCliPathValidation(currentValue, cliPathInputEl);

    settings.heading('Default mode');
    const modeOptions = getManagedOpencodeModes(opencodeSettings.availableModes);
    settings.select(
      'Default mode',
      opencodeSettings.selectedMode || modeOptions[0]?.id || '',
      modeOptions.map((mode) => ({
        value: mode.id,
        label: mode.name,
      })),
      async (value) => {
        updateOpencodeProviderSettings(settingsBag, { selectedMode: value });
        await context.plugin.saveSettings();
        await recycleOpencodeRuntime();
      },
      'Use this OpenCode mode for new conversations. Changes restart OpenCode conversations.',
    );

    settings.heading(t('settings.opencode.models.heading'));

    const visibleModelsDescription = container.ownerDocument.createElement('p');
    visibleModelsDescription.className = 'setting-item-description';
    visibleModelsDescription.textContent = t('settings.opencode.models.visible.desc');
    container.append(visibleModelsDescription);

    const pickerEl = appendElement(container, 'div', { className: 'typorai-opencode-model-picker' });

    let searchQuery = '';
    let providerFilter = ALL_PROVIDERS_KEY;

    const summaryEl = appendElement(pickerEl, 'div', { className: 'typorai-opencode-model-picker-summary' });
    const selectedEl = appendElement(pickerEl, 'div', { className: 'typorai-opencode-model-picker-selected' });
    const catalogEl = appendElement(pickerEl, 'details', { className: 'typorai-opencode-model-picker-catalog' });
    catalogEl.open = getOpencodeProviderSettings(settingsBag).visibleModels.length === 0;
    const catalogSummaryEl = appendElement(catalogEl, 'summary', { className: 'typorai-opencode-model-picker-catalog-summary' });
    appendElement(catalogSummaryEl, 'span', {
      className: 'typorai-opencode-model-picker-catalog-caret',
      text: '▸',
    });
    appendElement(catalogSummaryEl, 'span', {
      className: 'typorai-opencode-model-picker-catalog-title',
      text: t('settings.opencode.models.browse'),
    });
    const catalogSummaryCountEl = appendElement(catalogSummaryEl, 'span', {
      className: 'typorai-opencode-model-picker-catalog-count',
    });

    const controlsEl = appendElement(catalogEl, 'div', { className: 'typorai-opencode-model-picker-controls' });

    const searchInput = appendElement(controlsEl, 'input', {
      className: 'typorai-opencode-model-picker-search', type: 'search',
    });
    searchInput.placeholder = t('settings.opencode.models.searchPlaceholder');
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderList();
    });

    const providerSelectEl = appendElement(controlsEl, 'select', { className: 'typorai-opencode-model-picker-provider' });
    providerSelectEl.addEventListener('change', () => {
      providerFilter = providerSelectEl.value;
      renderList();
    });

    const listEl = appendElement(catalogEl, 'div', { className: 'typorai-opencode-model-picker-list' });
    let loadingModelCatalog = false;
    let modelCatalogLoadFailed = false;

    const getEnrichedModels = (): EnrichedModel[] => {
      const current = getOpencodeProviderSettings(settingsBag);
      return buildEnrichedModels(current.discoveredModels, current.visibleModels);
    };

    const filterModels = (models: EnrichedModel[]): EnrichedModel[] => {
      return models.filter((model) => {
        if (providerFilter !== ALL_PROVIDERS_KEY && model.providerKey !== providerFilter) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        return (
          model.rawId.toLowerCase().includes(searchQuery)
          || model.modelLabel.toLowerCase().includes(searchQuery)
          || model.providerLabel.toLowerCase().includes(searchQuery)
          || model.description.toLowerCase().includes(searchQuery)
        );
      });
    };

    const persistVisibleModels = async (visibleModels: string[]): Promise<void> => {
      const currentVisibleModels = getOpencodeProviderSettings(settingsBag).visibleModels;
      const normalized = normalizeOpencodeVisibleModels(
        visibleModels,
        getOpencodeProviderSettings(settingsBag).discoveredModels,
      );
      if (sameStringList(currentVisibleModels, normalized)) {
        return;
      }

      updateOpencodeProviderSettings(settingsBag, { visibleModels: normalized });
      await context.plugin.saveSettings();
      renderAll();
      context.refreshModelSelectors();
    };

    const persistModelMetadata = async (rawId: string): Promise<void> => {
      const runtime = new OpencodeChatRuntime(context.plugin);
      try {
        runtime.syncConversationState({
          providerState: { databasePath: OPENCODE_METADATA_WARMUP_DB },
          sessionId: null,
        });
        const loaded = await runtime.warmModelMetadata(encodeOpencodeModelId(rawId));
        if (loaded) {
          context.refreshModelSelectors();
        }
      } catch {
        // Metadata warmup is opportunistic; the first chat turn can still discover it.
      } finally {
        runtime.cleanup();
      }
    };

    const persistModelAliases = async (modelAliases: Record<string, string>): Promise<void> => {
      updateOpencodeProviderSettings(settingsBag, { modelAliases });
      await context.plugin.saveSettings();
      renderSelected();
      context.refreshModelSelectors();
    };

    const renderSummary = (): void => {
      summaryEl.replaceChildren();
      const current = getOpencodeProviderSettings(settingsBag);

      appendElement(summaryEl, 'span', { text: t('settings.opencode.models.visibleLabel') + ' ' });
      appendElement(summaryEl, 'span', {
        className: 'typorai-opencode-model-picker-summary-value', text: String(current.visibleModels.length),
      });
      appendElement(summaryEl, 'span', {
        text: ' ' + t('settings.opencode.models.ofDiscovered', { total: current.discoveredModels.length }),
      });

      let catalogSummary = t('settings.opencode.models.noneDiscovered');
      if (loadingModelCatalog) {
        catalogSummary = t('settings.opencode.models.loading');
      } else if (current.discoveredModels.length > 0) {
        catalogSummary = t('settings.opencode.models.available', {
          count: current.discoveredModels.length,
        });
      }
      catalogSummaryCountEl.textContent = catalogSummary;
    };

    const renderSelected = (): void => {
      selectedEl.replaceChildren();
      const current = getOpencodeProviderSettings(settingsBag);
      if (current.visibleModels.length === 0) {
        selectedEl.classList.add('typorai-hidden');
        return;
      }

      selectedEl.classList.remove('typorai-hidden');
      const enrichedByRawId = new Map(
        getEnrichedModels().map((model) => [model.rawId, model] as const),
      );

      const headerEl = appendElement(selectedEl, 'div', { className: 'typorai-opencode-model-picker-selected-header' });
      appendElement(headerEl, 'span', {
        className: 'typorai-opencode-model-picker-selected-label',
        text: t('settings.opencode.models.selectedCount', { count: current.visibleModels.length }),
      });
      const clearAllBtn = appendElement(headerEl, 'button', {
        className: 'typorai-opencode-model-picker-selected-clear', text: t('common.clearAll'),
      });
      clearAllBtn.setAttribute('aria-label', t('settings.opencode.models.clearAllAria'));
      clearAllBtn.addEventListener('click', () => {
        void persistVisibleModels([]);
      });

      const rowsEl = appendElement(selectedEl, 'div', { className: 'typorai-opencode-model-picker-selected-rows' });

      for (const rawId of current.visibleModels) {
        const enriched = enrichedByRawId.get(rawId);
        const defaultLabel = enriched
          ? `${enriched.providerLabel}/${enriched.modelLabel}`
          : rawId;

        const rowEl = appendElement(rowsEl, 'div', { className: 'typorai-opencode-model-picker-selected-row' });
        if (enriched && !enriched.isAvailable) {
          rowEl.classList.add('typorai-opencode-model-picker-selected-row--unavailable');
        }

        const infoEl = appendElement(rowEl, 'div', { className: 'typorai-opencode-model-picker-selected-info' });
        const titleEl = appendElement(infoEl, 'div', { className: 'typorai-opencode-model-picker-selected-title' });
        if (enriched) {
          appendElement(titleEl, 'span', {
            className: 'typorai-opencode-model-picker-selected-badge', text: enriched.providerLabel,
          });
          appendElement(titleEl, 'span', {
            className: 'typorai-opencode-model-picker-selected-name', text: enriched.modelLabel,
          });
        } else {
          appendElement(titleEl, 'span', { className: 'typorai-opencode-model-picker-selected-name', text: rawId });
        }

        if (enriched && !enriched.isAvailable) {
          appendElement(infoEl, 'div', {
            className: 'typorai-opencode-model-picker-selected-unavailable', text: t('settings.opencode.models.notReported'),
          });
        }

        appendElement(infoEl, 'div', { className: 'typorai-opencode-model-picker-selected-id', text: rawId });

        const controlsEl = appendElement(rowEl, 'div', { className: 'typorai-opencode-model-picker-selected-controls' });
        const aliasInput = appendElement(controlsEl, 'input', {
          className: 'typorai-opencode-model-picker-selected-alias', type: 'text',
        });
        aliasInput.placeholder = defaultLabel;
        aliasInput.value = current.modelAliases[rawId] ?? '';
        aliasInput.setAttribute('aria-label', t('settings.opencode.models.aliasAria', { name: defaultLabel }));
        setTyporAiTooltip(aliasInput, t('settings.opencode.models.aliasTitle'));

        const commitAlias = (): void => {
          const latest = getOpencodeProviderSettings(settingsBag);
          const existing = latest.modelAliases[rawId] ?? '';
          const next = aliasInput.value.trim();
          if (next === existing) {
            aliasInput.value = existing;
            return;
          }

          const nextAliases = { ...latest.modelAliases };
          if (next) {
            nextAliases[rawId] = next;
          } else {
            delete nextAliases[rawId];
          }
          void persistModelAliases(nextAliases);
        };

        aliasInput.addEventListener('blur', commitAlias);
        aliasInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            aliasInput.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            aliasInput.value = getOpencodeProviderSettings(settingsBag).modelAliases[rawId] ?? '';
            aliasInput.blur();
          }
        });

        const removeBtn = appendElement(controlsEl, 'button', {
          className: 'typorai-opencode-model-picker-selected-remove',
          text: '×',
        });
        removeBtn.setAttribute('aria-label', t('settings.opencode.models.removeAria', { label: defaultLabel }));
        removeBtn.addEventListener('click', () => {
          void persistVisibleModels(current.visibleModels.filter((entry) => entry !== rawId));
        });
      }
    };

    const renderProviderSelect = (): void => {
      const enriched = getEnrichedModels();
      const providers = new Map<string, { count: number; label: string }>();
      for (const model of enriched) {
        const existing = providers.get(model.providerKey);
        if (existing) {
          existing.count += 1;
        } else {
          providers.set(model.providerKey, { count: 1, label: model.providerLabel });
        }
      }

      providerSelectEl.replaceChildren();
      appendElement(providerSelectEl, 'option', {
        text: t('settings.opencode.models.allProvidersCount', { count: enriched.length }), value: ALL_PROVIDERS_KEY,
      });

      const sortedProviders = Array.from(providers.entries())
        .sort(([, left], [, right]) => left.label.localeCompare(right.label));
      for (const [key, { count, label }] of sortedProviders) {
        appendElement(providerSelectEl, 'option', {
          text: t('settings.opencode.models.providerOption', { label, count }), value: key,
        });
      }

      if (providerFilter !== ALL_PROVIDERS_KEY && !providers.has(providerFilter)) {
        providerFilter = ALL_PROVIDERS_KEY;
      }
      providerSelectEl.value = providerFilter;
    };

    const renderList = (): void => {
      listEl.replaceChildren();
      const current = getOpencodeProviderSettings(settingsBag);
      const selectedIds = new Set(current.visibleModels);
      const enriched = getEnrichedModels();
      const filtered = filterModels(enriched);

      if (filtered.length === 0) {
        const emptyEl = appendElement(listEl, 'div', { className: 'typorai-opencode-model-picker-empty' });
        let emptyText = t('settings.opencode.models.emptyFiltered');
        if (loadingModelCatalog) {
          emptyText = t('settings.opencode.models.emptyLoading');
        } else if (modelCatalogLoadFailed) {
          emptyText = t('settings.opencode.models.emptyLoadFailed');
        } else if (enriched.length === 0) {
          emptyText = t('settings.opencode.models.emptyStartOpencode');
        }
        emptyEl.textContent = emptyText;
        return;
      }

      for (const model of filtered) {
        const rowEl = appendElement(listEl, 'label', { className: 'typorai-opencode-model-picker-row' });
        const isSelected = selectedIds.has(model.rawId);
        if (isSelected) {
          rowEl.classList.add('typorai-opencode-model-picker-row--selected');
        }
        setTyporAiTooltip(rowEl, model.rawId);

        const checkboxEl = appendElement(rowEl, 'input', { type: 'checkbox' });
        checkboxEl.checked = isSelected;
        checkboxEl.addEventListener('change', () => {
          const currentVisibleModels = getOpencodeProviderSettings(settingsBag).visibleModels;
          const next = checkboxEl.checked
            ? [...currentVisibleModels, model.rawId]
            : currentVisibleModels.filter((id) => id !== model.rawId);
          void (async () => {
            await persistVisibleModels(next);
            if (checkboxEl.checked) {
              await persistModelMetadata(model.rawId);
            }
          })();
        });

        const textEl = appendElement(rowEl, 'div', { className: 'typorai-opencode-model-picker-row-text' });

        const headerEl = appendElement(textEl, 'div', { className: 'typorai-opencode-model-picker-row-header' });
        appendElement(headerEl, 'span', { className: 'typorai-opencode-model-picker-row-name', text: model.modelLabel });
        const badgeEl = appendElement(headerEl, 'span', {
          className: 'typorai-opencode-model-picker-row-badge', text: model.providerLabel,
        });
        if (!model.isAvailable) {
          badgeEl.classList.add('typorai-opencode-model-picker-row-badge--unavailable');
          badgeEl.textContent = t('settings.opencode.models.unavailableBadge');
          setTyporAiTooltip(badgeEl, t('settings.opencode.models.unavailableTitle'));
        }

        appendElement(textEl, 'div', { className: 'typorai-opencode-model-picker-row-meta', text: model.rawId });

        if (model.description) {
          appendElement(textEl, 'div', { className: 'typorai-opencode-model-picker-row-desc', text: model.description });
        }

      }
    };

    const renderAll = (): void => {
      renderSummary();
      renderSelected();
      renderProviderSelect();
      renderList();
    };

    renderAll();

    const loadModelCatalog = async (): Promise<void> => {
      if (loadingModelCatalog || getOpencodeProviderSettings(settingsBag).discoveredModels.length > 0) {
        return;
      }

      loadingModelCatalog = true;
      modelCatalogLoadFailed = false;
      renderAll();

      const runtime = new OpencodeChatRuntime(context.plugin);
      try {
        runtime.syncConversationState({
          providerState: { databasePath: OPENCODE_METADATA_WARMUP_DB },
          sessionId: null,
        });
        const loaded = await runtime.ensureReady({ allowSessionCreation: true });
        modelCatalogLoadFailed = !loaded || getOpencodeProviderSettings(settingsBag).discoveredModels.length === 0;
        if (!modelCatalogLoadFailed) {
          context.refreshModelSelectors();
        }
      } catch {
        modelCatalogLoadFailed = true;
      } finally {
        loadingModelCatalog = false;
        runtime.cleanup();
        renderAll();
      }
    };

    catalogEl.addEventListener('toggle', () => {
      if (catalogEl.open) {
        void loadModelCatalog();
      }
    });
    if (catalogEl.open) {
      void loadModelCatalog();
    }

    settings.heading(t('settings.opencode.commands.heading'));

    const commandsDesc = container.ownerDocument.createElement('p');
    commandsDesc.className = 'typorai-sp-settings-desc setting-item-description';
    commandsDesc.textContent = 'Commands are discovered from OpenCode at runtime. You can hide entries here, but TyporAi does not edit or delete them.';
    container.append(commandsDesc);

    context.renderHiddenProviderCommandSetting(container, 'opencode', {
      name: t('settings.opencode.hiddenCommands.name'),
      desc: t('settings.opencode.hiddenCommands.desc'),
      placeholder: t('settings.opencode.hiddenCommands.placeholder'),
    });

    if (opencodeWorkspace?.agentStorage) {
      settings.heading(t('settings.opencode.subagents.heading'));

      const subagentsDesc = container.ownerDocument.createElement('p');
      subagentsDesc.className = 'typorai-sp-settings-desc setting-item-description';
      subagentsDesc.textContent = t('settings.opencode.subagents.desc');
      const subagentsContainer = container.ownerDocument.createElement('div');
      subagentsContainer.className = 'typorai-slash-commands-container';
      container.append(subagentsDesc, subagentsContainer);
      new OpencodeAgentSettings(
        subagentsContainer,
        opencodeWorkspace.agentStorage,
        async () => {
          await opencodeWorkspace.refreshAgentMentions?.();
          await recycleOpencodeRuntime();
        },
      );
    }

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:opencode',
      heading: t('settings.opencode.env.heading'),
      name: t('settings.opencode.env.name'),
      desc: t('settings.opencode.env.desc'),
      placeholder: t('settings.opencode.env.placeholder', {
        defaultEnv: OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES,
      }),
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'opencode'),
    });
  },
};

function buildEnrichedModels(
  discoveredModels: OpencodeDiscoveredModel[],
  visibleModels: string[],
): EnrichedModel[] {
  const enriched: EnrichedModel[] = [];
  const discoveredIds = new Set<string>();
  const baseModels = buildOpencodeBaseModels(discoveredModels);

  for (const model of baseModels) {
    const { modelLabel, providerLabel } = splitOpencodeModelLabel(model.label || model.rawId);
    discoveredIds.add(model.rawId);
    enriched.push({
      description: model.description ?? '',
      isAvailable: true,
      modelLabel,
      providerKey: providerLabel.toLowerCase(),
      providerLabel,
      rawId: model.rawId,
    });
  }

  for (const rawId of visibleModels) {
    if (discoveredIds.has(rawId)) {
      continue;
    }

    const { modelLabel, providerLabel } = splitOpencodeModelLabel(rawId);
    enriched.push({
      description: '',
      isAvailable: false,
      modelLabel,
      providerKey: providerLabel.toLowerCase(),
      providerLabel,
      rawId,
    });
  }

  return enriched.sort((left, right) => {
    const providerCmp = left.providerLabel.localeCompare(right.providerLabel);
    if (providerCmp !== 0) {
      return providerCmp;
    }
    return left.modelLabel.localeCompare(right.modelLabel);
  });
}
