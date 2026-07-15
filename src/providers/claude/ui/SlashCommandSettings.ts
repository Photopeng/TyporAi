import { setIcon } from '@/ui/Icon';

import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import { t } from '../../../i18n/i18n';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { extractFirstParagraph, normalizeArgumentHint, parseSlashCommandContent, validateCommandName } from '../../../utils/slashCommand';

function resolveAllowedTools(inputValue: string, parsedTools?: string[]): string[] | undefined {
  const trimmed = inputValue.trim();
  if (trimmed) {
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (parsedTools && parsedTools.length > 0) {
    return parsedTools;
  }
  return undefined;
}

function isSkillEntry(entry: ProviderCommandEntry): boolean {
  return entry.kind === 'skill';
}

export class SlashCommandModal extends NativeModal {
  private entries: ProviderCommandEntry[];
  private existingEntry: ProviderCommandEntry | null;
  private onSave: (entry: ProviderCommandEntry) => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(
    entries: ProviderCommandEntry[],
    existingEntry: ProviderCommandEntry | null,
    onSave: (entry: ProviderCommandEntry) => Promise<void>,
  ) {
    super();
    this.entries = entries;
    this.existingEntry = existingEntry;
    this.onSave = onSave;
  }

  protected onOpen() {
    const existingIsSkill = this.existingEntry ? isSkillEntry(this.existingEntry) : false;
    let selectedType: 'command' | 'skill' = existingIsSkill ? 'skill' : 'command';

    const typeLabel = () => selectedType === 'skill' ? t('settings.claude.slashCommands.type.skillLabel') : t('settings.claude.slashCommands.type.commandLabel');

    this.setTitle(this.existingEntry ? `${t('common.edit')} ${typeLabel()}` : `${t('common.add')} ${typeLabel()}`);
    this.modalEl.classList.add('typorai-sp-modal');

    const { contentEl } = this;

    let disableModelToggle = this.existingEntry?.disableModelInvocation ?? false;
    let disableUserInvocation = this.existingEntry?.userInvocable === false;
    let contextValue: 'fork' | '' = this.existingEntry?.context ?? '';
    let disableUserSetting: HTMLElement | null = null;
    let disableUserToggle: HTMLInputElement | null = null;

    const updateSkillOnlyFields = () => {
      if (!disableUserSetting || !disableUserToggle) return;

      const isSkillType = selectedType === 'skill';
      disableUserSetting.classList.toggle('typorai-hidden', !isSkillType);
      if (!isSkillType) {
        disableUserInvocation = false;
        disableUserToggle.checked = false;
      }
    };

    const settings = new SettingBuilder(contentEl);
    const typeInput = settings.select(
      t('settings.claude.slashCommands.type.name'), selectedType,
      [
        { value: 'command', label: t('settings.claude.slashCommands.type.commandOption') },
        { value: 'skill', label: t('settings.claude.slashCommands.type.skillOption') },
      ],
      value => { selectedType = value as 'command' | 'skill'; this.setTitle(this.existingEntry ? `${t('common.edit')} ${typeLabel()}` : `${t('common.add')} ${typeLabel()}`); updateSkillOnlyFields(); },
      t('settings.claude.slashCommands.type.desc'),
    );
    typeInput.disabled = this.existingEntry !== null;
    const nameInput = settings.text(t('settings.claude.slashCommands.name.name'), this.existingEntry?.name || '', () => undefined, t('settings.claude.slashCommands.name.desc'));
    nameInput.placeholder = t('settings.claude.slashCommands.name.placeholder');
    const descInput = settings.text(t('settings.claude.slashCommands.description.name'), this.existingEntry?.description || '', () => undefined, t('settings.claude.slashCommands.description.desc'));

    const details = appendElement(contentEl, 'details', { className: 'typorai-sp-advanced-section' });
    appendElement(details, 'summary', { text: t('settings.claude.slashCommands.advancedOptions'), className: 'typorai-sp-advanced-summary' });
    if (
      this.existingEntry?.argumentHint
      || this.existingEntry?.model
      || this.existingEntry?.allowedTools?.length
      || this.existingEntry?.disableModelInvocation
      || this.existingEntry?.userInvocable === false
      || this.existingEntry?.context
      || this.existingEntry?.agent
    ) {
      details.open = true;
    }

    const advanced = new SettingBuilder(details);
    const hintInput = advanced.text(t('settings.claude.slashCommands.argumentHint.name'), this.existingEntry?.argumentHint || '', () => undefined, t('settings.claude.slashCommands.argumentHint.desc'));
    const modelInput = advanced.text(t('settings.claude.slashCommands.modelOverride.name'), this.existingEntry?.model || '', () => undefined, t('settings.claude.slashCommands.modelOverride.desc'));
    modelInput.placeholder = t('settings.claude.slashCommands.modelOverride.placeholder');
    const toolsInput = advanced.text(t('settings.claude.slashCommands.allowedTools.name'), this.existingEntry?.allowedTools?.join(', ') || '', () => undefined, t('settings.claude.slashCommands.allowedTools.desc'));
    advanced.toggle(t('settings.claude.slashCommands.disableModelInvocation.name'), disableModelToggle, value => { disableModelToggle = value; }, t('settings.claude.slashCommands.disableModelInvocation.desc'));
    disableUserToggle = advanced.toggle(t('settings.claude.slashCommands.disableUserInvocation.name'), disableUserInvocation, value => { disableUserInvocation = value; }, t('settings.claude.slashCommands.disableUserInvocation.desc'));
    disableUserSetting = disableUserToggle.closest('.setting-item');

    updateSkillOnlyFields();

    const agentInput = advanced.text(t('settings.claude.slashCommands.agent.name'), this.existingEntry?.agent || '', () => undefined, t('settings.claude.slashCommands.agent.desc'));
    agentInput.placeholder = t('settings.claude.slashCommands.agent.placeholder');
    const agentSetting = agentInput.closest<HTMLElement>('.setting-item');
    agentSetting?.classList.toggle('typorai-hidden', contextValue !== 'fork');
    advanced.toggle(t('settings.claude.slashCommands.context.name'), contextValue === 'fork', value => {
      contextValue = value ? 'fork' : '';
      agentSetting?.classList.toggle('typorai-hidden', !value);
    }, t('settings.claude.slashCommands.context.desc'));

    settings.heading(t('settings.claude.slashCommands.prompt.name'));
    const contentArea = appendElement(contentEl, 'textarea', { className: 'typorai-sp-content-area' });
    contentArea.rows = 10;
    contentArea.placeholder = t('settings.claude.slashCommands.promptPlaceholder');
    const initialContent = this.existingEntry
      ? parseSlashCommandContent(this.existingEntry.content).promptContent
      : '';
    contentArea.value = initialContent;

    const buttonContainer = appendElement(contentEl, 'div', { className: 'typorai-sp-modal-buttons' });

    const cancelBtn = appendElement(buttonContainer, 'button', { text: t('common.cancel'), className: 'typorai-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = appendElement(buttonContainer, 'button', { text: t('common.save'), className: 'typorai-save-btn' });
    saveBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const name = nameInput.value.trim();
      const nameError = validateCommandName(name);
      if (nameError) {
        this.notifications.show(t(`validation.slug.${nameError}` as any, { label: t('validation.slug.labelCommand') }), 'error');
        return;
      }

      const content = contentArea.value;
      if (!content.trim()) {
        this.notifications.show(t('settings.claude.slashCommands.promptRequired'), 'error');
        return;
      }

      const existing = this.entries.find(
        entry => entry.name.toLowerCase() === name.toLowerCase()
          && entry.id !== this.existingEntry?.id,
      );
      if (existing) {
        this.notifications.show(t('settings.claude.slashCommands.duplicateName', { name }), 'error');
        return;
      }

      const parsed = parseSlashCommandContent(content);
      const promptContent = parsed.promptContent;
      const isSkillType = selectedType === 'skill';

      const entry: ProviderCommandEntry = {
        id: this.existingEntry?.id || (
          isSkillType
            ? `skill-${name}`
            : `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
        ),
        providerId: 'claude',
        kind: isSkillType ? 'skill' : 'command',
        name,
        description: descInput.value.trim() || parsed.description || undefined,
        argumentHint: normalizeArgumentHint(hintInput.value.trim()) || parsed.argumentHint || undefined,
        allowedTools: resolveAllowedTools(toolsInput.value, parsed.allowedTools),
        model: modelInput.value.trim() || parsed.model || undefined,
        content: promptContent,
        disableModelInvocation: disableModelToggle || undefined,
        userInvocable: disableUserInvocation ? false : undefined,
        context: contextValue || undefined,
        agent: contextValue === 'fork' ? (agentInput.value.trim() || undefined) : undefined,
        hooks: parsed.hooks ?? this.existingEntry?.hooks,
        scope: 'vault',
        source: this.existingEntry?.source ?? 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '/',
        insertPrefix: '/',
        persistenceKey: this.existingEntry?.persistenceKey,
      };

      try {
        await this.onSave(entry);
      } catch {
        const label = t(isSkillType ? 'settings.claude.slashCommands.skillLabel' : 'settings.claude.slashCommands.slashCommandLabel');
        this.notifications.show(t('settings.claude.slashCommands.saveFailedWithLabel', { label }), 'error');
        return;
      }
      this.close();
      })();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    contentEl.addEventListener('keydown', handleKeyDown);
  }

  protected onClose() {
    this.contentEl.replaceChildren();
  }
}

export class SlashCommandSettings {
  private containerEl: HTMLElement;
  private catalog: ProviderCommandCatalog | null;
  private commands: ProviderCommandEntry[] = [];
  private readonly notifications = new NoticeAdapter();

  constructor(
    containerEl: HTMLElement,
    catalog: ProviderCommandCatalog | null,
  ) {
    this.containerEl = containerEl;
    this.catalog = catalog;
    void this.loadAndRender();
  }

  private async loadAndRender(): Promise<void> {
    if (!this.catalog) {
      this.renderUnavailable();
      return;
    }

    this.commands = await this.catalog.listVaultEntries();
    this.render();
  }

  private renderUnavailable(): void {
    this.containerEl.replaceChildren();
    const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
    emptyEl.textContent = t('settings.claude.slashCommands.unavailable');
  }

  private render(): void {
    this.containerEl.replaceChildren();

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-header' });
    appendElement(headerEl, 'span', { text: t('settings.slashCommands.name'), className: 'typorai-sp-label' });

    const actionsEl = appendElement(headerEl, 'div', { className: 'typorai-sp-header-actions' });

    const addBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.add') } });
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', () => this.openCommandModal(null));

    if (this.commands.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
      emptyEl.textContent = t('settings.claude.slashCommands.emptyNone');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-list' });

    for (const cmd of this.commands) {
      this.renderCommandItem(listEl, cmd);
    }
  }

  private renderCommandItem(listEl: HTMLElement, cmd: ProviderCommandEntry): void {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-sp-item' });

    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-sp-info' });

    const headerRow = appendElement(infoEl, 'div', { className: 'typorai-sp-item-header' });

    appendElement(headerRow, 'span', { className: 'typorai-sp-item-name', text: `/${cmd.name}` });

    if (isSkillEntry(cmd)) {
      appendElement(headerRow, 'span', { text: t('settings.claude.slashCommands.skillBadge'), className: 'typorai-slash-item-badge' });
    }

    if (cmd.argumentHint) {
      appendElement(headerRow, 'span', { className: 'typorai-slash-item-hint', text: cmd.argumentHint });
    }

    if (cmd.description) {
      appendElement(infoEl, 'div', { className: 'typorai-sp-item-desc', text: cmd.description });
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-sp-item-actions' });

    if (cmd.isEditable) {
      const editBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.edit') } });
      setIcon(editBtn, 'pencil');
      editBtn.addEventListener('click', () => this.openCommandModal(cmd));
    }

    if (!isSkillEntry(cmd) && cmd.isEditable) {
      const convertBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.claude.slashCommands.convertToSkillAria') } });
      setIcon(convertBtn, 'package');
      convertBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
        try {
          await this.transformToSkill(cmd);
        } catch {
          this.notifications.show(t('settings.claude.slashCommands.convertFailed'), 'error');
        }
        })();
      });
    }

    if (cmd.isDeletable) {
      const deleteBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('common.delete') } });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
        try {
          await this.deleteCommand(cmd);
        } catch {
          const label = t(isSkillEntry(cmd) ? 'settings.claude.slashCommands.skillLabel' : 'settings.claude.slashCommands.slashCommandLabel');
          this.notifications.show(t('settings.claude.slashCommands.deleteFailedWithLabel', { label }), 'error');
        }
        })();
      });
    }
  }

  private openCommandModal(existingCmd: ProviderCommandEntry | null): void {
    const modal = new SlashCommandModal(
      this.commands,
      existingCmd,
      async (cmd) => {
        await this.saveCommand(cmd, existingCmd);
      },
    );
    modal.open();
  }

  private async saveCommand(cmd: ProviderCommandEntry, existing: ProviderCommandEntry | null): Promise<void> {
    if (!this.catalog) {
      return;
    }

    await this.catalog.saveVaultEntry(cmd);

    if (existing && existing.name !== cmd.name) {
      await this.catalog.deleteVaultEntry(existing);
    }

    await this.reloadCommands();

    this.render();
    const label = t(isSkillEntry(cmd) ? 'settings.claude.slashCommands.skillLabel' : 'settings.claude.slashCommands.slashCommandLabel');
    this.notifications.show(t(
      existing ? 'settings.claude.slashCommands.noticeUpdated' : 'settings.claude.slashCommands.noticeCreated',
      { label, name: cmd.name },
    ));
  }

  private async deleteCommand(cmd: ProviderCommandEntry): Promise<void> {
    if (!this.catalog) {
      return;
    }

    await this.catalog.deleteVaultEntry(cmd);

    await this.reloadCommands();

    this.render();
    const label = t(isSkillEntry(cmd) ? 'settings.claude.slashCommands.skillLabel' : 'settings.claude.slashCommands.slashCommandLabel');
    this.notifications.show(t('settings.claude.slashCommands.noticeDeleted', { label, name: cmd.name }));
  }

  private async transformToSkill(cmd: ProviderCommandEntry): Promise<void> {
    if (!this.catalog) {
      return;
    }

    const skillName = cmd.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);

    const existingSkill = this.commands.find(
      entry => isSkillEntry(entry) && entry.name === skillName,
    );
    if (existingSkill) {
      this.notifications.show(t('settings.claude.slashCommands.duplicateSkillName', { name: skillName }), 'error');
      return;
    }

    const skill: ProviderCommandEntry = {
      ...cmd,
      id: `skill-${skillName}`,
      kind: 'skill',
      name: skillName,
      description: cmd.description || extractFirstParagraph(cmd.content),
      source: 'user',
      scope: 'vault',
      isEditable: true,
      isDeletable: true,
      displayPrefix: '/',
      insertPrefix: '/',
    };

    await this.catalog.saveVaultEntry(skill);
    await this.catalog.deleteVaultEntry(cmd);

    await this.reloadCommands();
    this.render();
    this.notifications.show(t('settings.claude.slashCommands.converted', { name: cmd.name }));
  }

  private async reloadCommands(): Promise<void> {
    if (!this.catalog) {
      this.commands = [];
      return;
    }

    this.commands = await this.catalog.listVaultEntries();
  }

  public refresh(): void {
    void this.loadAndRender();
  }
}
