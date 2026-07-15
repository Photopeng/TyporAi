import type { AppSessionStorage, AppTabManagerState } from '../providers/types';
import type { WorkspaceFileAdapter } from '../storage/WorkspaceFileAdapter';

/**
 * Minimal shared app storage contract.
 *
 * This interface covers only the storage concerns that are shared across
 * all providers: TyporAi settings, tab manager state, and session metadata.
 *
 * Provider-specific storage surfaces (CC settings, slash commands, skills,
 * agents, MCP config) live behind provider-owned modules.
 */
export interface SharedAppStorage {
  initialize(): Promise<{ typorai: Record<string, unknown> }>;
  saveTyporAiSettings(settings: Record<string, unknown>): Promise<void>;
  setTabManagerState(state: AppTabManagerState): Promise<void>;
  getTabManagerState(): Promise<AppTabManagerState | null>;
  sessions: AppSessionStorage;
  getAdapter(): WorkspaceFileAdapter;
}
