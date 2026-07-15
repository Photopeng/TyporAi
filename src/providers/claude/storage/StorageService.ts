import type { NotificationService } from '@/core/ports';

import { type StoredTyporAiSettings,TyporAiSettingsStorage } from '../../../app/settings/TyporAiSettingsStorage';
import { SESSIONS_PATH, SessionStorage } from '../../../core/bootstrap/SessionStorage';
import { TYPORAI_STORAGE_PATH } from '../../../core/bootstrap/StoragePaths';
import type { WorkspaceFileHost } from '../../../core/storage/WorkspaceFileAdapter';
import { WorkspaceFileAdapter } from '../../../core/storage/WorkspaceFileAdapter';
import type {
  SlashCommand,
} from '../../../core/types';
import { t } from '../../../i18n/i18n';
import {
  type CCPermissions,
  type CCSettings,
  createPermissionRule,
} from '../types/settings';
import { AGENTS_PATH, AgentVaultStorage } from './AgentVaultStorage';
import { CCSettingsStorage } from './CCSettingsStorage';
import { McpStorage } from './McpStorage';
import { SKILLS_PATH, SkillStorage } from './SkillStorage';
import { COMMANDS_PATH, SlashCommandStorage } from './SlashCommandStorage';

export const CLAUDE_PATH = '.claude';

type StoragePlugin = {
  app: WorkspaceFileHost;
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export interface CombinedSettings {
  cc: CCSettings;
  typorai: StoredTyporAiSettings;
}

export class StorageService {
  readonly ccSettings: CCSettingsStorage;
  readonly typoraiSettings: TyporAiSettingsStorage;
  readonly commands: SlashCommandStorage;
  readonly skills: SkillStorage;
  readonly sessions: SessionStorage;
  readonly mcp: McpStorage;
  readonly agents: AgentVaultStorage;

  private adapter: WorkspaceFileAdapter;
  private plugin: StoragePlugin;
  private notifications: NotificationService = { show: () => undefined };

  constructor(plugin: StoragePlugin, adapter?: WorkspaceFileAdapter, notifications?: NotificationService) {
    this.plugin = plugin;
    this.adapter = adapter ?? new WorkspaceFileAdapter(plugin.app);
    if (notifications) this.notifications = notifications;
    this.ccSettings = new CCSettingsStorage(this.adapter);
    this.typoraiSettings = new TyporAiSettingsStorage(this.adapter);
    this.commands = new SlashCommandStorage(this.adapter);
    this.skills = new SkillStorage(this.adapter);
    this.sessions = new SessionStorage(this.adapter);
    this.mcp = new McpStorage(this.adapter);
    this.agents = new AgentVaultStorage(this.adapter);
  }

  async initialize(): Promise<CombinedSettings> {
    await this.ensureDirectories();

    const cc = await this.ccSettings.load();
    const typorai = await this.typoraiSettings.load();

    return { cc, typorai };
  }

  async ensureDirectories(): Promise<void> {
    await this.adapter.ensureFolder(CLAUDE_PATH);
    await this.adapter.ensureFolder(TYPORAI_STORAGE_PATH);
    await this.adapter.ensureFolder(COMMANDS_PATH);
    await this.adapter.ensureFolder(SKILLS_PATH);
    await this.adapter.ensureFolder(SESSIONS_PATH);
    await this.adapter.ensureFolder(AGENTS_PATH);
  }

  async loadAllSlashCommands(): Promise<SlashCommand[]> {
    const commands = await this.commands.loadAll();
    const skills = await this.skills.loadAll();
    return [...commands, ...skills];
  }

  getAdapter(): WorkspaceFileAdapter {
    return this.adapter;
  }

  setNotificationService(notifications: NotificationService): void {
    this.notifications = notifications;
  }

  async getPermissions(): Promise<CCPermissions> {
    return this.ccSettings.getPermissions();
  }

  async updatePermissions(permissions: CCPermissions): Promise<void> {
    return this.ccSettings.updatePermissions(permissions);
  }

  async addAllowRule(rule: string): Promise<void> {
    return this.ccSettings.addAllowRule(createPermissionRule(rule));
  }

  async addDenyRule(rule: string): Promise<void> {
    return this.ccSettings.addDenyRule(createPermissionRule(rule));
  }

  async removePermissionRule(rule: string): Promise<void> {
    return this.ccSettings.removeRule(createPermissionRule(rule));
  }

  async updateTyporAiSettings(updates: Partial<StoredTyporAiSettings>): Promise<void> {
    return this.typoraiSettings.update(updates);
  }

  async saveTyporAiSettings(settings: StoredTyporAiSettings): Promise<void> {
    return this.typoraiSettings.save(settings);
  }

  async loadTyporAiSettings(): Promise<StoredTyporAiSettings> {
    return this.typoraiSettings.load();
  }

  async getTabManagerState(): Promise<TabManagerPersistedState | null> {
    try {
      const data: unknown = await this.plugin.loadData();
      if (isRecord(data) && data.tabManagerState) {
        return this.validateTabManagerState(data.tabManagerState);
      }
      return null;
    } catch {
      return null;
    }
  }

  private validateTabManagerState(data: unknown): TabManagerPersistedState | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const state = data as Record<string, unknown>;

    if (!Array.isArray(state.openTabs)) {
      return null;
    }

    const validatedTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }> = [];
    for (const tab of state.openTabs) {
      if (!tab || typeof tab !== 'object') {
        continue; // Skip invalid entries
      }
      const tabObj = tab as Record<string, unknown>;
      if (typeof tabObj.tabId !== 'string') {
        continue; // Skip entries without valid tabId
      }
      validatedTabs.push({
        tabId: tabObj.tabId,
        conversationId:
          typeof tabObj.conversationId === 'string' ? tabObj.conversationId : null,
        ...(typeof tabObj.draftModel === 'string'
          ? { draftModel: tabObj.draftModel }
          : {}),
      });
    }

    const activeTabId =
      typeof state.activeTabId === 'string' ? state.activeTabId : null;

    return {
      openTabs: validatedTabs,
      activeTabId,
    };
  }

  async setTabManagerState(state: TabManagerPersistedState): Promise<void> {
    try {
      const loaded: unknown = await this.plugin.loadData();
      const data = isRecord(loaded) ? loaded : {};
      data.tabManagerState = state;
      await this.plugin.saveData(data);
    } catch {
      this.notifications.show(t('settings.storage.tabLayout.saveFailed'), 'error');
    }
  }
}

export interface TabManagerPersistedState {
  openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>;
  activeTabId: string | null;
}
