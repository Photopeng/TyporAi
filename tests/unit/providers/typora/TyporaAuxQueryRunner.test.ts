import { createAgentEngine } from '@/core/engine-factory';
import type { IAgentEngine } from '@/core/types/agent-engine';
import { TyporaAuxQueryRunner } from '@/providers/typora/auxiliary/TyporaAuxQueryRunner';

jest.mock('@/core/engine-factory', () => ({
  createAgentEngine: jest.fn(),
}));

jest.mock('@/utils/path', () => ({
  getVaultPath: jest.fn(() => 'C:\\workspace'),
}));

const mockedCreateAgentEngine = createAgentEngine as jest.MockedFunction<typeof createAgentEngine>;

describe('TyporaAuxQueryRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes model overrides into the Typora engine settings', async () => {
    const engine = createMockEngine(async () => ({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Generated title',
      timestamp: 1,
    }));
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runner = new TyporaAuxQueryRunner(createPlugin());

    await runner.query({
      model: 'title-model',
      systemPrompt: 'System',
    }, 'Prompt');

    expect(mockedCreateAgentEngine).toHaveBeenCalledWith(expect.objectContaining({
      apiModel: 'title-model',
    }));
    expect(mockedCreateAgentEngine).toHaveBeenCalledWith(expect.not.objectContaining({
      mode: expect.anything(),
    }));
  });

  it('reports accumulated text chunks while streaming', async () => {
    const engine = createMockEngine(async (_request, callbacks) => {
      callbacks.onToken?.('Hel');
      callbacks.onToken?.('lo');
      return {
        id: 'assistant-1',
        role: 'assistant',
        content: 'fallback',
        timestamp: 1,
      };
    });
    mockedCreateAgentEngine.mockReturnValue(engine);
    const onTextChunk = jest.fn();

    const runner = new TyporaAuxQueryRunner(createPlugin());
    const text = await runner.query({
      onTextChunk,
      systemPrompt: 'System',
    }, 'Prompt');

    expect(text).toBe('Hello');
    expect(onTextChunk).toHaveBeenNthCalledWith(1, 'Hel');
    expect(onTextChunk).toHaveBeenNthCalledWith(2, 'Hello');
  });

  it('aborts the active engine when the query abort signal fires', async () => {
    let resolveChat!: (value: Awaited<ReturnType<IAgentEngine['chat']>>) => void;
    const engine = createMockEngine(() => new Promise(resolve => {
      resolveChat = resolve;
    }));
    mockedCreateAgentEngine.mockReturnValue(engine);
    const abortController = new AbortController();

    const runner = new TyporaAuxQueryRunner(createPlugin());
    const query = runner.query({
      abortController,
      systemPrompt: 'System',
    }, 'Prompt');

    abortController.abort();
    resolveChat({
      id: 'assistant-1',
      role: 'assistant',
      content: 'done',
      timestamp: 1,
    });

    await expect(query).resolves.toBe('done');
    expect(engine.abort).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when the query signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const runner = new TyporaAuxQueryRunner(createPlugin());

    await expect(runner.query({
      abortController,
      systemPrompt: 'System',
    }, 'Prompt')).rejects.toThrow('Query cancelled.');
    expect(mockedCreateAgentEngine).not.toHaveBeenCalled();
  });
});

function createMockEngine(
  chat: IAgentEngine['chat'],
): IAgentEngine {
  return {
    abort: jest.fn(),
    chat: jest.fn(chat),
    getHistory: jest.fn(() => []),
    init: jest.fn(),
  };
}

function createPlugin(): any {
  return {
    app: { vault: { adapter: { basePath: 'C:\\workspace' } } },
    settings: {
      providerConfigs: {
        typora: {
          enabled: true,
          apiKey: 'test-key',
          apiModel: 'default-model',
        },
      },
    },
  };
}
