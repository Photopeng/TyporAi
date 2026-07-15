import { SESSIONS_PATH, SessionStorage } from '../../core/bootstrap/SessionStorage';
import type { SharedAppStorage } from '../../core/bootstrap/storage';
import { TYPORAI_STORAGE_PATH } from '../../core/bootstrap/StoragePaths';
import { WorkspaceFileAdapter } from '../../core/storage/WorkspaceFileAdapter';
import { t } from '../../i18n/i18n';
import { NoticeAdapter } from '../../ui/NoticeAdapter';
import { type StoredTyporAiSettings,TyporAiSettingsStorage } from '../settings/TyporAiSettingsStorage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

interface StorageHost {
  app: ConstructorParameters<typeof WorkspaceFileAdapter>[0];
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

export class SharedStorageService implements SharedAppStorage {
  readonly typoraiSettings: TyporAiSettingsStorage;
  readonly sessions: SessionStorage;

  private adapter: WorkspaceFileAdapter;
  private plugin: StorageHost;
  private readonly notifications = new NoticeAdapter();

  constructor(plugin: StorageHost) {
    this.plugin = plugin;
    this.adapter = new WorkspaceFileAdapter(plugin.app);
    this.typoraiSettings = new TyporAiSettingsStorage(this.adapter);
    this.sessions = new SessionStorage(this.adapter);
  }

  async initialize(): Promise<{ typorai: Record<string, unknown> }> {
    await this.ensureDirectories();
    const typorai = await this.typoraiSettings.load();
    return { typorai };
  }

  async saveTyporAiSettings(settings: Record<string, unknown>): Promise<void> {
    await this.typoraiSettings.save(settings as StoredTyporAiSettings);
  }

  async setTabManagerState(state: { openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null }): Promise<void> {
    try {
      const loaded: unknown = await this.plugin.loadData();
      const data = isRecord(loaded) ? loaded : {};
      data.tabManagerState = state;
      await this.plugin.saveData(data);
    } catch {
      this.notifications.show(t('settings.storage.tabLayout.saveFailed'), 'error');
    }
  }

  async getTabManagerState(): Promise<{ openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null } | null> {
    try {
      const data: unknown = await this.plugin.loadData();
      if (!isRecord(data) || !data.tabManagerState) {
        return null;
      }

      return this.validateTabManagerState(data.tabManagerState);
    } catch {
      return null;
    }
  }

  getAdapter(): WorkspaceFileAdapter {
    return this.adapter;
  }

  private async ensureDirectories(): Promise<void> {
    await this.adapter.ensureFolder(TYPORAI_STORAGE_PATH);
    await this.adapter.ensureFolder(SESSIONS_PATH);
  }

  private validateTabManagerState(data: unknown): { openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null } | null {
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
        continue;
      }

      const tabObj = tab as Record<string, unknown>;
      if (typeof tabObj.tabId !== 'string') {
        continue;
      }

      validatedTabs.push({
        tabId: tabObj.tabId,
        conversationId: typeof tabObj.conversationId === 'string' ? tabObj.conversationId : null,
        ...(typeof tabObj.draftModel === 'string'
          ? { draftModel: tabObj.draftModel }
          : {}),
      });
    }

    return {
      openTabs: validatedTabs,
      activeTabId: typeof state.activeTabId === 'string' ? state.activeTabId : null,
    };
  }
}
