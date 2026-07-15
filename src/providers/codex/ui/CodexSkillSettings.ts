import { setIcon } from '@/ui/Icon';

import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import { t } from '../../../i18n/i18n';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { validateCommandName } from '../../../utils/slashCommand';
import {
  CODEX_SKILL_ROOT_OPTIONS,
  type CodexSkillRootId,
  createCodexSkillPersistenceKey,
  parseCodexSkillPersistenceKey,
} from '../storage/CodexSkillStorage';

export class CodexSkillModal extends NativeModal {
  private existing: ProviderCommandEntry | null;
  private onSave: (entry: ProviderCommandEntry) => Promise<void>;

  private _nameInput!: HTMLInputElement;
  private _descInput!: HTMLInputElement;
  private _contentArea!: HTMLTextAreaElement;
  private _selectedRootId: CodexSkillRootId;
  private _triggerSave!: () => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(
    existing: ProviderCommandEntry | null,
    onSave: (entry: ProviderCommandEntry) => Promise<void>
  ) {
    super();
    this.existing = existing;
    this.onSave = onSave;
    this._selectedRootId = parseCodexSkillPersistenceKey(existing?.persistenceKey)?.rootId ?? 'vault-codex';
  }

  /** Exposed for unit tests only. */
  getTestInputs() {
    return {
      nameInput: this._nameInput,
      descInput: this._descInput,
      contentArea: this._contentArea,
      setDirectory: (rootId: CodexSkillRootId) => { this._selectedRootId = rootId; },
      triggerSave: this._triggerSave,
    };
  }

  protected onOpen() {
    this.setTitle(this.existing
      ? t('settings.codex.skillModal.titleEdit')
      : t('settings.codex.skillModal.titleAdd'));
    this.modalEl.classList.add('typorai-sp-modal');

    const { contentEl } = this;

    const settings = new SettingBuilder(contentEl);
    settings.select(
      t('settings.codex.skillModal.directory.name'),
      this._selectedRootId,
      CODEX_SKILL_ROOT_OPTIONS.map(opt => ({ label: opt.label, value: opt.id })),
      value => { this._selectedRootId = value as CodexSkillRootId; },
      t('settings.codex.skillModal.directory.desc'),
    );

    this._nameInput = settings.text(
      t('settings.codex.skillModal.name.name'),
      this.existing?.name || '',
      () => undefined,
      t('settings.codex.skillModal.name.desc'),
    );
    this._nameInput.placeholder = t('settings.codex.skillModal.name.placeholder');

    this._descInput = settings.text(
      t('settings.codex.skillModal.description.name'),
      this.existing?.description || '',
      () => undefined,
      t('settings.codex.skillModal.description.desc'),
    );

    settings.heading(t('settings.codex.skillModal.instructions.name'));

    const contentArea = appendElement(contentEl, 'textarea', { className: 'typorai-sp-content-area' });
    contentArea.rows = 10;
    contentArea.placeholder = t('settings.codex.skillModal.instructions.placeholder');
    contentArea.value = this.existing?.content || '';
    this._contentArea = contentArea;

    const doSave = async () => {
      const name = this._nameInput.value.trim();
      const nameError = validateCommandName(name);
      if (nameError) {
        this.notifications.show(nameError, 'error');
        return;
      }

      const content = this._contentArea.value;
      if (!content.trim()) {
        this.notifications.show(t('settings.codex.skills.instructionsRequired'), 'error');
        return;
      }

      const entry: ProviderCommandEntry = {
        id: this.existing?.id || `codex-skill-${name}`,
        providerId: 'codex',
        kind: 'skill',
        name,
        description: this._descInput.value.trim() || undefined,
        content,
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
        persistenceKey: createCodexSkillPersistenceKey({
          rootId: this._selectedRootId,
          ...(this.existing?.name ? { currentName: this.existing.name } : {}),
        }),
      };

      try {
        await this.onSave(entry);
      } catch {
        this.notifications.show(t('settings.codex.skills.saveFailed'), 'error');
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

export class CodexSkillSettings {
  private containerEl: HTMLElement;
  private catalog: ProviderCommandCatalog;
  private entries: ProviderCommandEntry[] = [];
  private readonly notifications = new NoticeAdapter();

  constructor(containerEl: HTMLElement, catalog: ProviderCommandCatalog) {
    this.containerEl = containerEl;
    this.catalog = catalog;
    void this.render();
  }

  async deleteEntry(entry: ProviderCommandEntry): Promise<void> {
    await this.catalog.deleteVaultEntry(entry);
    await this.render();
  }

  async refresh(): Promise<void> {
    await this.catalog.refresh();
    await this.render();
  }

  async render(): Promise<void> {
    this.containerEl.replaceChildren();

    try {
      this.entries = await this.catalog.listVaultEntries();
    } catch {
      this.entries = [];
    }

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-header' });
    appendElement(headerEl, 'span', { text: t('settings.codex.skills.label'), className: 'typorai-sp-label' });

    const actionsEl = appendElement(headerEl, 'div', { className: 'typorai-sp-header-actions' });
    const refreshBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.refresh') },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => { void this.refresh(); });

    const addBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.add') },
    });
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', () => this.openModal(null));

    if (this.entries.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
      emptyEl.textContent = t('settings.codex.skills.empty');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-list' });
    for (const entry of this.entries) {
      this.renderItem(listEl, entry);
    }
  }

  private renderItem(listEl: HTMLElement, entry: ProviderCommandEntry): void {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-sp-item' });
    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-sp-info' });

    const headerRow = appendElement(infoEl, 'div', { className: 'typorai-sp-item-header' });
    appendElement(headerRow, 'span', { className: 'typorai-sp-item-name', text: `$${entry.name}` });
    appendElement(headerRow, 'span', { text: t('settings.codex.skills.skillBadge'), className: 'typorai-slash-item-badge' });

    if (entry.description) {
      appendElement(infoEl, 'div', { className: 'typorai-sp-item-desc', text: entry.description });
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-sp-item-actions' });

    if (entry.isEditable) {
      const editBtn = appendElement(actionsEl, 'button', {
        className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.edit') },
      });
      setIcon(editBtn, 'pencil');
      editBtn.addEventListener('click', () => this.openModal(entry));
    }

    if (entry.isDeletable) {
      const deleteBtn = appendElement(actionsEl, 'button', {
        className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('common.delete') },
      });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
        try {
          await this.deleteEntry(entry);
          this.notifications.show(t('settings.codex.skills.deletedNotice', { name: entry.name }));
        } catch {
          this.notifications.show(t('settings.codex.skills.deleteFailed'), 'error');
        }
        })();
      });
    }
  }

  private openModal(existing: ProviderCommandEntry | null): void {
    const modal = new CodexSkillModal(
      existing,
      async (entry) => {
        await this.catalog.saveVaultEntry(entry);
        await this.render();
        this.notifications.show(existing
          ? t('settings.codex.skills.updatedNotice', { name: entry.name })
          : t('settings.codex.skills.createdNotice', { name: entry.name }));
      }
    );
    modal.open();
  }
}
