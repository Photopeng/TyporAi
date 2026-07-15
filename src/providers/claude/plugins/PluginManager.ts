/**
 * PluginManager - Discover and manage Claude Code plugins.
 *
 * Plugins are discovered from two sources:
 * - installed_plugins.json: install paths for scanning agents
 * - settings.json: enabled state (project overrides global)
 */

import type { FileProbe, NotificationService } from '@/core/ports';

import type { PluginInfo, PluginScope } from '../../../core/types';
import type { CCSettingsStorage } from '../storage/CCSettingsStorage';
import type { InstalledPluginEntry, InstalledPluginsFile } from '../types/plugins';

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
}

function readJsonFile<T>(filePath: string, fileProbe?: FileProbe): T | null {
  try {
    if (!fileProbe?.exists(filePath)) {
      return null;
    }
    const content = fileProbe.readText(filePath);
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function normalizePathForComparison(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
}

function selectInstalledPluginEntry(
  entries: InstalledPluginEntry[],
  normalizedVaultPath: string
): InstalledPluginEntry | null {
  for (const entry of entries) {
    if (entry.scope !== 'project') continue;
    if (!entry.projectPath) continue;
    if (normalizePathForComparison(entry.projectPath) === normalizedVaultPath) {
      return entry;
    }
  }

  return entries.find(e => e.scope === 'user') ?? null;
}

function extractPluginName(pluginId: string): string {
  const atIndex = pluginId.indexOf('@');
  if (atIndex > 0) {
    return pluginId.substring(0, atIndex);
  }
  return pluginId;
}

export class PluginManager {
  private ccSettingsStorage: CCSettingsStorage;
  private vaultPath: string;
  private plugins: PluginInfo[] = [];
  private notifications: NotificationService = { show: () => undefined };
  private fileProbe?: FileProbe;

  constructor(vaultPath: string, ccSettingsStorage: CCSettingsStorage) {
    this.vaultPath = vaultPath;
    this.ccSettingsStorage = ccSettingsStorage;
  }

  setNotificationService(notifications: NotificationService): void {
    this.notifications = notifications;
  }

  setFileProbe(fileProbe?: FileProbe): void {
    this.fileProbe = fileProbe;
  }

  async loadPlugins(): Promise<void> {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const home = env.HOME ?? env.USERPROFILE ?? '';
    const installedPlugins = readJsonFile<InstalledPluginsFile>(`${home}/.claude/plugins/installed_plugins.json`, this.fileProbe);
    const globalSettings = readJsonFile<SettingsFile>(`${home}/.claude/settings.json`, this.fileProbe);
    const projectSettings = await this.loadProjectSettings();

    const globalEnabled = globalSettings?.enabledPlugins ?? {};
    const projectEnabled = projectSettings?.enabledPlugins ?? {};

    const plugins: PluginInfo[] = [];
    const normalizedVaultPath = normalizePathForComparison(this.vaultPath);

    if (installedPlugins?.plugins) {
      for (const [pluginId, entries] of Object.entries(installedPlugins.plugins)) {
        if (!entries || entries.length === 0) continue;

        const entriesArray = Array.isArray(entries) ? entries : [entries];
        if (!Array.isArray(entries)) {
          this.notifications.show(`TyporAi: plugin "${pluginId}" has malformed entry in installed_plugins.json (expected array, got ${typeof entries})`, 'error');
        }
        const entry = selectInstalledPluginEntry(entriesArray, normalizedVaultPath);
        if (!entry) continue;

        const scope: PluginScope = entry.scope === 'project' ? 'project' : 'user';

        // Project setting takes precedence, then global, then default enabled
        const enabled = projectEnabled[pluginId] ?? globalEnabled[pluginId] ?? true;

        plugins.push({
          id: pluginId,
          name: extractPluginName(pluginId),
          enabled,
          scope,
          installPath: entry.installPath,
        });
      }
    }

    this.plugins = plugins.sort((a, b) => {
      if (a.scope !== b.scope) {
        return a.scope === 'project' ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });
  }

  private async loadProjectSettings(): Promise<SettingsFile | null> {
    const projectSettingsPath = `${this.vaultPath}/.claude/settings.json`;
    return readJsonFile(projectSettingsPath, this.fileProbe);
  }

  getPlugins(): PluginInfo[] {
    return [...this.plugins];
  }

  hasPlugins(): boolean {
    return this.plugins.length > 0;
  }

  hasEnabledPlugins(): boolean {
    return this.plugins.some((p) => p.enabled);
  }

  getEnabledCount(): number {
    return this.plugins.filter((p) => p.enabled).length;
  }

  /** Used to detect changes that require restarting the persistent query. */
  getPluginsKey(): string {
    const enabledPlugins = this.plugins
      .filter((p) => p.enabled)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (enabledPlugins.length === 0) {
      return '';
    }

    return enabledPlugins.map((p) => `${p.id}:${p.installPath}`).join('|');
  }

  /** Writes to project .claude/settings.json so CLI respects the state. */
  async togglePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      return;
    }

    const newEnabled = !plugin.enabled;
    plugin.enabled = newEnabled;

    await this.ccSettingsStorage.setPluginEnabled(pluginId, newEnabled);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || plugin.enabled) {
      return;
    }

    plugin.enabled = true;
    await this.ccSettingsStorage.setPluginEnabled(pluginId, true);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || !plugin.enabled) {
      return;
    }

    plugin.enabled = false;
    await this.ccSettingsStorage.setPluginEnabled(pluginId, false);
  }
}
