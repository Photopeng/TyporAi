import { setIcon } from '@/ui/Icon';

import { t } from '../../../i18n/i18n';
import type { TranslationKey } from '../../../i18n/types';
import { confirmAction } from '../../../ui/confirm';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import type { CodexSubagentStorage } from '../storage/CodexSubagentStorage';
import { DEFAULT_CODEX_PRIMARY_MODEL } from '../types/models';
import type { CodexSubagentDefinition } from '../types/subagent';

const MAX_NAME_LENGTH = 64;
const CODEX_AGENT_NAME_PATTERN = /^[a-z0-9_-]+$/;
const CODEX_NICKNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export type CodexSubagentNameError = 'required' | 'tooLong' | 'invalidChars';

export function validateCodexSubagentName(name: string): CodexSubagentNameError | null {
  if (!name) return 'required';
  if (name.length > MAX_NAME_LENGTH) return 'tooLong';
  if (!CODEX_AGENT_NAME_PATTERN.test(name)) return 'invalidChars';
  return null;
}

export type CodexNicknameValidationError = 'invalid' | 'duplicate';

export function validateCodexNicknameCandidates(candidates: string[]): CodexNicknameValidationError | null {
  const normalized = candidates.map(candidate => candidate.trim()).filter(Boolean);
  if (normalized.length === 0) return null;

  const seen = new Set<string>();
  for (const candidate of normalized) {
    if (!CODEX_NICKNAME_PATTERN.test(candidate)) {
      return 'invalid';
    }

    const dedupeKey = candidate.toLowerCase();
    if (seen.has(dedupeKey)) {
      return 'duplicate';
    }
    seen.add(dedupeKey);
  }

  return null;
}

export class CodexSubagentModal extends NativeModal {
  private existing: CodexSubagentDefinition | null;
  private allAgents: CodexSubagentDefinition[];
  private onSave: (agent: CodexSubagentDefinition) => Promise<void>;

  private _nameInput!: HTMLInputElement;
  private _descInput!: HTMLInputElement;
  private _instructionsArea!: HTMLTextAreaElement;
  private _nicknamesInput!: HTMLInputElement;
  private _modelInput!: HTMLInputElement;
  private _reasoningEffort = '';
  private _sandboxMode = '';
  private _triggerSave!: () => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(
    existing: CodexSubagentDefinition | null,
    allAgents: CodexSubagentDefinition[],
    onSave: (agent: CodexSubagentDefinition) => Promise<void>,
  ) {
    super();
    this.existing = existing;
    this.allAgents = allAgents;
    this.onSave = onSave;
    this._reasoningEffort = existing?.modelReasoningEffort ?? '';
    this._sandboxMode = existing?.sandboxMode ?? '';
  }

  getTestInputs() {
    return {
      nameInput: this._nameInput,
      descInput: this._descInput,
      instructionsArea: this._instructionsArea,
      nicknamesInput: this._nicknamesInput,
      modelInput: this._modelInput,
      setReasoningEffort: (v: string) => { this._reasoningEffort = v; },
      setSandboxMode: (v: string) => { this._sandboxMode = v; },
      triggerSave: this._triggerSave,
    };
  }

  protected onOpen() {
    this.setTitle(
      this.existing
        ? t('settings.codex.subagentModal.titleEdit')
        : t('settings.codex.subagentModal.titleAdd'),
    );
    this.modalEl.classList.add('typorai-sp-modal');

    const { contentEl } = this;

    const settings = new SettingBuilder(contentEl);
    this._nameInput = settings.text(
      t('settings.codex.subagentModal.name.name'), this.existing?.name ?? '', () => undefined,
      t('settings.codex.subagentModal.name.desc'),
    );
    this._nameInput.placeholder = t('settings.codex.subagentModal.name.placeholder');
    this._descInput = settings.text(
      t('settings.codex.subagentModal.description.name'), this.existing?.description ?? '', () => undefined,
      t('settings.codex.subagentModal.description.desc'),
    );
    this._descInput.placeholder = t('settings.codex.subagentModal.description.placeholder');

    // Advanced options
    const details = appendElement(contentEl, 'details', { className: 'typorai-sp-advanced-section' });
    appendElement(details, 'summary', {
      text: t('settings.codex.subagentModal.advanced'), className: 'typorai-sp-advanced-summary',
    });
    if (
      this.existing?.model ||
      this.existing?.modelReasoningEffort ||
      this.existing?.sandboxMode ||
      this.existing?.nicknameCandidates?.length
    ) {
      details.open = true;
    }

    const advancedSettings = new SettingBuilder(details);
    this._modelInput = advancedSettings.text(
      t('settings.codex.subagentModal.model.name'), this.existing?.model ?? '', () => undefined,
      t('settings.codex.subagentModal.model.desc'),
    );
    this._modelInput.placeholder = DEFAULT_CODEX_PRIMARY_MODEL;
    advancedSettings.select(
      t('settings.codex.subagentModal.reasoningEffort.name'), this._reasoningEffort,
      ['', 'low', 'medium', 'high', 'xhigh'].map(value => ({
        value,
        label: t(`settings.codex.subagentModal.reasoningEffort.${value || 'inherit'}` as TranslationKey),
      })),
      value => { this._reasoningEffort = value; },
      t('settings.codex.subagentModal.reasoningEffort.desc'),
    );
    advancedSettings.select(
      t('settings.codex.subagentModal.sandboxMode.name'), this._sandboxMode,
      ['', 'read-only', 'danger-full-access', 'workspace-write'].map(value => ({
        value,
        label: t(`settings.codex.subagentModal.sandboxMode.${value === '' ? 'inherit' : value === 'read-only' ? 'readOnly' : value === 'danger-full-access' ? 'dangerFullAccess' : 'workspaceWrite'}`),
      })),
      value => { this._sandboxMode = value; },
      t('settings.codex.subagentModal.sandboxMode.desc'),
    );
    this._nicknamesInput = advancedSettings.text(
      t('settings.codex.subagentModal.nicknameCandidates.name'),
      this.existing?.nicknameCandidates?.join(', ') ?? '', () => undefined,
      t('settings.codex.subagentModal.nicknameCandidates.desc'),
    );

    // Developer instructions
    settings.heading(t('settings.codex.subagentModal.developerInstructions.name'));

    const instructionsArea = appendElement(contentEl, 'textarea', { className: 'typorai-sp-content-area' });
    instructionsArea.rows = 10;
    instructionsArea.placeholder = t('settings.codex.subagentModal.developerInstructions.placeholder');
    instructionsArea.value = this.existing?.developerInstructions ?? '';
    this._instructionsArea = instructionsArea;

    // Buttons
    const doSave = async () => {
      const name = this._nameInput.value.trim();
      const nameError = validateCodexSubagentName(name);
      if (nameError) {
        const errorKey = ((): TranslationKey => {
          switch (nameError) {
            case 'required':
              return 'settings.codex.subagentModal.validation.nameRequired';
            case 'tooLong':
              return 'settings.codex.subagentModal.validation.nameTooLong';
            case 'invalidChars':
              return 'settings.codex.subagentModal.validation.nameInvalid';
          }
        })();
        const params = nameError === 'tooLong' ? { max: MAX_NAME_LENGTH } : undefined;
        this.notifications.show(params ? t(errorKey, params) : t(errorKey), 'error');
        return;
      }

      const description = this._descInput.value.trim();
      if (!description) {
        this.notifications.show(t('settings.codex.subagentModal.description.required'), 'error');
        return;
      }

      const developerInstructions = this._instructionsArea.value;
      if (!developerInstructions.trim()) {
        this.notifications.show(t('settings.codex.subagentModal.developerInstructions.required'), 'error');
        return;
      }

      const nicknameCandidates = this._nicknamesInput.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const nicknameError = validateCodexNicknameCandidates(nicknameCandidates);
      if (nicknameError) {
        const errorKey = ((): TranslationKey => {
          switch (nicknameError) {
            case 'invalid':
              return 'settings.codex.subagentModal.validation.nicknameInvalid';
            case 'duplicate':
              return 'settings.codex.subagentModal.validation.nicknameDuplicate';
          }
        })();
        this.notifications.show(t(errorKey), 'error');
        return;
      }

      const duplicate = this.allAgents.find(
        a => a.name.toLowerCase() === name.toLowerCase() &&
             a.persistenceKey !== this.existing?.persistenceKey,
      );
      if (duplicate) {
        this.notifications.show(t('settings.codex.subagentModal.errors.duplicateName', { name }), 'error');
        return;
      }

      const agent: CodexSubagentDefinition = {
        name,
        description,
        developerInstructions,
        nicknameCandidates: nicknameCandidates.length > 0 ? nicknameCandidates : undefined,
        model: this._modelInput.value.trim() || undefined,
        modelReasoningEffort: this._reasoningEffort || undefined,
        sandboxMode: this._sandboxMode || undefined,
        persistenceKey: this.existing?.persistenceKey,
        extraFields: this.existing?.extraFields,
      };

      try {
        await this.onSave(agent);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('common.unknown');
        this.notifications.show(t('settings.codex.subagentModal.errors.saveFailed', { message }), 'error');
        return;
      }
      this.close();
    };
    this._triggerSave = doSave;

    const buttonContainer = appendElement(contentEl, 'div', { className: 'typorai-sp-modal-buttons' });

    const cancelBtn = appendElement(buttonContainer, 'button', { text: t('common.cancel'), className: 'typorai-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = appendElement(buttonContainer, 'button', { text: t('common.save'), className: 'typorai-save-btn' });
    saveBtn.addEventListener('click', () => {
      void doSave();
    });
  }

  protected onClose() {
    this.contentEl.replaceChildren();
  }
}

export class CodexSubagentSettings {
  private containerEl: HTMLElement;
  private storage: CodexSubagentStorage;
  private agents: CodexSubagentDefinition[] = [];
  private onChanged?: () => void;
  private readonly notifications = new NoticeAdapter();

  constructor(containerEl: HTMLElement, storage: CodexSubagentStorage, onChanged?: () => void) {
    this.containerEl = containerEl;
    this.storage = storage;
    this.onChanged = onChanged;
    void this.render();
  }

  async render(): Promise<void> {
    this.containerEl.replaceChildren();

    try {
      this.agents = await this.storage.loadAll();
    } catch {
      this.agents = [];
    }

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-header' });
    appendElement(headerEl, 'span', { text: t('settings.codex.subagents.label'), className: 'typorai-sp-label' });

    const actionsEl = appendElement(headerEl, 'div', { className: 'typorai-sp-header-actions' });

    const refreshBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.refresh') },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => { void this.render(); });

    const addBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.add') },
    });
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', () => this.openModal(null));

    if (this.agents.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
      emptyEl.textContent = t('settings.codex.subagents.empty');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-list' });
    for (const agent of this.agents) {
      this.renderItem(listEl, agent);
    }
  }

  private renderItem(listEl: HTMLElement, agent: CodexSubagentDefinition): void {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-sp-item' });
    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-sp-info' });

    const headerRow = appendElement(infoEl, 'div', { className: 'typorai-sp-item-header' });
    appendElement(headerRow, 'span', { className: 'typorai-sp-item-name', text: agent.name });

    if (agent.model) {
      appendElement(headerRow, 'span', { text: agent.model, className: 'typorai-slash-item-badge' });
    }

    if (agent.description) {
      appendElement(infoEl, 'div', { className: 'typorai-sp-item-desc', text: agent.description });
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-sp-item-actions' });

    const editBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.edit') },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => this.openModal(agent));

    const deleteBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('common.delete') },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const confirmed = await confirmAction(
        t('settings.codex.subagentModal.errors.deleteConfirm', { name: agent.name }),
        t('common.delete'), t('common.cancel'),
      );
      if (!confirmed) return;
      try {
        await this.storage.delete(agent);
        await this.render();
        this.onChanged?.();
        this.notifications.show(t('settings.codex.subagentModal.errors.deletedNotice', { name: agent.name }));
      } catch {
        this.notifications.show(t('settings.codex.subagentModal.errors.deleteFailed'), 'error');
      }
      })();
    });
  }

  private openModal(existing: CodexSubagentDefinition | null): void {
    const modal = new CodexSubagentModal(
      existing,
      this.agents,
      async (agent) => {
        await this.storage.save(agent, existing);
        await this.render();
        this.onChanged?.();
        this.notifications.show(
          existing
            ? t('settings.codex.subagentModal.errors.updatedNotice', { name: agent.name })
            : t('settings.codex.subagentModal.errors.createdNotice', { name: agent.name }),
        );
      },
    );
    modal.open();
  }
}
