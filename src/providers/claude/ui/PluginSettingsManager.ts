import { setIcon } from '@/ui/Icon';

import type {
  AppAgentManager,
  AppPluginManager,
} from '../../../core/providers/types';
import type { PluginInfo } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { appendElement } from '../../../ui/dom';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';

export interface PluginSettingsManagerDeps {
  pluginManager: AppPluginManager;
  agentManager: Pick<AppAgentManager, 'loadAgents'>;
  restartTabs: () => Promise<void>;
}

export class PluginSettingsManager {
  private containerEl: HTMLElement;
  private pluginManager: AppPluginManager;
  private agentManager: Pick<AppAgentManager, 'loadAgents'>;
  private restartTabs: () => Promise<void>;
  private readonly notifications = new NoticeAdapter();

  constructor(containerEl: HTMLElement, deps: PluginSettingsManagerDeps) {
    this.containerEl = containerEl;
    this.pluginManager = deps.pluginManager;
    this.agentManager = deps.agentManager;
    this.restartTabs = deps.restartTabs;
    this.render();
  }

  private render() {
    this.containerEl.replaceChildren();

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-plugin-header' });
    appendElement(headerEl, 'span', { text: t('settings.claude.plugins.header'), className: 'typorai-plugin-label' });

    const refreshBtn = appendElement(headerEl, 'button', { className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('settings.claude.plugins.refreshAria') } });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => {
      void this.refreshPlugins();
    });

    const plugins = this.pluginManager.getPlugins();

    if (plugins.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-plugin-empty' });
      emptyEl.textContent = t('settings.claude.plugins.empty');
      return;
    }

    const projectPlugins = plugins.filter(p => p.scope === 'project');
    const userPlugins = plugins.filter(p => p.scope === 'user');

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-plugin-list' });

    if (projectPlugins.length > 0) {
      const sectionHeader = appendElement(listEl, 'div', { className: 'typorai-plugin-section-header' });
      sectionHeader.textContent = t('settings.claude.plugins.project');

      for (const plugin of projectPlugins) {
        this.renderPluginItem(listEl, plugin);
      }
    }

    if (userPlugins.length > 0) {
      const sectionHeader = appendElement(listEl, 'div', { className: 'typorai-plugin-section-header' });
      sectionHeader.textContent = t('settings.claude.plugins.user');

      for (const plugin of userPlugins) {
        this.renderPluginItem(listEl, plugin);
      }
    }
  }

  private renderPluginItem(listEl: HTMLElement, plugin: PluginInfo) {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-plugin-item' });
    if (!plugin.enabled) {
      itemEl.classList.add('typorai-plugin-item-disabled');
    }

    const statusEl = appendElement(itemEl, 'div', { className: 'typorai-plugin-status' });
    if (plugin.enabled) {
      statusEl.classList.add('typorai-plugin-status-enabled');
    } else {
      statusEl.classList.add('typorai-plugin-status-disabled');
    }

    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-plugin-info' });

    const nameRow = appendElement(infoEl, 'div', { className: 'typorai-plugin-name-row' });

    appendElement(nameRow, 'span', { className: 'typorai-plugin-name', text: plugin.name });

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-plugin-actions' });

    const toggleBtn = appendElement(actionsEl, 'button', { className: 'typorai-plugin-action-btn', attributes: { 'aria-label': plugin.enabled ? t('settings.claude.plugins.disableAria') : t('settings.claude.plugins.enableAria') } });
    setIcon(toggleBtn, plugin.enabled ? 'toggle-right' : 'toggle-left');
    toggleBtn.addEventListener('click', () => {
      void this.togglePlugin(plugin.id);
    });
  }

  private async togglePlugin(pluginId: string) {
    const plugin = this.pluginManager.getPlugins().find(p => p.id === pluginId);
    const wasEnabled = plugin?.enabled ?? false;

    try {
      await this.pluginManager.togglePlugin(pluginId);
      await this.agentManager.loadAgents();

      try {
        await this.restartTabs();
      } catch {
        this.notifications.show(t('settings.claude.plugins.togglePartiallyFailed'), 'warning');
      }

      this.notifications.show(t(
        wasEnabled ? 'settings.claude.plugins.noticeToggledDisabled' : 'settings.claude.plugins.noticeToggledEnabled',
        { id: pluginId },
      ));
    } catch (err) {
      await this.pluginManager.togglePlugin(pluginId);
      const message = err instanceof Error ? err.message : t('common.unknown');
      this.notifications.show(t('settings.claude.plugins.toggleFailed', { message }), 'error');
    } finally {
      this.render();
    }
  }

  private async refreshPlugins() {
    try {
      await this.pluginManager.loadPlugins();
      await this.agentManager.loadAgents();

      this.notifications.show(t('settings.claude.plugins.noticeRefreshed'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknown');
      this.notifications.show(t('settings.claude.plugins.refreshFailed', { message }), 'error');
    } finally {
      this.render();
    }
  }

  public refresh() {
    this.render();
  }
}
