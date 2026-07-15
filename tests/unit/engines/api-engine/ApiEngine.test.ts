import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

  it('reports a clear Typora settings error when the API key is missing', async () => {
    const engine = new ApiEngine({});

    await expect(engine.init()).rejects.toThrow(
      'Typora API key is required. Add it in Settings > Providers > Typora.',
    );
  });

  it('accepts SDK-style Anthropic base URLs for the Typora API provider', async () => {
    expect(resolveAnthropicMessagesUrl('https://api.deepseek.com/anthropic')).toBe(
      'https://api.deepseek.com/anthropic/v1/messages',
    );
    expect(resolveAnthropicMessagesUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(resolveAnthropicMessagesUrl('https://api.deepseek.com/anthropic/v1/messages')).toBe(
      'https://api.deepseek.com/anthropic/v1/messages',
    );
  });

  it('accepts SDK-style OpenAI base URLs for the Typora API provider', async () => {
    expect(resolveOpenAiChatCompletionsUrl('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    );
    expect(resolveOpenAiChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(resolveOpenAiChatCompletionsUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('infers Anthropic and OpenAI protocols from common provider URLs', async () => {
    expect(resolveApiEndpoint('https://api.deepseek.com/anthropic')).toEqual({
      protocol: 'anthropic',
      url: 'https://api.deepseek.com/anthropic/v1/messages',
    });
    expect(resolveApiEndpoint('https://api.deepseek.com')).toEqual({
      protocol: 'openai',
      url: 'https://api.deepseek.com/v1/chat/completions',
    });
    expect(resolveApiEndpoint('https://api.anthropic.com')).toEqual({
      protocol: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
    });
  });

  it('executes workspace tools with Typora editor callbacks and continues the tool loop', async () => {
    const replaceSelection = jest.fn(() => true);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'replace_selection',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"text":"replacement"}',
          },
        },
      ]))
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'Done.',
          },
        },
      ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({
      apiKey: 'test-key',
    });
    const onToolStart = jest.fn();
    const onToolEnd = jest.fn();
    const onToken = jest.fn();

    const response = await engine.chat({
      prompt: 'Replace selection',
      workspacePath: process.cwd(),
      currentDocument: 'before',
      currentFilePath: 'note.md',
      selection: 'before',
      replaceSelection,
    }, {
      onToken,
      onToolEnd,
      onToolStart,
    });

    expect(replaceSelection).toHaveBeenCalledWith('replacement');
    expect(onToolStart).toHaveBeenCalledWith({
      id: 'tool-1',
      input: { text: 'replacement' },
      name: 'replace_selection',
    });
    expect(onToolEnd).toHaveBeenCalledWith({
      id: 'tool-1',
      input: { text: 'replacement' },
      name: 'replace_selection',
      output: 'Replaced current Typora selection.',
    });
    expect(onToken).toHaveBeenCalledWith('Done.');
    expect(response.content).toBe('Done.');
    expect(engine.getHistory()).toEqual([
      expect.objectContaining({ role: 'user' }),
      expect.objectContaining({
        id: 'tool-1',
        role: 'tool',
        content: 'Replaced current Typora selection.',
        metadata: {
          input: { text: 'replacement' },
          name: 'replace_selection',
        },
      }),
      expect.objectContaining({ role: 'assistant', content: 'Done.' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('routes mutating workspace tools through the shared approval callback', async () => {
    const replaceSelection = jest.fn(() => true);
    const approvalCallback = jest.fn().mockResolvedValue('deny');
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'replace_selection',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"text":"replacement"}',
          },
        },
      ]))
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        },
      ])) as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({
      apiKey: 'test-key',
    });
    const onToolEnd = jest.fn();

    await engine.chat({
      prompt: 'Replace selection',
      workspacePath: process.cwd(),
      approvalCallback,
      replaceSelection,
    }, { onToolEnd });

    expect(approvalCallback).toHaveBeenCalledWith(
      'replace_selection',
      { text: 'replacement' },
      'Replace the current Typora selection.',
      expect.any(Object),
    );
    expect(replaceSelection).not.toHaveBeenCalled();
    expect(onToolEnd).toHaveBeenCalledWith({
      id: 'tool-1',
      input: { text: 'replacement' },
      name: 'replace_selection',
      output: 'Access denied by user approval.',
    });
  });

  it('runs a read_file tool loop and continues with the tool result', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-api-engine-'));
    await fs.writeFile(path.join(workspacePath, 'note.md'), 'workspace contents', 'utf8');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'read_file',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path":"note.md"}',
          },
        },
      ]))
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'I read workspace contents.',
          },
        },
      ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({ apiKey: 'test-key' });
    const onToolStart = jest.fn();
    const onToolEnd = jest.fn();

    try {
      const response = await engine.chat({
        prompt: 'Read note.md',
        workspacePath,
      }, {
        onToolEnd,
        onToolStart,
      });

      expect(onToolStart).toHaveBeenCalledWith({
        id: 'tool-1',
        input: { path: 'note.md' },
        name: 'read_file',
      });
      expect(onToolEnd).toHaveBeenCalledWith({
        id: 'tool-1',
        input: { path: 'note.md' },
        name: 'read_file',
        output: 'workspace contents',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse((fetchMock as jest.Mock).mock.calls[1][1].body).messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            content: expect.arrayContaining([
              expect.objectContaining({
                id: 'tool-1',
                name: 'read_file',
                type: 'tool_use',
              }),
            ]),
          }),
          expect.objectContaining({
            role: 'user',
            content: [
              {
                content: 'workspace contents',
                tool_use_id: 'tool-1',
                type: 'tool_result',
              },
            ],
          }),
        ]),
      );
      expect(response.content).toBe('I read workspace contents.');
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('returns malformed Anthropic tool arguments to the model instead of crashing', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-bad',
            name: 'write_file',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path":"note.md","content":"unterminated',
          },
        },
      ]))
      .mockResolvedValueOnce(createSseResponse([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'I will output the revised document directly.',
          },
        },
      ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({ apiKey: 'test-key' });
    const onToolEnd = jest.fn();

    const response = await engine.chat({
      prompt: 'Optimize this document',
      workspacePath: process.cwd(),
    }, { onToolEnd });

    expect(onToolEnd).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-bad',
      name: 'write_file',
      output: expect.stringContaining('Invalid JSON arguments for tool "write_file"'),
    }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'tool_result',
              tool_use_id: 'tool-bad',
              content: expect.stringContaining('Invalid JSON arguments'),
            }),
          ],
        }),
      ]),
    );
    expect(response.content).toBe('I will output the revised document directly.');
  });

  it('flushes a final SSE event even without a trailing blank line', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce(createRawSseResponse([
      `data: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'No terminator',
        },
      })}`,
    ])) as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({ apiKey: 'test-key' });
    const onToken = jest.fn();

    const response = await engine.chat({
      prompt: 'Hello',
      workspacePath: process.cwd(),
    }, { onToken });

    expect(onToken).toHaveBeenCalledWith('No terminator');
    expect(response.content).toBe('No terminator');
  });

  it('parses SSE events with multiple data lines', async () => {
    const eventJson = JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: 'Split data',
      },
    });
    globalThis.fetch = jest.fn().mockResolvedValueOnce(createRawSseResponse([
      `data: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      })}\n\n`,
      `data: ${eventJson}\n`,
      'data: \n\n',
    ])) as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({ apiKey: 'test-key' });

    const response = await engine.chat({
      prompt: 'Hello',
      workspacePath: process.cwd(),
    }, {});

    expect(response.content).toBe('Split data');
  });

  it('sends Anthropic-compatible effort configuration when selected', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(createSseResponse([
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      },
    ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.deepseek.com/anthropic',
      effortLevel: 'high',
    });

    await engine.chat({
      prompt: 'Hello',
      workspacePath: process.cwd(),
    }, {});

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).output_config).toEqual({ effort: 'high' });
  });

  it('sends OpenAI-compatible effort configuration when selected', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(createOpenAiSseResponse([
      { choices: [{ delta: { content: 'ok' } }] },
    ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.deepseek.com',
      effortLevel: 'low',
    });

    await engine.chat({
      prompt: 'Hello',
      workspacePath: process.cwd(),
    }, {});

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe('low');
  });

  it('runs an OpenAI-compatible tool loop and continues with tool results', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-api-engine-openai-'));
    await fs.writeFile(path.join(workspacePath, 'note.md'), 'openai workspace contents', 'utf8');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createOpenAiSseResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call-1',
                type: 'function',
                function: { name: 'read_file', arguments: '' },
              }],
            },
          }],
        },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '{"path":"note.md"}' },
              }],
            },
          }],
        },
      ]))
      .mockResolvedValueOnce(createOpenAiSseResponse([
        { choices: [{ delta: { content: 'Read via OpenAI.' } }] },
      ]));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const engine = new ApiEngine({
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.deepseek.com',
      apiModel: 'deepseek-v4-flash',
    });
    const onToolStart = jest.fn();
    const onToolEnd = jest.fn();
    const onToken = jest.fn();

    try {
      const response = await engine.chat({
        prompt: 'Read note.md',
        workspacePath,
      }, {
        onToken,
        onToolEnd,
        onToolStart,
      });

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools[0]).toEqual(
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({ name: 'read_file' }),
        }),
      );
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            tool_calls: [expect.objectContaining({
              id: 'call-1',
              function: expect.objectContaining({
                name: 'read_file',
                arguments: '{"path":"note.md"}',
              }),
            })],
          }),
          expect.objectContaining({
            role: 'tool',
            tool_call_id: 'call-1',
            content: 'openai workspace contents',
          }),
        ]),
      );
      expect(onToolStart).toHaveBeenCalledWith({
        id: 'call-1',
        input: { path: 'note.md' },
        name: 'read_file',
      });
      expect(onToolEnd).toHaveBeenCalledWith({
        id: 'call-1',
        input: { path: 'note.md' },
        name: 'read_file',
        output: 'openai workspace contents',
      });
      expect(onToken).toHaveBeenCalledWith('Read via OpenAI.');
      expect(response.content).toBe('Read via OpenAI.');
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function createSseResponse(events: Array<Record<string, unknown>>): {
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
  ok: boolean;
  text(): Promise<string>;
} {
  return createRawSseResponse(events.map(event => `data: ${JSON.stringify(event)}\n\n`));
}

function createOpenAiSseResponse(events: Array<Record<string, unknown>>): {
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
  ok: boolean;
  text(): Promise<string>;
} {
  return createRawSseResponse([
    ...events.map(event => `data: ${JSON.stringify(event)}\n\n`),
    'data: [DONE]\n\n',
  ]);
}

function createRawSseResponse(rawChunks: string[]): {
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
  ok: boolean;
  text(): Promise<string>;
} {
  const encoder = new TextEncoder();
  const chunks = rawChunks.map(chunk => encoder.encode(chunk));

  return {
    ok: true,
    text: async () => '',
    body: {
      getReader() {
        let index = 0;
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true };
            }
            return { done: false, value: chunks[index++] };
          },
        };
      },
    },
  };
}
