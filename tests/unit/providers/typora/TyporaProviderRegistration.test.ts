import { createAgentEngine } from '@/core/engine-factory';
import type { IAgentEngine } from '@/core/types/agent-engine';
import { typoraProviderRegistration } from '@/providers/typora/registration';

jest.mock('@/core/engine-factory', () => ({
  createAgentEngine: jest.fn(),
}));

jest.mock('@/utils/path', () => ({
  getVaultPath: jest.fn(() => 'C:\\workspace'),
}));

const mockedCreateAgentEngine = createAgentEngine as jest.MockedFunction<typeof createAgentEngine>;

describe('typoraProviderRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a provider-backed title generation service', async () => {
    const engine = createMockEngine(async (_request, callbacks) => {
      callbacks.onToken?.('"Fix Typora title."');
      return {
        id: 'assistant-1',
        role: 'assistant',
        content: 'fallback',
        timestamp: 1,
      };
    });
    mockedCreateAgentEngine.mockReturnValue(engine);
    const callback = jest.fn();

    const service = typoraProviderRegistration.createTitleGenerationService?.(createPlugin());

    await service?.generateTitle('conv-1', 'Please fix the Typora title flow', callback);

    expect(service).toBeDefined();
    expect(mockedCreateAgentEngine).toHaveBeenCalledWith(expect.objectContaining({
      apiModel: 'typora-title-model',
    }));
    expect(mockedCreateAgentEngine).toHaveBeenCalledWith(expect.not.objectContaining({
      mode: expect.anything(),
    }));
    expect(engine.chat).toHaveBeenCalledWith(expect.objectContaining({
      currentFilePath: null,
      prompt: expect.stringContaining('Please fix the Typora title flow'),
      workspacePath: 'C:\\workspace',
    }), expect.any(Object));
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'Fix Typora title',
    });
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
          apiKey: 'test-key',
          apiModel: 'typora-title-model',
          enabled: true,
        },
      },
    },
  };
}
