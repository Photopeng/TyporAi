import { setIcon } from '@/ui/Icon';

import type {
  AppAgentManager,
  AppAgentStorage,
} from '../../../core/providers/types';
import type { AgentDefinition } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { confirmAction } from '../../../ui/confirm';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { validateAgentName } from '../../../utils/agent';

type ModelOptionValue = 'inherit' | 'sonnet' | 'opus' | 'haiku';

const MODEL_OPTIONS: ReadonlyArray<{ value: ModelOptionValue; key: 'inherit' | 'sonnet' | 'opus' | 'haiku' }> = [
  { value: 'inherit', key: 'inherit' },
  { value: 'sonnet', key: 'sonnet' },
  { value: 'opus', key: 'opus' },
  { value: 'haiku', key: 'haiku' },
];

function modelOptionLabel(value: ModelOptionValue): string {
  const key = MODEL_OPTIONS.find(o => o.value === value)?.key ?? 'inherit';
  return t(`settings.subagents.modelOptions.${key}`);
}

export class AgentModal extends NativeModal {
  private existingAgent: AgentDefinition | null;
  private getAvailableAgents: () => AgentDefinition[];
  private onSave: (agent: AgentDefinition) => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(
    existingAgent: AgentDefinition | null,
    getAvailableAgents: () => AgentDefinition[],
    onSave: (agent: AgentDefinition) => Promise<void>
  ) {
    super();
    this.existingAgent = existingAgent;
    this.getAvailableAgents = getAvailableAgents;
    this.onSave = onSave;
  }

  protected onOpen() {
    this.setTitle(
      this.existingAgent
        ? t('settings.subagents.modal.titleEdit')
        : t('settings.subagents.modal.titleAdd')
    );
    this.modalEl.classList.add('typorai-sp-modal');

    const { contentEl } = this;

    let modelValue: string = this.existingAgent?.model ?? 'inherit';

    const settings = new SettingBuilder(contentEl);
    const nameInput = settings.text(t('settings.subagents.modal.name'), this.existingAgent?.name || '', () => undefined, t('settings.subagents.modal.nameDesc'));
    nameInput.placeholder = t('settings.subagents.modal.namePlaceholder');
    const descInput = settings.text(t('settings.subagents.modal.description'), this.existingAgent?.description || '', () => undefined, t('settings.subagents.modal.descriptionDesc'));
    descInput.placeholder = t('settings.subagents.modal.descriptionPlaceholder');

    const details = appendElement(contentEl, 'details', { className: 'typorai-sp-advanced-section' });
    appendElement(details, 'summary', { text: t('settings.subagents.modal.advancedOptions'), className: 'typorai-sp-advanced-summary' });
    if ((this.existingAgent?.model && this.existingAgent.model !== 'inherit') ||
        this.existingAgent?.tools?.length ||
        this.existingAgent?.disallowedTools?.length ||
        this.existingAgent?.skills?.length) {
      details.open = true;
    }

    const advanced = new SettingBuilder(details);
    advanced.select(t('settings.subagents.modal.model'), modelValue, MODEL_OPTIONS.map(option => ({ value: option.value, label: modelOptionLabel(option.value) })), value => { modelValue = value; }, t('settings.subagents.modal.modelDesc'));
    const toolsInput = advanced.text(t('settings.subagents.modal.tools'), this.existingAgent?.tools?.join(', ') || '', () => undefined, t('settings.subagents.modal.toolsDesc'));
    const disallowedToolsInput = advanced.text(t('settings.subagents.modal.disallowedTools'), this.existingAgent?.disallowedTools?.join(', ') || '', () => undefined, t('settings.subagents.modal.disallowedToolsDesc'));
    const skillsInput = advanced.text(t('settings.subagents.modal.skills'), this.existingAgent?.skills?.join(', ') || '', () => undefined, t('settings.subagents.modal.skillsDesc'));

    settings.heading(t('settings.subagents.modal.prompt'));
    const contentArea = appendElement(contentEl, 'textarea', { className: 'typorai-sp-content-area' });
    contentArea.rows = 10;
    contentArea.placeholder = t('settings.subagents.modal.promptPlaceholder');
    contentArea.value = this.existingAgent?.prompt || '';

    const buttonContainer = appendElement(contentEl, 'div', { className: 'typorai-sp-modal-buttons' });

    const cancelBtn = appendElement(buttonContainer, 'button', { text: t('common.cancel'), className: 'typorai-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = appendElement(buttonContainer, 'button', { text: t('common.save'), className: 'typorai-save-btn' });
    saveBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const name = nameInput.value.trim();
      const nameError = validateAgentName(name);
      if (nameError) {
        this.notifications.show(t(`validation.slug.${nameError}` as any, { label: t('validation.slug.labelAgent') }), 'error');
        return;
      }

      const description = descInput.value.trim();
      if (!description) {
        this.notifications.show(t('settings.subagents.descriptionRequired'), 'error');
        return;
      }

      const prompt = contentArea.value;
      if (!prompt.trim()) {
        this.notifications.show(t('settings.subagents.promptRequired'), 'error');
        return;
      }

      const allAgents = this.getAvailableAgents();
      const duplicate = allAgents.find(
        a => a.id.toLowerCase() === name.toLowerCase() &&
             a.id !== this.existingAgent?.id
      );
      if (duplicate) {
        this.notifications.show(t('settings.subagents.duplicateName', { name }), 'error');
        return;
      }

      const parseList = (input: HTMLInputElement): string[] | undefined => {
        const val = input.value.trim();
        if (!val) return undefined;
        return val.split(',').map(s => s.trim()).filter(Boolean);
      };

      const agent: AgentDefinition = {
        id: name,
        name,
        description,
        prompt,
        tools: parseList(toolsInput),
        disallowedTools: parseList(disallowedToolsInput),
        model: (modelValue) || 'inherit',
        source: 'vault',
        filePath: this.existingAgent?.filePath,
        skills: parseList(skillsInput),
        permissionMode: this.existingAgent?.permissionMode,
        hooks: this.existingAgent?.hooks,
        extraFrontmatter: this.existingAgent?.extraFrontmatter,
      };

      try {
        await this.onSave(agent);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('common.unknown');
        this.notifications.show(t('settings.subagents.saveFailed', { message }), 'error');
        return;
      }
      this.close();
      })();
    });
  }

  protected onClose() {
    this.contentEl.replaceChildren();
  }
}

export interface AgentSettingsDeps {
  agentManager: Pick<AppAgentManager, 'getAvailableAgents' | 'loadAgents'>;
  agentStorage: Pick<AppAgentStorage, 'load' | 'save' | 'delete'>;
}

export class AgentSettings {
  private containerEl: HTMLElement;
  private agentManager: Pick<AppAgentManager, 'getAvailableAgents' | 'loadAgents'>;
  private agentStorage: Pick<AppAgentStorage, 'load' | 'save' | 'delete'>;
  private readonly notifications = new NoticeAdapter();

  constructor(containerEl: HTMLElement, deps: AgentSettingsDeps) {
    this.containerEl = containerEl;
    this.agentManager = deps.agentManager;
    this.agentStorage = deps.agentStorage;
    this.render();
  }

  private render(): void {
    this.containerEl.replaceChildren();

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-header' });
    appendElement(headerEl, 'span', { text: t('settings.subagents.name'), className: 'typorai-sp-label' });

    const actionsEl = appendElement(headerEl, 'div', { className: 'typorai-sp-header-actions' });

    const refreshBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.refresh') } });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => { void this.refreshAgents(); });

    const addBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.add') } });
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', () => { void this.openAgentModal(null); });

    const allAgents = this.agentManager.getAvailableAgents();
    const vaultAgents = allAgents.filter(a => a.source === 'vault');

    if (vaultAgents.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
      emptyEl.textContent = t('settings.subagents.noAgents');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-list' });

    for (const agent of vaultAgents) {
      this.renderAgentItem(listEl, agent);
    }
  }

  private renderAgentItem(listEl: HTMLElement, agent: AgentDefinition): void {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-sp-item' });

    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-sp-info' });

    const headerRow = appendElement(infoEl, 'div', { className: 'typorai-sp-item-header' });

    appendElement(headerRow, 'span', { className: 'typorai-sp-item-name', text: agent.name });

    if (agent.description) {
      appendElement(infoEl, 'div', { className: 'typorai-sp-item-desc', text: agent.description });
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-sp-item-actions' });

    const editBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.edit') } });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => { void this.openAgentModal(agent); });

    const deleteBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('common.delete') } });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const confirmed = await confirmAction(
        t('settings.subagents.deleteConfirm', { name: agent.name }), t('common.delete'), t('common.cancel'),
      );
      if (!confirmed) return;
      try {
        await this.deleteAgent(agent);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('common.unknown');
        this.notifications.show(t('settings.subagents.deleteFailed', { message }), 'error');
      }
      })();
    });
  }

  private async refreshAgents(): Promise<void> {
    try {
      await this.agentManager.loadAgents();
      this.render();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknown');
      this.notifications.show(t('settings.subagents.refreshFailed', { message }), 'error');
    }
  }

  private async openAgentModal(existingAgent: AgentDefinition | null): Promise<void> {
    let fresh: AgentDefinition | null;
    if (existingAgent) {
      try {
        fresh = await this.agentStorage.load(existingAgent) ?? existingAgent;
      } catch (err) {
        const message = err instanceof Error ? err.message : t('common.unknown');
        this.notifications.show(t('settings.subagents.loadFailed', { name: existingAgent.name, message }), 'error');
        return;
      }
    } else {
      fresh = null;
    }

    new AgentModal(
      fresh,
      () => this.agentManager.getAvailableAgents(),
      (agent) => this.saveAgent(agent, fresh)
    ).open();
  }

  private async saveAgent(agent: AgentDefinition, existing: AgentDefinition | null): Promise<void> {
    if (existing && existing.name !== agent.name) {
      // Rename: save to new name-based path, then delete old file
      await this.agentStorage.save({ ...agent, filePath: undefined });
      try {
        await this.agentStorage.delete(existing);
      } catch {
        this.notifications.show(t('settings.subagents.renameCleanupFailed', { name: existing.name }), 'warning');
      }
    } else {
      await this.agentStorage.save(agent);
    }

    try {
      await this.agentManager.loadAgents();
    } catch {
      // Non-critical: agent list will refresh on next settings open
    }
    this.render();
    this.notifications.show(
      existing
        ? t('settings.subagents.updated', { name: agent.name })
        : t('settings.subagents.created', { name: agent.name })
    );
  }

  private async deleteAgent(agent: AgentDefinition): Promise<void> {
    await this.agentStorage.delete(agent);

    try {
      await this.agentManager.loadAgents();
    } catch {
      // Non-critical: agent list will refresh on next settings open
    }
    this.render();
    this.notifications.show(t('settings.subagents.deleted', { name: agent.name }));
  }

}
