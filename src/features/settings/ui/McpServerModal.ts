import type {
  ManagedMcpServer,
  McpHttpServerConfig,
  McpServerConfig,
  McpServerType,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../../core/types';
import { DEFAULT_MCP_SERVER, getMcpServerType } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { parseCommand } from '../../../utils/mcp';

export class McpServerModal extends NativeModal {
  private existingServer: ManagedMcpServer | null;
  private onSave: (server: ManagedMcpServer) => void;

  private serverName = '';
  private serverType: McpServerType = 'stdio';
  private enabled = DEFAULT_MCP_SERVER.enabled;
  private contextSaving = DEFAULT_MCP_SERVER.contextSaving;
  private command = '';
  private env = '';
  private url = '';
  private headers = '';
  private typeFieldsEl: HTMLElement | null = null;
  private nameInputEl: HTMLInputElement | null = null;
  private readonly notifications = new NoticeAdapter();

  constructor(
    existingServer: ManagedMcpServer | null,
    onSave: (server: ManagedMcpServer) => void,
    initialType?: McpServerType,
    prefillConfig?: { name: string; config: McpServerConfig }
  ) {
    super();
    this.existingServer = existingServer;
    this.onSave = onSave;

    if (existingServer) {
      this.serverName = existingServer.name;
      this.serverType = getMcpServerType(existingServer.config);
      this.enabled = existingServer.enabled;
      this.contextSaving = existingServer.contextSaving;
      this.initFromConfig(existingServer.config);
    } else if (prefillConfig) {
      this.serverName = prefillConfig.name;
      this.serverType = getMcpServerType(prefillConfig.config);
      this.initFromConfig(prefillConfig.config);
    } else if (initialType) {
      this.serverType = initialType;
    }
  }

  private initFromConfig(config: McpServerConfig) {
    const type = getMcpServerType(config);
    if (type === 'stdio') {
      const stdioConfig = config as McpStdioServerConfig;
      if (stdioConfig.args && stdioConfig.args.length > 0) {
        this.command = stdioConfig.command + ' ' + stdioConfig.args.join(' ');
      } else {
        this.command = stdioConfig.command;
      }
      this.env = this.envRecordToString(stdioConfig.env);
    } else {
      const urlConfig = config as McpSSEServerConfig | McpHttpServerConfig;
      this.url = urlConfig.url;
      this.headers = this.envRecordToString(urlConfig.headers);
    }
  }

  protected onOpen() {
    this.setTitle(this.existingServer
      ? t('settings.mcp.modal.titleEdit')
      : t('settings.mcp.modal.titleAdd'));
    this.modalEl.classList.add('typorai-mcp-modal');

    const { contentEl } = this;

    const settings = new SettingBuilder(contentEl);
    this.nameInputEl = settings.text(
      t('settings.mcp.modal.serverName.name'), this.serverName,
      value => { this.serverName = value; }, t('settings.mcp.modal.serverName.desc'),
    );
    this.nameInputEl.placeholder = t('settings.mcp.modal.serverName.placeholder');
    this.nameInputEl.addEventListener('keydown', (event) => this.handleKeyDown(event));

    settings.select(
      t('settings.mcp.modal.type.name'), this.serverType,
      [
        { value: 'stdio', label: t('settings.mcp.modal.type.stdio') },
        { value: 'sse', label: t('settings.mcp.modal.type.sse') },
        { value: 'http', label: t('settings.mcp.modal.type.http') },
      ],
      value => { this.serverType = value as McpServerType; this.renderTypeFields(); },
      t('settings.mcp.modal.type.desc'),
    );

    this.typeFieldsEl = contentEl.ownerDocument.createElement('div');
    this.typeFieldsEl.className = 'typorai-mcp-type-fields';
    contentEl.append(this.typeFieldsEl);
    this.renderTypeFields();

    settings.toggle(t('settings.mcp.modal.enabled.name'), this.enabled, value => { this.enabled = value; }, t('settings.mcp.modal.enabled.desc'));
    settings.toggle(t('settings.mcp.modal.contextSaving.name'), this.contextSaving, value => { this.contextSaving = value; }, t('settings.mcp.modal.contextSaving.desc'));

    const buttonContainer = contentEl.ownerDocument.createElement('div');
    buttonContainer.className = 'typorai-mcp-buttons';
    const cancelBtn = contentEl.ownerDocument.createElement('button');
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.className = 'typorai-cancel-btn';
    buttonContainer.append(cancelBtn);
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = contentEl.ownerDocument.createElement('button');
    saveBtn.textContent = this.existingServer ? t('common.save') : t('common.add');
    saveBtn.className = 'typorai-save-btn mod-cta';
    buttonContainer.append(saveBtn);
    saveBtn.addEventListener('click', () => this.save());
    contentEl.append(buttonContainer);
  }

  private renderTypeFields() {
    if (!this.typeFieldsEl) return;
    this.typeFieldsEl.replaceChildren();

    if (this.serverType === 'stdio') {
      this.renderStdioFields();
    } else {
      this.renderUrlFields();
    }
  }

  private renderStdioFields() {
    if (!this.typeFieldsEl) return;

    const settings = new SettingBuilder(this.typeFieldsEl);
    const cmdTextarea = settings.textarea(
      t('settings.mcp.modal.command.name'), this.command,
      value => { this.command = value; }, t('settings.mcp.modal.command.desc'),
    );
    cmdTextarea.closest('.setting-item')?.classList.add('typorai-mcp-cmd-setting');
    cmdTextarea.classList.add('typorai-mcp-cmd-textarea');
    cmdTextarea.placeholder = t('settings.mcp.modal.command.placeholder');
    cmdTextarea.rows = 2;
    const envTextarea = settings.textarea(
      t('settings.mcp.modal.env.name'), this.env,
      value => { this.env = value; }, t('settings.mcp.modal.env.desc'),
    );
    envTextarea.closest('.setting-item')?.classList.add('typorai-mcp-env-setting');
    envTextarea.classList.add('typorai-mcp-env-textarea');
    envTextarea.placeholder = t('settings.mcp.modal.env.placeholder');
    envTextarea.rows = 2;
  }

  private renderUrlFields() {
    if (!this.typeFieldsEl) return;

    const settings = new SettingBuilder(this.typeFieldsEl);
    const urlInput = settings.text(
      t('settings.mcp.modal.url.name'), this.url,
      value => { this.url = value; },
      this.serverType === 'sse' ? t('settings.mcp.modal.url.sseDesc') : t('settings.mcp.modal.url.httpDesc'),
    );
    urlInput.placeholder = t('settings.mcp.modal.url.placeholder');
    urlInput.addEventListener('keydown', (event) => this.handleKeyDown(event));

    const headersTextarea = settings.textarea(
      t('settings.mcp.modal.headers.name'), this.headers,
      value => { this.headers = value; }, t('settings.mcp.modal.headers.desc'),
    );
    headersTextarea.closest('.setting-item')?.classList.add('typorai-mcp-env-setting');
    headersTextarea.classList.add('typorai-mcp-env-textarea');
    headersTextarea.placeholder = t('settings.mcp.modal.headers.placeholder');
    headersTextarea.rows = 3;
  }

  private handleKeyDown(e: KeyboardEvent) {
    // !e.isComposing for IME support
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.save();
    } else if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault();
      this.close();
    }
  }

  private save() {
    const name = this.serverName.trim();
    if (!name) {
      this.notifications.show(t('settings.mcp.modal.nameRequired'), 'error');
      this.nameInputEl?.focus();
      return;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      this.notifications.show(t('settings.mcp.modal.nameInvalid'), 'error');
      this.nameInputEl?.focus();
      return;
    }

    let config: McpServerConfig;

    if (this.serverType === 'stdio') {
      const fullCommand = this.command.trim();
      if (!fullCommand) {
        this.notifications.show(t('settings.mcp.modal.commandRequired'), 'error');
        return;
      }

      const { cmd, args } = parseCommand(fullCommand);
      const stdioConfig: McpStdioServerConfig = { command: cmd };

      if (args.length > 0) {
        stdioConfig.args = args;
      }

      const env = this.parseEnvString(this.env);
      if (Object.keys(env).length > 0) {
        stdioConfig.env = env;
      }

      config = stdioConfig;
    } else {
      const url = this.url.trim();
      if (!url) {
        this.notifications.show(t('settings.mcp.modal.urlRequired'), 'error');
        return;
      }

      if (this.serverType === 'sse') {
        const sseConfig: McpSSEServerConfig = { type: 'sse', url };
        const headers = this.parseEnvString(this.headers);
        if (Object.keys(headers).length > 0) {
          sseConfig.headers = headers;
        }
        config = sseConfig;
      } else {
        const httpConfig: McpHttpServerConfig = { type: 'http', url };
        const headers = this.parseEnvString(this.headers);
        if (Object.keys(headers).length > 0) {
          httpConfig.headers = headers;
        }
        config = httpConfig;
      }
    }

    const server: ManagedMcpServer = {
      name,
      config,
      enabled: this.enabled,
      contextSaving: this.contextSaving,
      disabledTools: this.existingServer?.disabledTools,
    };

    this.onSave(server);
    this.close();
  }

  private parseEnvString(envStr: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!envStr.trim()) return result;

    for (const line of envStr.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      if (key) {
        result[key] = value;
      }
    }

    return result;
  }

  private envRecordToString(env: Record<string, string> | undefined): string {
    if (!env) return '';
    return Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  protected onClose() {
    this.contentEl.replaceChildren();
  }
}
