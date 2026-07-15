import { setIcon } from '@/ui/Icon';

import { t } from '../../../i18n/i18n';
import { confirmAction } from '../../../ui/confirm';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import type { OpencodeAgentStorage } from '../storage/OpencodeAgentStorage';
import type { OpencodeAgentDefinition } from '../types/agent';

const OPENCODE_AGENT_INVALID_SEGMENT_PATTERN = /[<>:"\\|?*]/;

export function validateOpencodeAgentName(name: string): string | null {
  if (!name) return t('settings.opencode.agentModal.name.required');

  const segments = name.split('/');
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    return t('settings.opencode.agentModal.name.slashLeadingTrailing');
  }

  for (const segment of segments) {
    if (!segment.trim()) {
      return t('settings.opencode.agentModal.name.segmentEmpty');
    }

    if (segment !== segment.trim()) {
      return t('settings.opencode.agentModal.name.segmentWhitespace');
    }

    if (segment === '.' || segment === '..') {
      return t('settings.opencode.agentModal.name.dotSegment');
    }

    if (segment.includes('\0') || OPENCODE_AGENT_INVALID_SEGMENT_PATTERN.test(segment)) {
      return t('settings.opencode.agentModal.name.reservedChars');
    }
  }

  return null;
}

export function findOpencodeAgentNameConflict(
  agents: OpencodeAgentDefinition[],
  name: string,
  currentPersistenceKey?: string,
): OpencodeAgentDefinition | null {
  const normalizedName = name.toLowerCase();
  return agents.find(
    (agent) => agent.name.toLowerCase() === normalizedName
      && agent.persistenceKey !== currentPersistenceKey,
  ) ?? null;
}

export class OpencodeAgentModal extends NativeModal {
  private existing: OpencodeAgentDefinition | null;
  private allAgents: OpencodeAgentDefinition[];
  private onSave: (agent: OpencodeAgentDefinition) => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(
    existing: OpencodeAgentDefinition | null,
    allAgents: OpencodeAgentDefinition[],
    onSave: (agent: OpencodeAgentDefinition) => Promise<void>,
  ) {
    super();
    this.existing = existing;
    this.allAgents = allAgents;
    this.onSave = onSave;
  }

  protected onOpen() {
    this.setTitle(this.existing
      ? t('settings.opencode.agentModal.titleEdit')
      : t('settings.opencode.agentModal.titleAdd'));
    this.modalEl.classList.add('typorai-sp-modal');

    const { contentEl } = this;

    let hiddenValue = this.existing?.hidden ?? false;
    let disableValue = this.existing?.disable ?? false;

    const settings = new SettingBuilder(contentEl);
    const nameInput = settings.text(t('settings.opencode.agentModal.name.name'), this.existing?.name ?? '', () => undefined, t('settings.opencode.agentModal.name.desc'));
    nameInput.placeholder = t('settings.opencode.agentModal.name.placeholder');
    const descriptionInput = settings.text(t('settings.opencode.agentModal.description.name'), this.existing?.description ?? '', () => undefined, t('settings.opencode.agentModal.description.desc'));
    descriptionInput.placeholder = t('settings.opencode.agentModal.description.placeholder');

    const details = appendElement(contentEl, 'details', { className: 'typorai-sp-advanced-section' });
    appendElement(details, 'summary', { text: t('settings.opencode.agentModal.advanced'), className: 'typorai-sp-advanced-summary' });
    if (
      this.existing?.model ||
      this.existing?.variant ||
      this.existing?.temperature !== undefined ||
      this.existing?.topP !== undefined ||
      this.existing?.color ||
      this.existing?.steps !== undefined ||
      this.existing?.hidden ||
      this.existing?.disable ||
      this.existing?.tools ||
      this.existing?.permission !== undefined ||
      this.existing?.options
    ) {
      details.open = true;
    }

    const advanced = new SettingBuilder(details);
    const modelInput = advanced.text(t('settings.opencode.agentModal.model.name'), this.existing?.model ?? '', () => undefined, t('settings.opencode.agentModal.model.desc'));
    modelInput.placeholder = t('settings.opencode.agentModal.model.placeholder');
    const variantInput = advanced.text(t('settings.opencode.agentModal.variant.name'), this.existing?.variant ?? '', () => undefined, t('settings.opencode.agentModal.variant.desc'));
    variantInput.placeholder = t('settings.opencode.agentModal.variant.placeholder');
    const temperatureInput = advanced.text(t('settings.opencode.agentModal.temperature.name'), this.existing?.temperature !== undefined ? String(this.existing.temperature) : '', () => undefined, t('settings.opencode.agentModal.temperature.desc'));
    temperatureInput.placeholder = t('settings.opencode.agentModal.temperature.placeholder');
    const topPInput = advanced.text(t('settings.opencode.agentModal.topP.name'), this.existing?.topP !== undefined ? String(this.existing.topP) : '', () => undefined, t('settings.opencode.agentModal.topP.desc'));
    topPInput.placeholder = t('settings.opencode.agentModal.topP.placeholder');
    const colorInput = advanced.text(t('settings.opencode.agentModal.color.name'), this.existing?.color ?? '', () => undefined, t('settings.opencode.agentModal.color.desc'));
    colorInput.placeholder = t('settings.opencode.agentModal.color.placeholder');
    const stepsInput = advanced.text(t('settings.opencode.agentModal.steps.name'), this.existing?.steps !== undefined ? String(this.existing.steps) : '', () => undefined, t('settings.opencode.agentModal.steps.desc'));
    stepsInput.placeholder = t('settings.opencode.agentModal.steps.placeholder');

    advanced.toggle(t('settings.opencode.agentModal.hidden.name'), hiddenValue, value => { hiddenValue = value; }, t('settings.opencode.agentModal.hidden.desc'));
    advanced.toggle(t('settings.opencode.agentModal.disable.name'), disableValue, value => { disableValue = value; }, t('settings.opencode.agentModal.disable.desc'));
    const toolsInput = advanced.textarea(t('settings.opencode.agentModal.tools.name'), this.existing?.tools ? JSON.stringify(this.existing.tools, null, 2) : '', () => undefined, t('settings.opencode.agentModal.tools.desc'));
    toolsInput.placeholder = t('settings.opencode.agentModal.tools.placeholder');
    const permissionInput = advanced.textarea(t('settings.opencode.agentModal.permission.name'), this.existing?.permission !== undefined ? JSON.stringify(this.existing.permission, null, 2) : '', () => undefined, t('settings.opencode.agentModal.permission.desc'));
    permissionInput.placeholder = t('settings.opencode.agentModal.permission.placeholder');
    const optionsInput = advanced.textarea(t('settings.opencode.agentModal.options.name'), this.existing?.options ? JSON.stringify(this.existing.options, null, 2) : '', () => undefined, t('settings.opencode.agentModal.options.desc'));
    optionsInput.placeholder = t('settings.opencode.agentModal.options.placeholder');

    settings.heading(t('settings.opencode.agentModal.prompt.name'));
    const promptArea = appendElement(contentEl, 'textarea', { className: 'typorai-sp-content-area' });
    promptArea.rows = 10;
    promptArea.placeholder = t('settings.opencode.agentModal.prompt.placeholder');
    promptArea.value = this.existing?.prompt ?? '';

    const buttonContainer = appendElement(contentEl, 'div', { className: 'typorai-sp-modal-buttons' });

    const cancelBtn = appendElement(buttonContainer, 'button', { text: t('common.cancel'), className: 'typorai-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = appendElement(buttonContainer, 'button', { text: t('common.save'), className: 'typorai-save-btn' });
    saveBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const name = nameInput.value.trim();
      const nameError = validateOpencodeAgentName(name);
      if (nameError) {
        this.notifications.show(nameError, 'error');
        return;
      }

      const description = descriptionInput.value.trim();
      if (!description) {
        this.notifications.show(t('settings.opencode.agentModal.description.required'), 'error');
        return;
      }

      const prompt = promptArea.value;
      if (!prompt.trim()) {
        this.notifications.show(t('settings.opencode.agentModal.prompt.required'), 'error');
        return;
      }

      const duplicate = findOpencodeAgentNameConflict(
        this.allAgents,
        name,
        this.existing?.persistenceKey,
      );
      if (duplicate) {
        this.notifications.show(t('settings.opencode.agentModal.errors.duplicate', { name }), 'error');
        return;
      }

      const temperature = parseOptionalNumber(
        temperatureInput.value,
        'settings.opencode.agentModal.temperature.invalid',
      );
      if (temperature.error) {
        this.notifications.show(temperature.error, 'error');
        return;
      }

      const topP = parseOptionalNumber(
        topPInput.value,
        'settings.opencode.agentModal.topP.invalid',
      );
      if (topP.error) {
        this.notifications.show(topP.error, 'error');
        return;
      }

      const steps = parseOptionalPositiveInteger(
        stepsInput.value,
        'settings.opencode.agentModal.steps.invalid',
      );
      if (steps.error) {
        this.notifications.show(steps.error, 'error');
        return;
      }

      const tools = parseOptionalJsonObjectOfBooleans(
        toolsInput.value,
        'settings.opencode.agentModal.tools.invalid',
      );
      if (tools.error) {
        this.notifications.show(tools.error, 'error');
        return;
      }

      const permission = parseOptionalJson(
        permissionInput.value,
        'settings.opencode.agentModal.permission.invalid',
      );
      if (permission.error) {
        this.notifications.show(permission.error, 'error');
        return;
      }

      const options = parseOptionalJsonObject(
        optionsInput.value,
        'settings.opencode.agentModal.options.invalid',
      );
      if (options.error) {
        this.notifications.show(options.error, 'error');
        return;
      }

      const agent: OpencodeAgentDefinition = {
        name,
        description,
        prompt,
        mode: 'subagent',
        hidden: hiddenValue || undefined,
        disable: disableValue || undefined,
        model: modelInput.value.trim() || undefined,
        variant: variantInput.value.trim() || undefined,
        temperature: temperature.value,
        topP: topP.value,
        color: colorInput.value.trim() || undefined,
        steps: steps.value,
        tools: tools.value,
        permission: permission.value,
        options: options.value,
        persistenceKey: this.existing?.persistenceKey,
        extraFrontmatter: this.existing?.extraFrontmatter,
      };

      try {
        await this.onSave(agent);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('common.unknown');
        this.notifications.show(t('settings.opencode.agentModal.errors.saveFailed', { message }), 'error');
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

export class OpencodeAgentSettings {
  private containerEl: HTMLElement;
  private storage: OpencodeAgentStorage;
  private agents: OpencodeAgentDefinition[] = [];
  private onChanged?: () => Promise<void> | void;
  private readonly notifications = new NoticeAdapter();

  constructor(
    containerEl: HTMLElement,
    storage: OpencodeAgentStorage,
    onChanged?: () => Promise<void> | void,
  ) {
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

    const visibleAgents = this.agents.filter((agent) => agent.mode === 'subagent');

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-header' });
    appendElement(headerEl, 'span', { text: t('settings.opencode.agentList.label'), className: 'typorai-sp-label' });

    const actionsEl = appendElement(headerEl, 'div', { className: 'typorai-sp-header-actions' });

    const refreshBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.opencode.agentList.refreshAria') } });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => { void this.render(); });

    const addBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.opencode.agentList.addAria') } });
    setIcon(addBtn, 'plus');
    addBtn.addEventListener('click', () => this.openModal(null));

    if (visibleAgents.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-empty-state' });
      emptyEl.textContent = t('settings.opencode.agentList.empty');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-sp-list' });
    for (const agent of visibleAgents) {
      this.renderItem(listEl, agent);
    }
  }

  private renderItem(listEl: HTMLElement, agent: OpencodeAgentDefinition): void {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-sp-item' });
    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-sp-info' });

    const headerRow = appendElement(infoEl, 'div', { className: 'typorai-sp-item-header' });
    appendElement(headerRow, 'span', { className: 'typorai-sp-item-name', text: agent.name });

    appendElement(headerRow, 'span', { text: t('settings.opencode.agentList.badgeSubagent'), className: 'typorai-slash-item-badge' });

    if (agent.model) {
      appendElement(headerRow, 'span', { text: agent.model, className: 'typorai-slash-item-badge' });
    }

    if (agent.description) {
      appendElement(infoEl, 'div', { className: 'typorai-sp-item-desc', text: agent.description });
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-sp-item-actions' });

    const editBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.opencode.agentList.editAria') } });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => this.openModal(agent));

    const deleteBtn = appendElement(actionsEl, 'button', { className: 'typorai-settings-action-btn typorai-settings-delete-btn', attributes: { 'aria-label': t('settings.opencode.agentList.deleteAria') } });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => {
      void (async (): Promise<void> => {
      const confirmed = await confirmAction(
        t('settings.opencode.agentList.deleteConfirm', { name: agent.name }), t('common.delete'), t('common.cancel'),
      );
      if (!confirmed) return;
      try {
        await this.storage.delete(agent);
        await this.render();
        await this.onChanged?.();
        this.notifications.show(t('settings.opencode.agentModal.errors.deleted', { name: agent.name }));
      } catch {
        this.notifications.show(t('settings.opencode.agentModal.errors.deleteFailed'), 'error');
      }
      })();
    });
  }

  private openModal(existing: OpencodeAgentDefinition | null): void {
    const modal = new OpencodeAgentModal(
      existing,
      this.agents,
      async (agent) => {
        await this.storage.save(agent, existing);
        await this.render();
        await this.onChanged?.();
        this.notifications.show(
          existing
            ? t('settings.opencode.agentModal.errors.updated', { name: agent.name })
            : t('settings.opencode.agentModal.errors.created', { name: agent.name }),
        );
      },
    );
    modal.open();
  }
}

function parseOptionalNumber(
  value: string,
  invalidKey: string,
): { error?: string; value?: number } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  return { value: parsed };
}

function parseOptionalPositiveInteger(
  value: string,
  invalidKey: string,
): { error?: string; value?: number } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  return { value: parsed };
}

function parseOptionalJson(
  value: string,
  invalidKey: string,
): { error?: string; value?: unknown } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }
}

function parseOptionalJsonObject(
  value: string,
  invalidKey: string,
): { error?: string; value?: Record<string, unknown> } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  if (!isJsonObject(parsed)) {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  return { value: parsed };
}

function parseOptionalJsonObjectOfBooleans(
  value: string,
  invalidKey: string,
): { error?: string; value?: Record<string, boolean> } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  if (!isJsonObject(parsed) || !Object.values(parsed).every((entry) => typeof entry === 'boolean')) {
    return { error: t(invalidKey as Parameters<typeof t>[0]) };
  }

  return { value: parsed as Record<string, boolean> };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
