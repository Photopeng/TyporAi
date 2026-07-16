import { BridgeChatRuntime } from '@/bridge/chat/BridgeChatRuntime';
import { type BridgeInteraction,BridgeInteractionService } from '@/bridge/chat/BridgeInteractionService';
import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import type { StreamChunk } from '@/core/types';

interface ProviderStatus { readonly providerId: string; readonly status: string; }

/** Shared Browser-only Typora surface for every platform. */
export class SidecarChatPanel {
  private runtime: BridgeChatRuntime | null = null;
  private readonly interactions: BridgeInteractionService;
  private readonly messages: HTMLElement;
  private readonly provider: HTMLSelectElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly workspace: HTMLButtonElement;

  constructor(private readonly root: HTMLElement, private readonly client: WebSocketRpcClient) {
    root.replaceChildren();
    root.className = 'typorai-sidecar-panel';
    installPanelStyles();
    this.interactions = new BridgeInteractionService(client);
    this.interactions.onRequest(interaction => this.renderInteraction(interaction));
    const masthead = document.createElement('header'); masthead.className = 'typorai-sidecar-panel__masthead';
    masthead.append(label('TyporAi', 'typorai-sidecar-panel__title'));
    this.provider = document.createElement('select'); this.provider.setAttribute('aria-label', 'Provider'); masthead.append(this.provider);
    this.workspace = button('Workspace', () => { void this.grantWorkspace(); }); this.workspace.className = 'typorai-sidecar-panel__workspace'; masthead.append(this.workspace);
    this.messages = document.createElement('main'); this.messages.className = 'typorai-sidecar-panel__messages'; this.messages.setAttribute('aria-live', 'polite');
    this.messages.append(label('Sidecar connected. Select a provider to begin.', 'typorai-sidecar-panel__notice'));
    const composer = document.createElement('footer'); composer.className = 'typorai-sidecar-panel__composer';
    this.prompt = document.createElement('textarea'); this.prompt.placeholder = 'Ask about this document'; this.prompt.rows = 3;
    this.prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey) { event.preventDefault(); void this.submit(); } });
    this.send = button('Send', () => { void this.submit(); });
    this.cancel = button('Stop', () => { void this.stop(); }); this.cancel.hidden = true;
    composer.append(this.prompt, this.send, this.cancel);
    root.append(masthead, this.messages, composer);
  }

  async initialize(): Promise<void> {
    const providers = await this.client.request<ProviderStatus[]>('provider.list');
    for (const item of providers) { const option = new Option(item.providerId, item.providerId); option.disabled = item.status !== 'available'; this.provider.append(option); }
    if (!this.provider.options.length) this.messages.append(label('No Sidecar provider is available.', 'typorai-sidecar-panel__notice'));
    await this.refreshWorkspace();
  }

  private async submit(): Promise<void> {
    const text = this.prompt.value.trim();
    if (!text || !this.provider.value || this.runtime) return;
    this.append('user', text);
    this.prompt.value = ''; this.send.disabled = true; this.cancel.hidden = false;
    const output = this.append('assistant', '');
    this.runtime = new BridgeChatRuntime(this.client, { providerId: this.provider.value, runtimeId: crypto.randomUUID() });
    try {
      for await (const chunk of this.runtime.query(this.runtime.prepareTurn({ text }))) this.render(output, chunk);
    } finally {
      void this.runtime.dispose(); this.runtime = null; this.send.disabled = false; this.cancel.hidden = true;
    }
  }

  private async stop(): Promise<void> { await this.runtime?.cancel(); }
  private renderInteraction(interaction: BridgeInteraction): void {
    const card = document.createElement('section'); card.className = 'typorai-sidecar-panel__interaction';
    const description = typeof interaction.payload.description === 'string' ? interaction.payload.description : 'Provider interaction requested.';
    card.append(label(description, 'typorai-sidecar-panel__interaction-description'));
    const resolve = async (result: unknown): Promise<void> => {
      card.querySelectorAll('button,textarea').forEach(element => { (element as HTMLButtonElement | HTMLTextAreaElement).disabled = true; });
      try { await this.interactions.resolve(interaction, result); card.remove(); }
      catch { card.querySelectorAll('button,textarea').forEach(element => { (element as HTMLButtonElement | HTMLTextAreaElement).disabled = false; }); }
    };
    if (interaction.kind === 'userInput') {
      const input = document.createElement('textarea'); input.rows = 2; input.placeholder = 'Type your response';
      card.append(input, button('Submit', () => { void resolve({ answers: input.value }); }));
    } else {
      card.append(button('Allow', () => { void resolve({ approved: true }); }), button('Deny', () => { void resolve({ approved: false }); }));
    }
    this.messages.append(card); card.scrollIntoView({ block: 'end' });
  }
  private async refreshWorkspace(): Promise<void> {
    const result = await this.client.request<{ root: string | null }>('workspace.getCurrent');
    this.workspace.textContent = result.root ? `Workspace: ${basename(result.root)}` : 'Grant workspace';
  }
  private async grantWorkspace(): Promise<void> {
    const root = window.prompt('Absolute workspace path for Sidecar access');
    if (!root?.trim()) return;
    await this.client.request('workspace.grant', { root: root.trim() });
    await this.refreshWorkspace();
  }
  private append(role: 'assistant' | 'user', text: string): HTMLElement { const entry = document.createElement('article'); entry.className = `typorai-sidecar-panel__message typorai-sidecar-panel__message--${role}`; entry.textContent = text; this.messages.append(entry); entry.scrollIntoView({ block: 'end' }); return entry; }
  private render(output: HTMLElement, chunk: StreamChunk): void { if (chunk.type === 'text') output.textContent += chunk.content; if (chunk.type === 'error') output.textContent = chunk.content; }
}

function label(text: string, className: string): HTMLElement { const element = document.createElement('span'); element.className = className; element.textContent = text; return element; }
function button(text: string, click: () => void): HTMLButtonElement { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.addEventListener('click', click); return element; }
function basename(value: string): string { return value.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || value; }

function installPanelStyles(): void {
  if (document.getElementById('typorai-sidecar-panel-style')) return;
  const style = document.createElement('style'); style.id = 'typorai-sidecar-panel-style'; style.textContent = `.typorai-sidecar-panel{--ink:#25211b;--paper:#f7f0e2;--signal:#b73623;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr auto;gap:12px;height:100%;min-height:360px;padding:16px;background:var(--paper);color:var(--ink);font-family:Georgia,serif}.typorai-sidecar-panel *{box-sizing:border-box}.typorai-sidecar-panel__masthead{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--ink);padding-bottom:9px}.typorai-sidecar-panel__title{font-family:Impact,serif;font-size:24px;letter-spacing:.04em;text-transform:uppercase}.typorai-sidecar-panel select,.typorai-sidecar-panel textarea,.typorai-sidecar-panel button{font:inherit;border:1px solid var(--ink);background:transparent;color:inherit}.typorai-sidecar-panel__messages{display:flex;flex-direction:column;gap:10px;overflow:auto}.typorai-sidecar-panel__message{max-width:88%;padding:10px 12px;border-left:4px solid var(--ink);white-space:pre-wrap}.typorai-sidecar-panel__message--user{align-self:end;border-left:0;border-right:4px solid var(--signal);background:rgba(183,54,35,.08)}.typorai-sidecar-panel__notice{font-style:italic}.typorai-sidecar-panel__composer{display:grid;grid-template-columns:1fr auto auto;gap:8px}.typorai-sidecar-panel textarea{min-width:0;padding:9px;resize:vertical}.typorai-sidecar-panel button{padding:0 12px;cursor:pointer}.typorai-sidecar-panel button:focus-visible,.typorai-sidecar-panel textarea:focus-visible,.typorai-sidecar-panel select:focus-visible{outline:3px solid var(--signal);outline-offset:2px}`; document.head.append(style);
}
