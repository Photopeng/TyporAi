import {
  ApiEngine,
  resolveAnthropicMessagesUrl,
  resolveApiEndpoint,
  resolveOpenAiChatCompletionsUrl,
} from '@/engines/api-engine/ApiEngine';

describe('ApiEngine', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch!;
    jest.restoreAllMocks();
  });

  it('reports a clear API settings error when the API key is missing', async () => {
    await expect(new ApiEngine({}).init()).rejects.toThrow(
      'API key is required. Add it in Settings > Providers > API.',
    );
  });

  it('resolves standard Anthropic and OpenAI endpoints', () => {
    expect(resolveAnthropicMessagesUrl('https://api.deepseek.com/anthropic')).toBe(
      'https://api.deepseek.com/anthropic/v1/messages',
    );
    expect(resolveOpenAiChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(resolveApiEndpoint('https://api.deepseek.com')).toEqual({
      protocol: 'openai',
      url: 'https://api.deepseek.com/v1/chat/completions',
    });
  });

  it('sends an Anthropic text-only request while retaining explicit document context', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sseResponse([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'message_stop' },
    ]));
    globalThis.fetch = fetchMock;
    const onToken = jest.fn();
    const engine = new ApiEngine({ apiKey: 'test-key' });

    await expect(engine.chat({
      prompt: 'Summarize this',
      currentDocument: '# Document',
      selection: 'selected text',
      workspacePath: '/must-not-be-sent-as-a-tool',
    }, { onToken })).resolves.toMatchObject({ role: 'assistant', content: 'Hello' });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty('tools');
    expect(payload).not.toHaveProperty('tool_choice');
    expect(payload.system).toContain('text-only');
    expect(payload.messages.at(-1).content).toContain('Current Typora document:\n# Document');
    expect(payload.messages.at(-1).content).toContain('Selected text:\nselected text');
    expect(onToken).toHaveBeenCalledWith('Hello');
  });

  it('sends an OpenAI-compatible request without function definitions', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sseResponse([
      { choices: [{ delta: { content: 'Hi' } }] },
    ]));
    globalThis.fetch = fetchMock;

    const engine = new ApiEngine({ apiBaseUrl: 'https://api.example.test/v1', apiKey: 'test-key' });
    await expect(engine.chat({ prompt: 'Hello', workspacePath: '/workspace' }, {})).resolves.toMatchObject({ content: 'Hi' });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty('tools');
    expect(payload).not.toHaveProperty('tool_choice');
    expect(payload.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('text-only') }),
    ]));
  });
});

function sseResponse(events: unknown[]): Response {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, { status: 200 });
}
