import type {
  AgentChatRequest,
  AgentEngineConfig,
  AgentMessage,
  EngineCallbacks,
  IAgentEngine,
} from '../../core/types/agent-engine';
import {
  ANTHROPIC_WORKSPACE_TOOLS,
  executeWorkspaceTool,
  type WorkspaceToolCall,
  type WorkspaceToolName,
} from './workspaceTools';

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface PendingToolUse {
  id: string;
  name: WorkspaceToolName;
  inputJson: string;
}

type ApiProtocol = 'anthropic' | 'openai';

interface ApiEndpoint {
  protocol: ApiProtocol;
  url: string;
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ExecutedTool {
  id: string;
  input: Record<string, unknown>;
  name: WorkspaceToolName;
  output: string;
}

export class ApiEngine implements IAgentEngine {
  private readonly config: AgentEngineConfig;
  private readonly history: AgentMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(config: AgentEngineConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('Typora API key is required. Add it in Settings > Providers > Typora.');
    }
  }

  async chat(request: AgentChatRequest, callbacks: EngineCallbacks): Promise<AgentMessage> {
    await this.init();
    this.abortController = new AbortController();

    const userMessage = toUserMessage(request);
    const endpoint = resolveApiEndpoint(this.config.apiBaseUrl);
    const executedTools: ExecutedTool[] = [];
    const text = endpoint.protocol === 'openai'
      ? await this.runOpenAiTurn(
        request,
        buildOpenAiMessages(request.history ?? this.history, userMessage, buildSystemPrompt(request)),
        callbacks,
        executedTools,
        endpoint.url,
      )
      : (await this.runAnthropicTurn(
        request,
        buildAnthropicMessages(request.history ?? this.history, userMessage),
        callbacks,
        executedTools,
        endpoint.url,
      ))
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('');
    const assistantMessage = createMessage('assistant', text);

    this.history.push(
      userMessage,
      ...executedTools.map(toToolMessage),
      assistantMessage,
    );
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

  private async runAnthropicTurn(
    request: AgentChatRequest,
    messages: AnthropicMessage[],
    callbacks: EngineCallbacks,
    executedTools: ExecutedTool[],
    endpointUrl: string,
    depth = 0,
  ): Promise<AnthropicContentBlock[]> {
    if (depth > 6) throw new Error('Tool loop exceeded the safety limit.');

    const { blocks, tools } = await this.streamAnthropic(messages, request, callbacks, endpointUrl);
    if (tools.length === 0) return blocks;

    const toolResults: AnthropicContentBlock[] = [];
    for (const tool of tools) {
      const parsedInput = parsePendingToolInput(tool);
      if (!parsedInput.ok) {
        callbacks.onToolStart?.({ id: tool.id, name: tool.name, input: { rawArguments: tool.inputJson } });
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input: { rawArguments: tool.inputJson }, output: parsedInput.error });
        executedTools.push({ id: tool.id, input: { rawArguments: tool.inputJson }, name: tool.name, output: `Error: ${parsedInput.error}` });
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: `Error: ${parsedInput.error}` });
        continue;
      }
      const { input } = parsedInput;
      callbacks.onToolStart?.({ id: tool.id, name: tool.name, input });
      try {
        const output = await executeWorkspaceTool(
          {
            workspacePath: request.workspacePath,
            currentDocument: request.currentDocument,
            currentFilePath: request.currentFilePath,
            requestApproval: request.approvalCallback,
            selection: request.selection,
            replaceSelection: request.replaceSelection,
          },
          { name: tool.name, input } satisfies WorkspaceToolCall,
        );
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input, output });
        executedTools.push({ id: tool.id, input, name: tool.name, output });
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: output });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input, output: message });
        executedTools.push({ id: tool.id, input, name: tool.name, output: `Error: ${message}` });
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: `Error: ${message}` });
      }
    }

    const continuedMessages: AnthropicMessage[] = [
      ...messages,
      { role: 'assistant', content: blocks },
      { role: 'user', content: toolResults },
    ];
    const nextBlocks = await this.runAnthropicTurn(request, continuedMessages, callbacks, executedTools, endpointUrl, depth + 1);
    return [
      ...blocks.filter(block => block.type === 'text'),
      ...nextBlocks.filter(block => block.type === 'text'),
    ];
  }

  private async runOpenAiTurn(
    request: AgentChatRequest,
    messages: OpenAiMessage[],
    callbacks: EngineCallbacks,
    executedTools: ExecutedTool[],
    endpointUrl: string,
    depth = 0,
  ): Promise<string> {
    if (depth > 6) throw new Error('Tool loop exceeded the safety limit.');

    const { text, tools } = await this.streamOpenAi(messages, callbacks, endpointUrl);
    if (tools.length === 0) return text;

    const assistantToolCalls = tools.map((tool): OpenAiToolCall => ({
      id: tool.id,
      type: 'function',
      function: {
        name: tool.name,
        arguments: tool.inputJson,
      },
    }));

    const toolResultMessages: OpenAiMessage[] = [];
    for (const tool of tools) {
      const parsedInput = parsePendingToolInput(tool);
      if (!parsedInput.ok) {
        callbacks.onToolStart?.({ id: tool.id, name: tool.name, input: { rawArguments: tool.inputJson } });
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input: { rawArguments: tool.inputJson }, output: parsedInput.error });
        executedTools.push({ id: tool.id, input: { rawArguments: tool.inputJson }, name: tool.name, output: `Error: ${parsedInput.error}` });
        toolResultMessages.push({ role: 'tool', tool_call_id: tool.id, content: `Error: ${parsedInput.error}` });
        continue;
      }
      const { input } = parsedInput;
      callbacks.onToolStart?.({ id: tool.id, name: tool.name, input });
      try {
        const output = await executeWorkspaceTool(
          {
            workspacePath: request.workspacePath,
            currentDocument: request.currentDocument,
            currentFilePath: request.currentFilePath,
            requestApproval: request.approvalCallback,
            selection: request.selection,
            replaceSelection: request.replaceSelection,
          },
          { name: tool.name, input } satisfies WorkspaceToolCall,
        );
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input, output });
        executedTools.push({ id: tool.id, input, name: tool.name, output });
        toolResultMessages.push({ role: 'tool', tool_call_id: tool.id, content: output });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        callbacks.onToolEnd?.({ id: tool.id, name: tool.name, input, output: message });
        executedTools.push({ id: tool.id, input, name: tool.name, output: `Error: ${message}` });
        toolResultMessages.push({ role: 'tool', tool_call_id: tool.id, content: `Error: ${message}` });
      }
    }

    const continuedMessages: OpenAiMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: text || null,
        tool_calls: assistantToolCalls,
      },
      ...toolResultMessages,
    ];
    const nextText = await this.runOpenAiTurn(request, continuedMessages, callbacks, executedTools, endpointUrl, depth + 1);
    return `${text}${nextText}`;
  }

  private async streamAnthropic(
    messages: AnthropicMessage[],
    request: AgentChatRequest,
    callbacks: EngineCallbacks,
    endpointUrl: string,
  ): Promise<{ blocks: AnthropicContentBlock[]; tools: PendingToolUse[] }> {
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
        system: buildSystemPrompt(request),
        messages,
        tools: ANTHROPIC_WORKSPACE_TOOLS,
        stream: true,
        ...buildAnthropicReasoningConfig(this.config.effortLevel),
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`API request failed: ${response.status} ${await response.text()}`);
    }

    const blocks: AnthropicContentBlock[] = [];
    const toolsByIndex = new Map<number, PendingToolUse>();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        this.applySseEvent(rawEvent, blocks, toolsByIndex, callbacks);
        boundary = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      this.applySseEvent(buffer, blocks, toolsByIndex, callbacks);
    }

    return { blocks, tools: [...toolsByIndex.values()] };
  }

  private async streamOpenAi(
    messages: OpenAiMessage[],
    callbacks: EngineCallbacks,
    endpointUrl: string,
  ): Promise<{ text: string; tools: PendingToolUse[] }> {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.apiModel ?? 'gpt-4.1',
        messages,
        tools: OPENAI_WORKSPACE_TOOLS,
        tool_choice: 'auto',
        stream: true,
        ...buildOpenAiReasoningConfig(this.config.effortLevel),
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`API request failed: ${response.status} ${await response.text()}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolsByIndex = new Map<number, PendingToolUse>();
    let buffer = '';
    let text = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        text += this.applyOpenAiSseEvent(rawEvent, toolsByIndex, callbacks);
        boundary = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      text += this.applyOpenAiSseEvent(buffer, toolsByIndex, callbacks);
    }

    return { text, tools: [...toolsByIndex.values()] };
  }

  private applySseEvent(
    rawEvent: string,
    blocks: AnthropicContentBlock[],
    toolsByIndex: Map<number, PendingToolUse>,
    callbacks: EngineCallbacks,
  ): void {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim());
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n').trim();
    if (!data || data === '[DONE]') return;

    const event = JSON.parse(data) as {
      type?: string;
      index?: number;
      content_block?: AnthropicContentBlock;
      delta?: { type?: string; text?: string; partial_json?: string };
    };

    if (event.type === 'content_block_start' && event.content_block) {
      blocks[event.index ?? blocks.length] = event.content_block;
      if (event.content_block.type === 'tool_use' && event.content_block.id && event.content_block.name) {
        toolsByIndex.set(event.index ?? blocks.length - 1, {
          id: event.content_block.id,
          name: event.content_block.name as WorkspaceToolName,
          inputJson: '',
        });
      }
      return;
    }

    if (event.type !== 'content_block_delta' || event.index == null || !event.delta) return;

    const block = blocks[event.index];
    if (event.delta.type === 'text_delta' && event.delta.text && block?.type === 'text') {
      block.text = `${block.text ?? ''}${event.delta.text}`;
      callbacks.onToken?.(event.delta.text);
      return;
    }

    if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
      const tool = toolsByIndex.get(event.index);
      if (tool) tool.inputJson += event.delta.partial_json;
    }
  }

  private applyOpenAiSseEvent(
    rawEvent: string,
    toolsByIndex: Map<number, PendingToolUse>,
    callbacks: EngineCallbacks,
  ): string {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim());
    if (dataLines.length === 0) return '';
    const data = dataLines.join('\n').trim();
    if (!data || data === '[DONE]') return '';

    const event = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: string;
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    };
    const delta = event.choices?.[0]?.delta;
    if (!delta) return '';

    let text = '';
    if (delta.content) {
      text += delta.content;
      callbacks.onToken?.(delta.content);
    }

    for (const toolCall of delta.tool_calls ?? []) {
      const index = toolCall.index ?? 0;
      const current = toolsByIndex.get(index) ?? {
        id: toolCall.id ?? `tool-${index}`,
        name: (toolCall.function?.name ?? '') as WorkspaceToolName,
        inputJson: '',
      };
      if (toolCall.id) current.id = toolCall.id;
      if (toolCall.function?.name) current.name = toolCall.function.name as WorkspaceToolName;
      if (toolCall.function?.arguments) current.inputJson += toolCall.function.arguments;
      toolsByIndex.set(index, current);
    }

    return text;
  }
}

const OPENAI_WORKSPACE_TOOLS = ANTHROPIC_WORKSPACE_TOOLS.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

export function resolveApiEndpoint(apiBaseUrl?: string): ApiEndpoint {
  const fallback = 'https://api.anthropic.com/v1/messages';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return { protocol: 'anthropic', url: fallback };

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const lower = withoutTrailingSlash.toLowerCase();
  const parsed = tryParseUrl(withoutTrailingSlash);
  const host = parsed?.host.toLowerCase() ?? '';
  const pathname = parsed?.pathname.toLowerCase() ?? lower;

  if (pathname.endsWith('/chat/completions')) {
    return { protocol: 'openai', url: withoutTrailingSlash };
  }

  if (host.includes('anthropic.com') || pathname.includes('/anthropic') || pathname.endsWith('/messages')) {
    return { protocol: 'anthropic', url: resolveAnthropicMessagesUrl(withoutTrailingSlash) };
  }

  return { protocol: 'openai', url: resolveOpenAiChatCompletionsUrl(withoutTrailingSlash) };
}

export function resolveAnthropicMessagesUrl(apiBaseUrl?: string): string {
  const fallback = 'https://api.anthropic.com/v1/messages';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return fallback;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (/\/v\d+\/messages$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  if (/\/messages$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/v1/messages`;
}

export function resolveOpenAiChatCompletionsUrl(apiBaseUrl?: string): string {
  const fallback = 'https://api.openai.com/v1/chat/completions';
  const trimmed = apiBaseUrl?.trim();
  if (!trimmed) return fallback;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  if (/\/v\d+$/i.test(withoutTrailingSlash)) {
    return `${withoutTrailingSlash}/chat/completions`;
  }

  return `${withoutTrailingSlash}/v1/chat/completions`;
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeEffortLevel(effortLevel?: string): 'low' | 'medium' | 'high' | null {
  const normalized = effortLevel?.trim().toLowerCase();
  return normalized === 'low' || normalized === 'medium' || normalized === 'high'
    ? normalized
    : null;
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
  const messages = history
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-16)
    .map((message): AnthropicMessage => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
  messages.push({ role: 'user', content: userMessage.content });
  return messages;
}

function buildOpenAiMessages(history: AgentMessage[], userMessage: AgentMessage, system: string): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [
    { role: 'system', content: system },
    ...history
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .slice(-16)
      .map((message): OpenAiMessage => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
  ];
  messages.push({ role: 'user', content: userMessage.content });
  return messages;
}

function buildSystemPrompt(request: AgentChatRequest): string {
  return [
    'You are TyporAi running inside Typora.',
    'Use the provided workspace tools only when you need local file context.',
    'Never request or infer access outside the current Typora workspace.',
    'Use workspace-relative paths only. Absolute paths are rejected.',
    `Workspace: ${request.workspacePath || 'unknown'}`,
    `Current file: ${request.currentFilePath || 'unknown'}`,
  ].join('\n');
}

function toUserMessage(request: AgentChatRequest): AgentMessage {
  const parts = [request.prompt.trim()];
  if (request.selection?.trim()) {
    parts.push(`\nSelected text:\n${request.selection}`);
  }
  if (request.currentDocument?.trim()) {
    parts.push(`\nCurrent Typora document:\n${request.currentDocument}`);
  }
  return createMessage('user', parts.join('\n'));
}

function createMessage(role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

function toToolMessage(tool: ExecutedTool): AgentMessage {
  return {
    id: tool.id,
    role: 'tool',
    content: tool.output,
    timestamp: Date.now(),
    metadata: {
      input: tool.input,
      name: tool.name,
    },
  };
}

function parsePendingToolInput(tool: PendingToolUse): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  try {
    return { ok: true, input: parseToolInput(tool.inputJson) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const rawLength = tool.inputJson.length;
    const suffix = tool.inputJson.slice(-160);
    return {
      ok: false,
      error: [
        `Invalid JSON arguments for tool "${tool.name}".`,
        'The provider streamed an incomplete or malformed tool call, so TyporAi could not safely execute it.',
        `Parser detail: ${detail}.`,
        `Argument length: ${rawLength}.`,
        suffix ? `Tail: ${suffix}` : '',
      ].filter(Boolean).join(' '),
    };
  }
}

function parseToolInput(inputJson: string): Record<string, unknown> {
  if (!inputJson.trim()) return {};
  const parsed = JSON.parse(inputJson) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
