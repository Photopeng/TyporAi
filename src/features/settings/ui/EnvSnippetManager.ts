import { setIcon } from '@/ui/Icon';

import {
  getEnvironmentScopeUpdates,
  resolveEnvironmentSnippetScope,
} from '../../../core/providers/providerEnvironment';
import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { EnvironmentScope, EnvSnippet } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type TyporAiPlugin from '../../../main';
import { confirmAction } from '../../../ui/confirm';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { formatContextLimit, parseContextLimit, parseEnvironmentVariables } from '../../../utils/env';
import type { TyporAiView } from '../../chat/TyporAiView';

export class EnvSnippetModal extends NativeModal {
  plugin: TyporAiPlugin;
  snippet: EnvSnippet | null;
  snippetScope: EnvironmentScope;
  onSave: (snippet: EnvSnippet) => void;
  private readonly notifications = new NoticeAdapter();

  constructor(
    plugin: TyporAiPlugin,
    snippet: EnvSnippet | null,
    scope: EnvironmentScope,
    onSave: (snippet: EnvSnippet) => void,
  ) {
    super();
    this.plugin = plugin;
    this.snippet = snippet;
    this.snippetScope = scope;
    this.onSave = onSave;
  }

  protected onOpen() {
    const { contentEl } = this;
    this.setTitle(this.snippet ? t('settings.envSnippets.modal.titleEdit') : t('settings.envSnippets.modal.titleSave'));

    this.modalEl.classList.add('typorai-env-snippet-modal');

    const contextLimitInputs: Map<string, HTMLInputElement> = new Map();
    const modelAliasInputs: Map<string, HTMLInputElement> = new Map();
    let contextLimitsContainer: HTMLElement | null = null;

    // !e.isComposing for IME support (Chinese, Japanese, Korean, etc.)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        saveSnippet();
      } else if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        this.close();
      }
    };

    const saveSnippet = () => {
      const name = nameEl.value.trim();
      if (!name) {
        this.notifications.show(t('settings.envSnippets.nameRequired'), 'error');
        return;
      }

      const contextLimits: Record<string, number> = {};
      for (const [modelId, input] of contextLimitInputs) {
        const value = input.value.trim();
        if (value) {
          const parsed = parseContextLimit(value);
          if (parsed !== null) {
            contextLimits[modelId] = parsed;
          }
        }
      }

      const modelAliases: Record<string, string> = {};
      for (const [modelId, input] of modelAliasInputs) {
        const value = input.value.trim();
        if (value) {
          modelAliases[modelId] = value;
        }
      }

      const snippet: EnvSnippet = {
        id: this.snippet?.id || `snippet-${Date.now()}`,
        name,
        description: descEl.value.trim(),
        envVars: envVarsEl.value,
        scope: resolveEnvironmentSnippetScope(
          envVarsEl.value,
          this.snippet?.scope ?? this.snippetScope,
        ),
        contextLimits: Object.keys(contextLimits).length > 0 ? contextLimits : undefined,
        modelAliases: modelAliasInputs.size > 0 ? modelAliases : undefined,
      };

      this.onSave(snippet);
      this.close();
    };

    const renderContextLimitFields = () => {
      if (!contextLimitsContainer) return;
      contextLimitsContainer.replaceChildren();
      contextLimitInputs.clear();
      modelAliasInputs.clear();

      const envVars = parseEnvironmentVariables(envVarsEl.value);
      const uniqueModelIds = ProviderRegistry.getCustomModelIds(envVars);

      if (uniqueModelIds.size === 0) {
        contextLimitsContainer.classList.add('typorai-hidden');
        return;
      }

      contextLimitsContainer.classList.remove('typorai-hidden');

      const existingLimits = this.snippet?.contextLimits ?? this.plugin.settings.customContextLimits ?? {};
      const existingAliases = this.snippet?.modelAliases ?? this.plugin.settings.customModelAliases ?? {};

      appendElement(contextLimitsContainer, 'div', { text: t('settings.customModelOverrides.name'), className: 'setting-item-name' });
      appendElement(contextLimitsContainer, 'div', { text: t('settings.customModelOverrides.desc'), className: 'setting-item-description' });

      for (const modelId of uniqueModelIds) {
        const row = appendElement(contextLimitsContainer, 'div', { className: 'typorai-snippet-limit-row' });
        appendElement(row, 'span', { text: modelId, className: 'typorai-snippet-limit-model' });
        appendElement(row, 'span', { className: 'typorai-snippet-limit-spacer' });

        const aliasInput = appendElement(row, 'input', { type: 'text', className: 'typorai-snippet-alias-input' });
        aliasInput.placeholder = t('settings.customModelAliases.placeholder');
        aliasInput.value = existingAliases[modelId] ?? '';
        aliasInput.setAttribute('aria-label', t('settings.envSnippets.aliasAria', { modelId }));
        aliasInput.title = t('settings.envSnippets.aliasTitle');
        modelAliasInputs.set(modelId, aliasInput);

        const input = appendElement(row, 'input', { type: 'text', className: 'typorai-snippet-limit-input' });
        input.placeholder = t('settings.envSnippets.contextWindowPlaceholder');
        input.value = existingLimits[modelId] ? formatContextLimit(existingLimits[modelId]) : '';
        input.setAttribute('aria-label', t('settings.envSnippets.contextWindowAria', { modelId }));
        contextLimitInputs.set(modelId, input);
      }
    };

    const settings = new SettingBuilder(contentEl);
    const nameEl = settings.text(t('settings.envSnippets.modal.name'), this.snippet?.name || '', () => undefined, t('settings.envSnippets.modal.namePlaceholder'));
    nameEl.addEventListener('keydown', handleKeyDown);
    const descEl = settings.text(t('settings.envSnippets.modal.description'), this.snippet?.description || '', () => undefined, t('settings.envSnippets.modal.descPlaceholder'));
    descEl.addEventListener('keydown', handleKeyDown);
    const envVarsToShow = this.snippet?.envVars ?? this.plugin.getEnvironmentVariablesForScope(this.snippetScope);
    const envVarsEl = settings.textarea(t('settings.envSnippets.modal.envVars'), envVarsToShow, () => undefined, t('settings.envSnippets.modal.envVarsPlaceholder'));
    envVarsEl.rows = 8;
    envVarsEl.closest('.setting-item')?.classList.add('typorai-env-snippet-setting');
    envVarsEl.closest('.setting-item-control')?.classList.add('typorai-env-snippet-control');
    envVarsEl.addEventListener('blur', () => renderContextLimitFields());

    contextLimitsContainer = appendElement(contentEl, 'div', { className: 'typorai-snippet-context-limits' });
    renderContextLimitFields();

    const buttonContainer = appendElement(contentEl, 'div', { className: 'typorai-snippet-buttons' });

    const cancelBtn = appendElement(buttonContainer, 'button', { text: t('settings.envSnippets.modal.cancel'), className: 'typorai-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = appendElement(buttonContainer, 'button', { text: this.snippet ? t('settings.envSnippets.modal.update') : t('settings.envSnippets.modal.save'), className: 'typorai-save-btn' });
    saveBtn.addEventListener('click', () => saveSnippet());

    // Focus name input after modal is rendered (timeout for Windows compatibility)
    window.setTimeout(() => nameEl?.focus(), 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.replaceChildren();
  }
}

export class EnvSnippetManager {
  private containerEl: HTMLElement;
  private plugin: TyporAiPlugin;
  private scope: EnvironmentScope;
  private onContextLimitsChange?: () => void;
  private readonly notifications = new NoticeAdapter();

  constructor(
    containerEl: HTMLElement,
    plugin: TyporAiPlugin,
    scope: EnvironmentScope,
    onContextLimitsChange?: () => void,
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.scope = scope;
    this.onContextLimitsChange = onContextLimitsChange;
    this.render();
  }

  private render() {
    this.containerEl.replaceChildren();

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-snippet-header' });
    appendElement(headerEl, 'span', { text: t('settings.envSnippets.name'), className: 'typorai-snippet-label' });

    const saveBtn = appendElement(headerEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.envSnippets.addBtn') } });
    setIcon(saveBtn, 'plus');
    saveBtn.addEventListener('click', () => {
      void this.saveCurrentEnv();
    });

    const snippets = this.plugin.settings.envSnippets.filter((snippet) => this.shouldDisplaySnippet(snippet));

    if (snippets.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-snippet-empty' });
      emptyEl.textContent = t('settings.envSnippets.noSnippets');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-snippet-list' });

    for (const snippet of snippets) {
      const itemEl = appendElement(listEl, 'div', { className: 'typorai-snippet-item' });

      const infoEl = appendElement(itemEl, 'div', { className: 'typorai-snippet-info' });

      appendElement(infoEl, 'div', { className: 'typorai-snippet-name', text: snippet.name });

      if (snippet.description) {
        appendElement(infoEl, 'div', { className: 'typorai-snippet-description', text: snippet.description });
      }

      const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-snippet-actions' });

      const restoreBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.envSnippets.insertAria') } });
      setIcon(restoreBtn, 'clipboard-paste');
      restoreBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
        try {
          await this.insertSnippet(snippet);
        } catch {
          this.notifications.show(t('settings.envSnippets.insertFailed'), 'error');
        }
        })();
      });

      const editBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.edit') } });
      setIcon(editBtn, 'pencil');
      editBtn.addEventListener('click', () => {
        this.editSnippet(snippet);
      });

      const deleteBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('common.delete') } });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
        try {
          if (await confirmAction(
            t('settings.envSnippets.deleteConfirm', { name: snippet.name }), t('common.delete'), t('common.cancel'),
          )) {
            await this.deleteSnippet(snippet);
          }
        } catch {
          this.notifications.show(t('settings.envSnippets.deleteFailed'), 'error');
        }
        })();
      });
    }
  }

  private async saveCurrentEnv() {
    const modal = new EnvSnippetModal(
      this.plugin,
      null,
      this.scope,
      (snippet) => {
        void (async (): Promise<void> => {
          this.plugin.settings.envSnippets.push(snippet);
          await this.plugin.saveSettings();
          this.render();
          this.notifications.show(t('settings.envSnippets.saved', { name: snippet.name }));
        })();
      }
    );
    modal.open();
  }

  private async insertSnippet(snippet: EnvSnippet) {
    const snippetContent = snippet.envVars.trim();
    const updates = getEnvironmentScopeUpdates(
      snippetContent,
      snippet.scope ?? this.scope,
    );

    if (updates.length === 1) {
      const [update] = updates;
      this.syncTextareaValue(update.scope, update.envText);
      await this.plugin.applyEnvironmentVariables(update.scope, update.envText);
    } else if (updates.length > 1) {
      for (const update of updates) {
        this.syncTextareaValue(update.scope, update.envText);
      }
      await this.plugin.applyEnvironmentVariablesBatch(updates);
    }

    // Legacy snippets without contextLimits don't modify limits
    if (snippet.contextLimits) {
      this.plugin.settings.customContextLimits = {
        ...this.plugin.settings.customContextLimits,
        ...snippet.contextLimits,
      };
    }

    // Legacy snippets without modelAliases don't modify aliases. Snippets saved
    // with alias fields clear aliases for their own model IDs when left empty.
    if (snippet.modelAliases) {
      const modelIds = ProviderRegistry.getCustomModelIds(parseEnvironmentVariables(snippet.envVars));
      const nextAliases = { ...(this.plugin.settings.customModelAliases ?? {}) };
      for (const modelId of modelIds) {
        const alias = snippet.modelAliases[modelId]?.trim();
        if (alias) {
          nextAliases[modelId] = alias;
        } else {
          delete nextAliases[modelId];
        }
      }
      this.plugin.settings.customModelAliases = nextAliases;
    }
    await this.plugin.saveSettings();

    this.onContextLimitsChange?.();
    const view = this.plugin.app.workspace.getLeavesOfType('typorai-view')[0]?.view as TyporAiView | undefined;
    view?.refreshModelSelector();
  }

  private editSnippet(snippet: EnvSnippet) {
    const modal = new EnvSnippetModal(
      this.plugin,
      snippet,
      this.scope,
      (updatedSnippet) => {
        void (async (): Promise<void> => {
          const index = this.plugin.settings.envSnippets.findIndex(s => s.id === snippet.id);
          if (index !== -1) {
            this.plugin.settings.envSnippets[index] = updatedSnippet;
            await this.plugin.saveSettings();
            this.render();
            this.notifications.show(t('settings.envSnippets.updated', { name: updatedSnippet.name }));
          }
        })();
      }
    );
    modal.open();
  }

  private async deleteSnippet(snippet: EnvSnippet) {
    this.plugin.settings.envSnippets = this.plugin.settings.envSnippets.filter(s => s.id !== snippet.id);
    await this.plugin.saveSettings();
    this.render();
    this.notifications.show(t('settings.envSnippets.deleted', { name: snippet.name }));
  }

  public refresh() {
    this.render();
  }

  private shouldDisplaySnippet(snippet: EnvSnippet): boolean {
    if (this.scope === 'shared') {
      return !snippet.scope || snippet.scope === 'shared';
    }

    return snippet.scope === this.scope;
  }

  private syncTextareaValue(scope: EnvironmentScope, value: string): void {
    const selector = `.typorai-settings-env-textarea[data-env-scope="${scope}"]`;
    const envTextarea = (this.containerEl.ownerDocument ?? window.document).querySelector<HTMLTextAreaElement>(selector);
    if (envTextarea) {
      envTextarea.value = value;
    }
  }
}
