import type {
  AgentChatRequest,
  AgentEngineConfig,
  AgentMessage,
  EngineCallbacks,
  IAgentEngine,
} from '../../core/types/agent-engine';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ApiProtocol = 'anthropic' | 'openai';

export interface ApiEndpoint {
  protocol: ApiProtocol;
  url: string;
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Text-only API runtime. It deliberately does not expose provider tools,
 * workspace operations, approval callbacks, MCP, or agent control surfaces.
 */
export class ApiEngine implements IAgentEngine {
  private readonly config: AgentEngineConfig;
  private readonly history: AgentMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(config: AgentEngineConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('API key is required. Add it in Settings > Providers > API.');
    }
  }

  async chat(request: AgentChatRequest, callbacks: EngineCallbacks): Promise<AgentMessage> {
    await this.init();
    this.abortController = new AbortController();
    const userMessage = toUserMessage(request);
    const endpoint = resolveApiEndpoint(this.config.apiBaseUrl);
    const priorHistory = request.history ?? this.history;
    const text = endpoint.protocol === 'openai'
      ? await this.streamOpenAi(buildOpenAiMessages(priorHistory, userMessage), callbacks, endpoint.url)
      : await this.streamAnthropic(buildAnthropicMessages(priorHistory, userMessage), callbacks, endpoint.url);
    const assistantMessage = createMessage('assistant', text);
    this.history.push(userMessage, assistantMessage);
    callbacks.onFinish?.(assistantMessage);
    return assistantMessage;
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  private async streamAnthropic(
    messages: AnthropicMessage[],
    callbacks: EngineCallbacks,
    endpointUrl: string,
  ): Promise<string> {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.apiModel ?? 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: buildSystemPrompt(),
        messages,
        stream: true,
        ...buildAnthropicReasoningConfig(this.config.effortLevel),
      }),
      signal: this.abortController?.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(formatApiRequestError(response.status, await response.text(), this.config.apiKey));
    }
    return readSseText(response.body, (event) => {
      const data = event as { type?: string; delta?: { type?: string; text?: string } };
      return data.type === 'content_block_delta' && data.delta?.type === 'text_delta'
        ? data.delta.text ?? ''
        : '';
    }, callbacks);
  }

  private async streamOpenAi(
    messages: OpenAiMessage[],
    callbacks: EngineCallbacks,
    endpointUrl: string,
  ): Promise<string> {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.apiModel ?? 'gpt-4.1',
        messages,
        stream: true,
        ...buildOpenAiReasoningConfig(this.config.effortLevel),
      }),
      signal: this.abortController?.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(formatApiRequestError(response.status, await response.text(), this.config.apiKey));
    }
    return readSseText(response.body, (event) => {
      const data = event as { choices?: Array<{ delta?: { content?: string | null } }> };
      return data.choices?.[0]?.delta?.content ?? '';
    }, callbacks);
  }
}

function formatApiRequestError(status: number, body: string, apiKey?: string): string {
  return `API request failed: ${status} ${redactApiSecrets(body, apiKey)}`;
}

/** Removes credentials before API diagnostics or compatibility-server errors reach the UI. */
export function redactApiSecrets(value: string, apiKey?: string): string {
  let redacted = value;
  if (apiKey) {
    redacted = redacted.split(apiKey).join('[REDACTED]');
  }

  return redacted
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;"'}]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*["']?)[^\s,;"'}]+/gi, '$1[REDACTED]');
}

async function readSseText(
  body: ReadableStream<Uint8Array>,
  selectText: (event: unknown) => string,
  callbacks: EngineCallbacks,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const consume = (rawEvent: string): void => {
    const data = rawEvent.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n').trim();
    if (!data || data === '[DONE]') return;
    const delta = selectText(JSON.parse(data));
    if (delta) {
      text += delta;
      callbacks.onToken?.(delta);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consume(buffer);
  return text;
}

export function resolveApiEndpoint(apiBaseUrl?: string): ApiEndpoint {
  const fallback = 'https://api.anthropic.com/v1/messages';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return { protocol: 'anthropic', url: fallback };
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const parsed = tryParseUrl(withoutTrailingSlash);
  const host = parsed?.host.toLowerCase() ?? '';
  const pathname = parsed?.pathname.toLowerCase() ?? withoutTrailingSlash.toLowerCase();
  if (pathname.endsWith('/chat/completions')) return { protocol: 'openai', url: withoutTrailingSlash };
  if (host.includes('anthropic.com') || pathname.includes('/anthropic') || pathname.endsWith('/messages')) {
    return { protocol: 'anthropic', url: resolveAnthropicMessagesUrl(withoutTrailingSlash) };
  }
  return { protocol: 'openai', url: resolveOpenAiChatCompletionsUrl(withoutTrailingSlash) };
}

export function resolveAnthropicMessagesUrl(apiBaseUrl?: string): string {
  const fallback = 'https://api.anthropic.com/v1/messages';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return fallback;
  const base = trimmed.replace(/\/+$/, '');
  return /(?:\/v\d+)?\/messages$/i.test(base) ? base : `${base}/v1/messages`;
}

export function resolveOpenAiChatCompletionsUrl(apiBaseUrl?: string): string {
  const fallback = 'https://api.openai.com/v1/chat/completions';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return fallback;
  const base = trimmed.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return /\/v\d+$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function tryParseUrl(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}

function normalizeEffortLevel(effortLevel?: string): 'low' | 'medium' | 'high' | null {
  const effort = effortLevel?.trim().toLowerCase();
  return effort === 'low' || effort === 'medium' || effort === 'high' ? effort : null;
}

function buildAnthropicReasoningConfig(effortLevel?: string): Record<string, unknown> {
  const effort = normalizeEffortLevel(effortLevel);
  return effort ? { output_config: { effort } } : {};
}

function buildOpenAiReasoningConfig(effortLevel?: string): Record<string, unknown> {
  const effort = normalizeEffortLevel(effortLevel);
  return effort ? { reasoning_effort: effort } : {};
}

function buildAnthropicMessages(history: AgentMessage[], userMessage: AgentMessage): AnthropicMessage[] {
  return [...history.filter((message) => message.role === 'user' || message.role === 'assistant').slice(-16), userMessage]
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
}

function buildOpenAiMessages(history: AgentMessage[], userMessage: AgentMessage): OpenAiMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt() },
    ...history.filter((message) => message.role === 'user' || message.role === 'assistant').slice(-16)
      .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
    { role: 'user', content: userMessage.content },
  ];
}

function buildSystemPrompt(): string {
  return 'You are TyporAi running inside Typora. Provide text-only assistance. Do not claim to access files, tools, commands, MCP servers, skills, agents, or the local workspace.';
}

function toUserMessage(request: AgentChatRequest): AgentMessage {
  const parts = [request.prompt.trim()];
  if (request.selection?.trim()) parts.push(`\nSelected text:\n${request.selection}`);
  if (request.currentDocument?.trim()) parts.push(`\nCurrent Typora document:\n${request.currentDocument}`);
  return createMessage('user', parts.join('\n'));
}

function createMessage(role: AgentMessage['role'], content: string): AgentMessage {
  return { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, content, timestamp: Date.now() };
}
