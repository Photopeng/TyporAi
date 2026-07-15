import { setIcon } from '@/ui/Icon';

import type { McpTestResult, McpTool } from '../../../core/mcp/McpTester';
import { t } from '../../../i18n/i18n';
import { appendElement } from '../../../ui/dom';
import { NativeModal } from '../../../ui/NativeModal';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';

function formatToggleError(error: unknown): string {
  if (!(error instanceof Error)) return t('settings.mcp.test.toggleError');

  const msg = error.message.toLowerCase();
  if (msg.includes('permission') || msg.includes('eacces')) {
    return t('settings.mcp.test.permissionDenied');
  }
  if (msg.includes('enospc') || msg.includes('disk full') || msg.includes('no space')) {
    return t('settings.mcp.test.diskFull');
  }
  if (msg.includes('json') || msg.includes('syntax')) {
    return t('settings.mcp.test.configCorrupted');
  }
  return error.message || t('settings.mcp.test.toggleError');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function appendSpinnerSvg(container: HTMLElement): void {
  const svg = container.ownerDocument.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = container.ownerDocument.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83'
  );
  svg.appendChild(path);

  container.appendChild(svg);
}

export class McpTestModal extends NativeModal {
  private serverName: string;
  private result: McpTestResult | null = null;
  private loading = true;
  private contentEl_: HTMLElement | null = null;
  private disabledTools: Set<string>;
  private onToolToggle?: (toolName: string, enabled: boolean) => Promise<void>;
  private onBulkToggle?: (disabledTools: string[]) => Promise<void>;
  private toolToggles: Map<string, { checkbox: HTMLInputElement; container: HTMLElement }> =
    new Map();
  private toolElements: Map<string, HTMLElement> = new Map();
  private toggleAllBtn: HTMLButtonElement | null = null;
  private pendingToggle = false;
  private readonly notifications = new NoticeAdapter();

  constructor(
    serverName: string,
    initialDisabledTools?: string[],
    onToolToggle?: (toolName: string, enabled: boolean) => Promise<void>,
    onBulkToggle?: (disabledTools: string[]) => Promise<void>
  ) {
    super();
    this.serverName = serverName;
    this.disabledTools = new Set(
      (initialDisabledTools ?? [])
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0)
    );
    this.onToolToggle = onToolToggle;
    this.onBulkToggle = onBulkToggle;
  }

  protected onOpen() {
    this.setTitle(t('settings.mcp.test.title', { name: this.serverName }));
    this.modalEl.classList.add('typorai-mcp-test-modal');
    this.contentEl_ = this.contentEl;
    this.renderLoading();
  }

  setResult(result: McpTestResult) {
    this.result = result;
    this.loading = false;
    this.render();
  }

  setError(error: string) {
    this.result = { success: false, tools: [], error };
    this.loading = false;
    this.render();
  }

  private renderLoading() {
    if (!this.contentEl_) return;
    this.contentEl_.replaceChildren();

    const loadingEl = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-loading' });

    const spinnerEl = appendElement(loadingEl, 'div', { className: 'typorai-mcp-test-spinner' });
    appendSpinnerSvg(spinnerEl);

    appendElement(loadingEl, 'span', { text: t('settings.mcp.test.connecting') });
  }

  private render() {
    if (!this.contentEl_) return;
    this.contentEl_.replaceChildren();

    if (!this.result) {
      this.renderLoading();
      return;
    }

    const statusEl = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-status' });

    const iconEl = appendElement(statusEl, 'span', { className: 'typorai-mcp-test-icon' });
    if (this.result.success) {
      setIcon(iconEl, 'check-circle');
      iconEl.classList.add('success');
    } else {
      setIcon(iconEl, 'x-circle');
      iconEl.classList.add('error');
    }

    const textEl = appendElement(statusEl, 'span', { className: 'typorai-mcp-test-text' });
    if (this.result.success) {
      if (this.result.serverName) {
        if (this.result.serverVersion) {
          textEl.textContent = t('settings.mcp.test.connectedToVersion', {
            name: this.result.serverName,
            version: this.result.serverVersion,
          });
        } else {
          textEl.textContent = t('settings.mcp.test.connectedTo', { name: this.result.serverName });
        }
      } else {
        textEl.textContent = t('settings.mcp.test.connected');
      }
    } else {
      textEl.textContent = t('settings.mcp.test.connectionFailed');
    }

    if (this.result.error) {
      const errorEl = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-error' });
      errorEl.textContent = this.result.error;
    }

    this.toolToggles.clear();
    this.toolElements.clear();

    if (this.result.tools.length > 0) {
      const toolsSection = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-tools' });

      const toolsHeader = appendElement(toolsSection, 'div', { className: 'typorai-mcp-test-tools-header' });
      toolsHeader.textContent = t('settings.mcp.test.availableTools', { count: this.result.tools.length });

      const toolsList = appendElement(toolsSection, 'div', { className: 'typorai-mcp-test-tools-list' });

      for (const tool of this.result.tools) {
        this.renderTool(toolsList, tool);
      }
    } else if (this.result.success) {
      const noToolsEl = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-no-tools' });
      noToolsEl.textContent = t('settings.mcp.test.noToolsInfo');
    }

    const buttonContainer = appendElement(this.contentEl_, 'div', { className: 'typorai-mcp-test-buttons' });

    if (this.result.tools.length > 0 && this.onToolToggle) {
      this.toggleAllBtn = appendElement(buttonContainer, 'button', { className: 'typorai-mcp-toggle-all-btn' });
      this.updateToggleAllButton();
      this.toggleAllBtn.addEventListener('click', () => {
        void this.handleToggleAll();
      });
    }

    const closeBtn = appendElement(buttonContainer, 'button', { text: t('settings.mcp.test.close'), className: 'mod-cta' });
    closeBtn.addEventListener('click', () => this.close());
  }

  private renderTool(container: HTMLElement, tool: McpTool) {
    const toolEl = appendElement(container, 'div', { className: 'typorai-mcp-test-tool' });

    const headerEl = appendElement(toolEl, 'div', { className: 'typorai-mcp-test-tool-header' });

    const iconEl = appendElement(headerEl, 'span', { className: 'typorai-mcp-test-tool-icon' });
    setIcon(iconEl, 'wrench');

    appendElement(headerEl, 'span', { className: 'typorai-mcp-test-tool-name', text: tool.name });

    const toggleEl = appendElement(headerEl, 'div', { className: 'typorai-mcp-test-tool-toggle' });
    const toggleContainer = appendElement(toggleEl, 'div', { className: 'checkbox-container' });
    const checkbox = appendElement(toggleContainer, 'input', { type: 'checkbox', attributes: { tabindex: '0' } });

    const isEnabled = !this.disabledTools.has(tool.name);
    checkbox.checked = isEnabled;
    toggleContainer.classList.toggle('is-enabled', isEnabled);
    this.updateToolState(toolEl, isEnabled);

    this.toolToggles.set(tool.name, { checkbox, container: toggleContainer });
    this.toolElements.set(tool.name, toolEl);

    if (!this.onToolToggle) {
      checkbox.disabled = true;
    } else {
      // Click on container instead of checkbox change event for cross-browser reliability
      toggleContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (checkbox.disabled) return;
        checkbox.checked = !checkbox.checked;
        void this.handleToolToggle(tool.name, checkbox, toggleContainer);
      });
    }

    if (tool.description) {
      const descEl = appendElement(toolEl, 'div', { className: 'typorai-mcp-test-tool-desc' });
      descEl.textContent = tool.description;
    }
  }

  private async handleToolToggle(
    toolName: string,
    checkbox: HTMLInputElement,
    container: HTMLElement
  ) {
    const toolEl = this.toolElements.get(toolName);
    if (!toolEl) return;

    const wasDisabled = this.disabledTools.has(toolName);
    const nextDisabled = !checkbox.checked;

    if (nextDisabled) {
      this.disabledTools.add(toolName);
    } else {
      this.disabledTools.delete(toolName);
    }

    container.classList.toggle('is-enabled', !nextDisabled);
    this.updateToolState(toolEl, !nextDisabled);
    this.updateToggleAllButton();
    checkbox.disabled = true;

    try {
      await this.onToolToggle?.(toolName, !nextDisabled);
    } catch (error) {
      // Rollback
      if (nextDisabled) {
        this.disabledTools.delete(toolName);
      } else {
        this.disabledTools.add(toolName);
      }
      checkbox.checked = !wasDisabled;
      container.classList.toggle('is-enabled', !wasDisabled);
      this.updateToolState(toolEl, !wasDisabled);
      this.updateToggleAllButton();
      this.notifications.show(formatToggleError(error), 'error');
    } finally {
      checkbox.disabled = false;
    }
  }

  private updateToolState(toolEl: HTMLElement, enabled: boolean) {
    toolEl.classList.toggle('typorai-mcp-test-tool-disabled', !enabled);
  }

  private updateToggleAllButton() {
    if (!this.toggleAllBtn || !this.result) return;

    const allEnabled = this.disabledTools.size === 0;

    if (allEnabled) {
      this.toggleAllBtn.textContent = t('settings.mcp.test.disableAll');
      this.toggleAllBtn.classList.add('is-destructive');
    } else {
      this.toggleAllBtn.textContent = t('settings.mcp.test.enableAll');
      this.toggleAllBtn.classList.remove('is-destructive');
    }
  }

  private async handleToggleAll() {
    if (!this.result || this.pendingToggle || !this.onBulkToggle) return;

    const allEnabled = this.disabledTools.size === 0;
    const previousDisabled = new Set(this.disabledTools);

    const newDisabledTools: string[] = allEnabled
      ? this.result.tools.map((t) => t.name) // Disable all
      : []; // Enable all

    this.pendingToggle = true;
    if (this.toggleAllBtn) this.toggleAllBtn.disabled = true;

    for (const { checkbox } of this.toolToggles.values()) {
      checkbox.disabled = true;
    }

    // Optimistic UI update
    this.disabledTools = new Set(newDisabledTools);
    for (const tool of this.result.tools) {
      const toggle = this.toolToggles.get(tool.name);
      const toolEl = this.toolElements.get(tool.name);
      if (!toggle || !toolEl) continue;

      const isEnabled = !this.disabledTools.has(tool.name);
      toggle.checkbox.checked = isEnabled;
      toggle.container.classList.toggle('is-enabled', isEnabled);
      this.updateToolState(toolEl, isEnabled);
    }
    this.updateToggleAllButton();

    try {
      await this.onBulkToggle(newDisabledTools);
    } catch (error) {
      this.disabledTools = previousDisabled;
      for (const tool of this.result.tools) {
        const toggle = this.toolToggles.get(tool.name);
        const toolEl = this.toolElements.get(tool.name);
        if (!toggle || !toolEl) continue;

        const isEnabled = !this.disabledTools.has(tool.name);
        toggle.checkbox.checked = isEnabled;
        toggle.container.classList.toggle('is-enabled', isEnabled);
        this.updateToolState(toolEl, isEnabled);
      }
      this.updateToggleAllButton();
      this.notifications.show(formatToggleError(error), 'error');
    }

    for (const { checkbox } of this.toolToggles.values()) {
      checkbox.disabled = false;
    }

    this.pendingToggle = false;
    if (this.toggleAllBtn) this.toggleAllBtn.disabled = false;
  }

  protected onClose() {
    this.contentEl.replaceChildren();
  }
}
