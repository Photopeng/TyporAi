import type { SettingsStorageAdapter } from '@/adapters/settingsStorage';
import type { BridgeClient } from '@/hosts/bridge/BridgeClient';

import type { TyporaEditorApi } from './editor-api';

type AgentId = 'claude' | 'codex' | 'opencode';

interface AgentStatus {
  readonly available: boolean;
  readonly providerId: AgentId;
}

interface AgentStartResult {
  readonly sessionId: string;
}

interface ProcessEvent {
  readonly data?: string;
  readonly sessionId: string;
}

interface StoredMessage {
  readonly providerId: AgentId;
  readonly role: 'assistant' | 'user';
  readonly text: string;
}

const HISTORY_STORAGE_KEY = 'macosChatHistory';

/** Browser-only, streaming chat surface for the macOS Sidecar. */
export class MacosChatPanel {
  private activeSessionId: string | null = null;
  private readonly messages: HTMLElement;
  private readonly provider: HTMLSelectElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly input: HTMLTextAreaElement;

  constructor(
    root: HTMLElement,
    private readonly client: BridgeClient,
    private readonly editor: TyporaEditorApi,
    private readonly settings: SettingsStorageAdapter,
  ) {
    root.replaceChildren();
    const container = element('section', 'typorai-container typorai-macos-chat');
    const header = element('header', 'typorai-header');
    header.append(element('span', 'typorai-title-text', 'TyporAi'));
    this.provider = document.createElement('select');
    this.provider.className = 'typorai-macos-provider-select';
    for (const providerId of ['claude', 'codex', 'opencode'] as AgentId[]) {
      this.provider.append(new Option(providerLabel(providerId), providerId));
    }
    header.append(this.provider);

    const messagesWrapper = element('main', 'typorai-messages-wrapper');
    this.messages = element('div', 'typorai-messages typorai-messages-focusable');
    this.messages.append(element('div', 'typorai-welcome', 'Choose an available agent and start a conversation.'));
    messagesWrapper.append(this.messages);

    const footer = element('footer', 'typorai-input-footer');
    const inputWrapper = element('div', 'typorai-input-wrapper');
    this.input = document.createElement('textarea');
    this.input.className = 'typorai-input';
    this.input.placeholder = 'Ask TyporAi';
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        void this.send();
      }
    });
    const toolbar = element('div', 'typorai-input-toolbar');
    this.sendButton = button('Send', () => { void this.send(); });
    this.stopButton = button('Stop', () => { void this.cancel(); });
    this.stopButton.hidden = true;
    toolbar.append(this.sendButton, this.stopButton);
    inputWrapper.append(this.input, toolbar);
    footer.append(inputWrapper);
    container.append(header, messagesWrapper, footer);
    root.append(container);

    this.client.on('process.stdout', value => this.appendOutput(value, false));
    this.client.on('process.stderr', value => this.appendOutput(value, true));
    this.client.on('process.exit', value => this.complete(value));
  }

  async initialize(): Promise<void> {
    const agents = await this.client.call<AgentStatus[]>('agent.probe');
    const available = new Set(agents.filter(agent => agent.available).map(agent => agent.providerId));
    for (const option of Array.from(this.provider.options)) {
      option.disabled = !available.has(option.value as AgentId);
    }
    const firstAvailable = agents.find(agent => agent.available)?.providerId;
    if (firstAvailable) this.provider.value = firstAvailable;
    else this.input.placeholder = 'Install Claude, Codex, or OpenCode to start';
    await this.restoreHistory();
  }

  private async send(): Promise<void> {
    if (this.activeSessionId) return;
    const prompt = this.input.value.trim();
    if (!prompt) return;
    const providerId = this.provider.value as AgentId;
    if (this.provider.selectedOptions[0]?.disabled) return;
    this.appendMessage(prompt, 'user', providerId);
    this.input.value = '';
    this.setStreaming(true);
    const response = this.appendMessage('', 'assistant', providerId);
    try {
      const cwd = this.editor.getWorkspacePath() || await this.client.call<string>('environment.homeDirectory');
      const result = await this.client.call<AgentStartResult>('agent.start', {
        cwd,
        prompt: buildMacosAgentPrompt(this.getRecentMessages(), prompt),
        providerId,
      });
      this.activeSessionId = result.sessionId;
      response.dataset.sessionId = result.sessionId;
    } catch (error) {
      response.textContent = error instanceof Error ? error.message : String(error);
      this.setStreaming(false);
    }
  }

  private async cancel(): Promise<void> {
    if (!this.activeSessionId) return;
    await this.client.call('agent.cancel', { sessionId: this.activeSessionId, signal: 'SIGTERM' });
  }

  private appendOutput(value: unknown, isError: boolean): void {
    const event = value as ProcessEvent;
    if (event.sessionId !== this.activeSessionId || typeof event.data !== 'string') return;
    const response = this.messages.querySelector<HTMLElement>(`[data-session-id="${event.sessionId}"]`);
    if (!response) return;
    response.textContent += event.data;
    if (isError) response.classList.add('typorai-interrupted');
    void this.persistHistory();
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private complete(value: unknown): void {
    const event = value as ProcessEvent;
    if (event.sessionId !== this.activeSessionId) return;
    this.activeSessionId = null;
    this.setStreaming(false);
  }

  private appendMessage(
    text: string,
    role: 'assistant' | 'user',
    providerId: AgentId,
    persist = true,
  ): HTMLElement {
    const message = element('article', `typorai-message typorai-message-${role}`);
    message.dataset.providerId = providerId;
    message.dataset.role = role;
    message.textContent = text;
    this.messages.querySelector('.typorai-welcome')?.remove();
    this.messages.append(message);
    this.messages.scrollTop = this.messages.scrollHeight;
    if (persist) void this.persistHistory();
    return message;
  }

  private setStreaming(streaming: boolean): void {
    this.sendButton.disabled = streaming;
    this.provider.disabled = streaming;
    this.stopButton.hidden = !streaming;
  }

  private async restoreHistory(): Promise<void> {
    const stored = await this.settings.get<unknown>(HISTORY_STORAGE_KEY);
    if (!Array.isArray(stored) || stored.length === 0) return;
    this.messages.querySelector('.typorai-welcome')?.remove();
    for (const entry of stored) {
      if (!isStoredMessage(entry)) continue;
      this.appendMessage(entry.text, entry.role, entry.providerId, false);
    }
  }

  private async persistHistory(): Promise<void> {
    const history: StoredMessage[] = Array.from(this.messages.querySelectorAll<HTMLElement>('[data-role]'))
      .map(message => ({
        providerId: message.dataset.providerId as AgentId,
        role: message.dataset.role as 'assistant' | 'user',
        text: message.textContent ?? '',
      }))
      .slice(-200);
    await this.settings.set(HISTORY_STORAGE_KEY, history);
  }

  private getRecentMessages(): StoredMessage[] {
    return Array.from(this.messages.querySelectorAll<HTMLElement>('[data-role]'))
      .map(message => ({
        providerId: message.dataset.providerId as AgentId,
        role: message.dataset.role as 'assistant' | 'user',
        text: message.textContent ?? '',
      }))
      .slice(-20);
  }
}

function element(tagName: string, className: string, text?: string): HTMLElement {
  const result = document.createElement(tagName);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.className = 'typorai-header-action-btn';
  result.textContent = text;
  result.addEventListener('click', onClick);
  return result;
}

function providerLabel(providerId: AgentId): string {
  return providerId === 'opencode' ? 'OpenCode' : providerId[0].toUpperCase() + providerId.slice(1);
}

export function buildMacosAgentPrompt(messages: readonly StoredMessage[], latestPrompt: string): string {
  const previous = messages.slice(0, -1).map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`);
  if (previous.length === 0) return latestPrompt;
  return `Continue this conversation. Reply to the final user message.\n\n${previous.join('\n\n')}\n\nUser: ${latestPrompt}`;
}

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<StoredMessage>;
  return (message.providerId === 'claude' || message.providerId === 'codex' || message.providerId === 'opencode')
    && (message.role === 'assistant' || message.role === 'user')
    && typeof message.text === 'string';
}
