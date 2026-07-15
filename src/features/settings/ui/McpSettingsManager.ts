import { setIcon } from '@/ui/Icon';

import { tryParseClipboardConfig } from '../../../core/mcp/McpConfigParser';
import { testMcpServer } from '../../../core/mcp/McpTester';
import type { AppMcpStorage } from '../../../core/providers/types';
import type { ManagedMcpServer, McpServerConfig, McpServerType } from '../../../core/types';
import { DEFAULT_MCP_SERVER, getMcpServerType } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { confirmAction } from '../../../ui/confirm';
import { appendElement } from '../../../ui/dom';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { setTyporAiTooltip } from '../../../ui/Tooltip';
import { McpServerModal } from './McpServerModal';
import { McpTestModal } from './McpTestModal';

const managerByContainer = new WeakMap<HTMLElement, McpSettingsManager>();

export interface McpSettingsManagerDeps {
  mcpStorage: AppMcpStorage;
  broadcastMcpReload: () => Promise<void>;
}

export class McpSettingsManager {
  private containerEl: HTMLElement;
  private mcpStorage: AppMcpStorage;
  private broadcastMcpReload: () => Promise<void>;
  private servers: ManagedMcpServer[] = [];
  private readonly notifications = new NoticeAdapter();
  private stopDocumentClick: (() => void) | null = null;

  constructor(containerEl: HTMLElement, deps: McpSettingsManagerDeps) {
    managerByContainer.get(containerEl)?.dispose();
    managerByContainer.set(containerEl, this);
    this.containerEl = containerEl;
    this.mcpStorage = deps.mcpStorage;
    this.broadcastMcpReload = deps.broadcastMcpReload;
    void this.loadAndRender();
  }

  private async loadAndRender() {
    this.servers = await this.mcpStorage.load();
    this.render();
  }

  private render() {
    this.stopDocumentClick?.();
    this.stopDocumentClick = null;
    this.containerEl.replaceChildren();

    const headerEl = appendElement(this.containerEl, 'div', { className: 'typorai-mcp-header' });
    appendElement(headerEl, 'span', { text: t('settings.mcpServers.name'), className: 'typorai-mcp-label' });

    const addContainer = appendElement(headerEl, 'div', { className: 'typorai-mcp-add-container' });
    const addBtn = appendElement(addContainer, 'button', {
      className: 'typorai-settings-action-btn', attributes: { 'aria-label': t('common.add') },
    });
    setIcon(addBtn, 'plus');

    const dropdown = appendElement(addContainer, 'div', { className: 'typorai-mcp-add-dropdown' });

    const stdioOption = appendElement(dropdown, 'div', { className: 'typorai-mcp-add-option' });
    setIcon(appendElement(stdioOption, 'span', { className: 'typorai-mcp-add-option-icon' }), 'terminal');
    appendElement(stdioOption, 'span', { text: t('settings.mcp.addOptionStdio') });
    stdioOption.addEventListener('click', () => {
      dropdown.classList.remove('is-visible');
      this.openModal(null, 'stdio');
    });

    const httpOption = appendElement(dropdown, 'div', { className: 'typorai-mcp-add-option' });
    setIcon(appendElement(httpOption, 'span', { className: 'typorai-mcp-add-option-icon' }), 'globe');
    appendElement(httpOption, 'span', { text: t('settings.mcp.addOptionHttp') });
    httpOption.addEventListener('click', () => {
      dropdown.classList.remove('is-visible');
      this.openModal(null, 'http');
    });

    const importOption = appendElement(dropdown, 'div', { className: 'typorai-mcp-add-option' });
    setIcon(appendElement(importOption, 'span', { className: 'typorai-mcp-add-option-icon' }), 'clipboard-paste');
    appendElement(importOption, 'span', { text: t('settings.mcp.addOptionImport') });
    importOption.addEventListener('click', () => {
      dropdown.classList.remove('is-visible');
      void this.importFromClipboard();
    });

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('is-visible');
    });

    const document = this.containerEl.ownerDocument;
    const closeDropdown = (): void => {
      dropdown.classList.remove('is-visible');
    };
    document.addEventListener('click', closeDropdown);
    this.stopDocumentClick = () => document.removeEventListener('click', closeDropdown);

    if (this.servers.length === 0) {
      const emptyEl = appendElement(this.containerEl, 'div', { className: 'typorai-mcp-empty' });
      emptyEl.textContent = t('settings.mcp.empty');
      return;
    }

    const listEl = appendElement(this.containerEl, 'div', { className: 'typorai-mcp-list' });
    for (const server of this.servers) {
      this.renderServerItem(listEl, server);
    }
  }

  private renderServerItem(listEl: HTMLElement, server: ManagedMcpServer) {
    const itemEl = appendElement(listEl, 'div', { className: 'typorai-mcp-item' });
    if (!server.enabled) {
      itemEl.classList.add('typorai-mcp-item-disabled');
    }

    const statusEl = appendElement(itemEl, 'div', { className: 'typorai-mcp-status' });
    statusEl.classList.add(
      server.enabled ? 'typorai-mcp-status-enabled' : 'typorai-mcp-status-disabled'
    );

    const infoEl = appendElement(itemEl, 'div', { className: 'typorai-mcp-info' });

    const nameRow = appendElement(infoEl, 'div', { className: 'typorai-mcp-name-row' });

    appendElement(nameRow, 'span', { className: 'typorai-mcp-name', text: server.name });

    const serverType = getMcpServerType(server.config);
    appendElement(nameRow, 'span', { className: 'typorai-mcp-type-badge', text: serverType });

    if (server.contextSaving) {
      const csEl = appendElement(nameRow, 'span', { className: 'typorai-mcp-context-saving-badge', text: '@' });
      setTyporAiTooltip(csEl, t('settings.mcp.contextSavingBadgeTitle', { name: server.name }));
    }

    const previewEl = appendElement(infoEl, 'div', { className: 'typorai-mcp-preview' });
    if (server.description) {
      previewEl.textContent = server.description;
    } else {
      previewEl.textContent = this.getServerPreview(server, serverType);
    }

    const actionsEl = appendElement(itemEl, 'div', { className: 'typorai-mcp-actions' });

    const testBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-mcp-action-btn', attributes: { 'aria-label': t('settings.mcp.verifyAria') },
    });
    setIcon(testBtn, 'zap');
    testBtn.addEventListener('click', () => {
      void this.testServer(server);
    });

    const toggleBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-mcp-action-btn', attributes: { 'aria-label': server.enabled ? t('settings.mcp.disableAria') : t('settings.mcp.enableAria') },
    });
    setIcon(toggleBtn, server.enabled ? 'toggle-right' : 'toggle-left');
    toggleBtn.addEventListener('click', () => {
      void this.toggleServer(server);
    });

    const editBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-mcp-action-btn', attributes: { 'aria-label': t('settings.mcp.editAria') },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => this.openModal(server));

    const deleteBtn = appendElement(actionsEl, 'button', {
      className: 'typorai-mcp-action-btn typorai-mcp-delete-btn', attributes: { 'aria-label': t('settings.mcp.deleteAria') },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => {
      void this.deleteServer(server);
    });
  }

  private async testServer(server: ManagedMcpServer) {
    const modal = new McpTestModal(
      server.name,
      server.disabledTools,
      async (toolName, enabled) => {
        await this.updateDisabledTool(server, toolName, enabled);
      },
      async (disabledTools) => {
        await this.updateAllDisabledTools(server, disabledTools);
      }
    );
    modal.open();

    try {
      const result = await testMcpServer(server);
      modal.setResult(result);
    } catch (error) {
      modal.setError(error instanceof Error ? error.message : t('settings.mcp.verificationFailed'));
    }
  }

  /** Rolls back on save failure; warns on reload failure (since save succeeded). */
  private async updateServerDisabledTools(
    server: ManagedMcpServer,
    newDisabledTools: string[] | undefined
  ): Promise<void> {
    const previous = server.disabledTools ? [...server.disabledTools] : undefined;
    server.disabledTools = newDisabledTools;

    try {
      await this.mcpStorage.save(this.servers);
    } catch (error) {
      server.disabledTools = previous;
      throw error;
    }

    try {
      await this.broadcastMcpReload();
    } catch {
      // Save succeeded but reload failed - don't rollback since disk has correct state
      this.notifications.show(t('settings.mcp.reloadFailed'), 'warning');
    }
  }

  private async updateDisabledTool(
    server: ManagedMcpServer,
    toolName: string,
    enabled: boolean
  ) {
    const disabledTools = new Set(server.disabledTools ?? []);
    if (enabled) {
      disabledTools.delete(toolName);
    } else {
      disabledTools.add(toolName);
    }
    await this.updateServerDisabledTools(
      server,
      disabledTools.size > 0 ? Array.from(disabledTools) : undefined
    );
  }

  private async updateAllDisabledTools(server: ManagedMcpServer, disabledTools: string[]) {
    await this.updateServerDisabledTools(
      server,
      disabledTools.length > 0 ? disabledTools : undefined
    );
  }

  private getServerPreview(server: ManagedMcpServer, type: McpServerType): string {
    if (type === 'stdio') {
      const config = server.config as { command: string; args?: string[] };
      const args = config.args?.join(' ') || '';
      return args ? `${config.command} ${args}` : config.command;
    } else {
      const config = server.config as { url: string };
      return config.url;
    }
  }

  private openModal(existing: ManagedMcpServer | null, initialType?: McpServerType) {
    const modal = new McpServerModal(
      existing,
      (server) => {
        void this.saveServer(server, existing).catch((error: unknown) => {
          this.notifications.show(error instanceof Error ? error.message : t('settings.mcp.saveFailed'), 'error');
        });
      },
      initialType
    );
    modal.open();
  }

  private async importFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        this.notifications.show(t('settings.mcp.importEmpty'), 'warning');
        return;
      }

      const parsed = tryParseClipboardConfig(text);
      if (!parsed || parsed.servers.length === 0) {
        this.notifications.show(t('settings.mcp.importInvalid'), 'error');
        return;
      }

      if (parsed.needsName || parsed.servers.length === 1) {
        const server = parsed.servers[0];
        const type = getMcpServerType(server.config);
        const modal = new McpServerModal(
          null,
          (savedServer) => {
            void this.saveServer(savedServer, null).catch((error: unknown) => {
              this.notifications.show(error instanceof Error ? error.message : t('settings.mcp.saveFailed'), 'error');
            });
          },
          type,
          server  // Pre-fill with parsed config
        );
        modal.open();
        if (parsed.needsName) {
          this.notifications.show(t('settings.mcp.importEnterName'));
        }
        return;
      }

      await this.importServers(parsed.servers);
    } catch {
      this.notifications.show(t('settings.mcp.importFailed'), 'error');
    }
  }

  private async saveServer(server: ManagedMcpServer, existing: ManagedMcpServer | null) {
    if (existing) {
      const index = this.servers.findIndex((s) => s.name === existing.name);
      if (index !== -1) {
        if (server.name !== existing.name) {
          const conflict = this.servers.find((s) => s.name === server.name);
          if (conflict) {
            this.notifications.show(t('settings.mcp.alreadyExists', { name: server.name }), 'error');
            return;
          }
        }
        this.servers[index] = server;
      }
    } else {
      const conflict = this.servers.find((s) => s.name === server.name);
      if (conflict) {
        this.notifications.show(t('settings.mcp.alreadyExists', { name: server.name }), 'error');
        return;
      }
      this.servers.push(server);
    }

    await this.mcpStorage.save(this.servers);
    await this.broadcastMcpReload();
    this.render();
    this.notifications.show(t(existing ? 'settings.mcp.updated' : 'settings.mcp.added', { name: server.name }));
  }

  private async importServers(servers: Array<{ name: string; config: McpServerConfig }>) {
    const added: string[] = [];
    const skipped: string[] = [];

    for (const server of servers) {
      const name = server.name.trim();
      if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
        skipped.push(server.name || '<unnamed>');
        continue;
      }

      const conflict = this.servers.find((s) => s.name === name);
      if (conflict) {
        skipped.push(name);
        continue;
      }

      this.servers.push({
        name,
        config: server.config,
        enabled: DEFAULT_MCP_SERVER.enabled,
        contextSaving: DEFAULT_MCP_SERVER.contextSaving,
      });
      added.push(name);
    }

    if (added.length === 0) {
      this.notifications.show(t('settings.mcp.importNone'), 'warning');
      return;
    }

    await this.mcpStorage.save(this.servers);
    await this.broadcastMcpReload();
    this.render();

    const plural = added.length > 1 ? 's' : '';
    if (skipped.length > 0) {
      this.notifications.show(t('settings.mcp.importPartial', { count: added.length, plural, skipped: skipped.length }), 'warning');
    } else {
      this.notifications.show(t('settings.mcp.importSuccess', { count: added.length, plural }));
    }
  }

  private async toggleServer(server: ManagedMcpServer) {
    server.enabled = !server.enabled;
    await this.mcpStorage.save(this.servers);
    await this.broadcastMcpReload();
    this.render();
    this.notifications.show(t(server.enabled ? 'settings.mcp.enabled' : 'settings.mcp.disabled', { name: server.name }));
  }

  private async deleteServer(server: ManagedMcpServer) {
    if (!(await confirmAction(
      t('settings.mcp.deleteConfirm', { name: server.name }), t('common.delete'), t('common.cancel'),
    ))) {
      return;
    }

    this.servers = this.servers.filter((s) => s.name !== server.name);
    await this.mcpStorage.save(this.servers);
    await this.broadcastMcpReload();
    this.render();
    this.notifications.show(t('settings.mcp.deleted', { name: server.name }));
  }

  /** Refresh the server list (call after external changes). */
  public refresh() {
    void this.loadAndRender();
  }

  public dispose(): void {
    this.stopDocumentClick?.();
    this.stopDocumentClick = null;
    if (managerByContainer.get(this.containerEl) === this) {
      managerByContainer.delete(this.containerEl);
    }
  }
}
