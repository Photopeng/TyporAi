import { createAgentEngine } from '@/core/engine-factory';
import type { IAgentEngine } from '@/core/types/agent-engine';
import { TyporaChatRuntime } from '@/providers/typora/runtime/TyporaChatRuntime';

jest.mock('@/core/engine-factory', () => ({
  createAgentEngine: jest.fn(),
}));

const mockedCreateAgentEngine = createAgentEngine as jest.MockedFunction<typeof createAgentEngine>;

describe('TyporaChatRuntime', () => {
  let originalFile: unknown;

  beforeEach(() => {
    originalFile = (window as any).File;
    jest.clearAllMocks();
  });

  afterEach(() => {
    (window as any).File = originalFile;
  });

  it('wraps engine callbacks as provider-neutral stream chunks', async () => {
    const engine = createMockEngine(async (_request, callbacks) => {
      callbacks.onToken?.('Hello');
      callbacks.onFinish?.({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
      });

      return {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
      };
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const turn = runtime.prepareTurn({ text: 'Read the note' });
    const chunks = await collectChunks(runtime.query(turn));

    expect(chunks).toEqual([
      { type: 'text', content: 'Hello' },
      expect.objectContaining({ type: 'usage', sessionId: expect.stringMatching(/^typora-session-/) }),
      { type: 'done' },
    ]);
    expect(runtime.consumeTurnMetadata()).toMatchObject({
      assistantMessageId: expect.stringMatching(/^typora-assistant-/),
      userMessageId: expect.stringMatching(/^typora-user-/),
      wasSent: true,
    });
  });

  it('creates the engine from Typora API provider settings', async () => {
    const engine = createMockEngine(async (_request, callbacks) => {
      const message = {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: 'ok',
        timestamp: 1,
      };
      callbacks.onFinish?.(message);
      return message;
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin({
      apiBaseUrl: 'https://api.example.test/messages',
      apiModel: 'model-a',
    }));

    await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Hello' })));

    expect(mockedCreateAgentEngine).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://api.example.test/messages',
      apiKey: 'test-key',
      apiModel: 'model-a',
    }));
  });

  it('emits a whole assistant message when the engine does not stream tokens', async () => {
    const engine = createMockEngine(async (_request, callbacks) => {
      const message = {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: 'Complete response',
        timestamp: 1,
      };
      callbacks.onFinish?.(message);
      return message;
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const chunks = await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Hello' })));

    expect(chunks).toEqual([
      { type: 'text', content: 'Complete response' },
      expect.objectContaining({ type: 'usage', sessionId: expect.stringMatching(/^typora-session-/) }),
      { type: 'done' },
    ]);
  });

  it('normalizes thrown engine errors into error chunks', async () => {
    const engine = createMockEngine(async () => {
      throw new Error('boom');
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const chunks = await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Hello' })));

    expect(chunks).toEqual([
      { type: 'error', content: 'boom' },
      { type: 'done' },
    ]);
  });

  it('normalizes engine readiness failures into error chunks', async () => {
    const engine = createMockEngine(async () => {
      throw new Error('should not query');
    });
    engine.init = jest.fn(async () => {
      throw new Error('missing config');
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const chunks = await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Hello' })));

    expect(chunks).toEqual([
      { type: 'error', content: 'missing config' },
      { type: 'done' },
    ]);
    expect(engine.chat).not.toHaveBeenCalled();
  });

  it('passes Typora editor text context into the engine request without document mutation hooks', async () => {
    const replaceSelection = jest.fn();
    (window as any).File = {
      editor: {
        getMarkdown: () => '# Current document',
        getSelection: () => 'Current',
        replaceSelection,
      },
      filePath: 'C:\\workspace\\note.md',
    };

    const engine = createMockEngine(async (_request, callbacks) => {
      callbacks.onFinish?.({
        id: 'assistant-1',
        role: 'assistant',
        content: 'ok',
        timestamp: 1,
      });
      return {
        id: 'assistant-1',
        role: 'assistant',
        content: 'ok',
        timestamp: 1,
      };
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Hello' })));

    const request = (engine.chat as jest.Mock).mock.calls[0][0];
    expect(request.currentDocument).toBe('# Current document');
    expect(request.currentFilePath).toBe('C:\\workspace\\note.md');
    expect(request.selection).toBe('Current');
    expect(request.approvalCallback).toBeUndefined();
    expect(request.replaceSelection).toBeUndefined();
    expect(replaceSelection).not.toHaveBeenCalled();
  });

  it('never exposes document mutation callbacks in API text mode', async () => {
    const replaceSelection = jest.fn();
    (window as any).File = {
      editor: {
        getMarkdown: () => '# Current document',
        getSelection: () => 'Current',
        replaceSelection,
      },
      filePath: 'C:\\workspace\\note.md',
    };
    const engine = createMockEngine(async (_request, callbacks) => {
      const message = { id: 'assistant-1', role: 'assistant' as const, content: 'ok', timestamp: 1 };
      callbacks.onFinish?.(message);
      return message;
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin({}, 'normal'));
    await collectChunks(runtime.query(runtime.prepareTurn({ text: 'Replace it' })));

    const request = (engine.chat as jest.Mock).mock.calls[0][0];
    expect(request.replaceSelection).toBeUndefined();
    expect(replaceSelection).not.toHaveBeenCalled();
    expect(request.approvalCallback).toBeUndefined();
  });

  it('passes conversation history and turn editor selection overrides into the engine request', async () => {
    (window as any).File = {
      editor: {
        getMarkdown: () => '# Current document',
        getSelection: () => 'live selection',
        replaceSelection: jest.fn(),
      },
      filePath: 'C:\\workspace\\live.md',
    };

    const engine = createMockEngine(async (_request, callbacks) => {
      const message = {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: 'ok',
        timestamp: 1,
      };
      callbacks.onFinish?.(message);
      return message;
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const turn = runtime.prepareTurn({
      currentNotePath: 'C:\\workspace\\override.md',
      editorSelection: {
        mode: 'selection',
        notePath: 'C:\\workspace\\selection.md',
        selectedText: 'explicit selection',
      },
      text: 'Continue',
    } as any);
    await collectChunks(runtime.query(turn, [
      {
        content: 'Earlier question',
        id: 'msg-1',
        role: 'user',
        timestamp: 100,
      },
      {
        content: 'Earlier answer',
        id: 'msg-2',
        role: 'assistant',
        timestamp: 101,
      },
    ] as any));

    const request = (engine.chat as jest.Mock).mock.calls[0][0];
    expect(request.history).toEqual([
      { content: 'Earlier question', id: 'msg-1', role: 'user', timestamp: 100 },
      { content: 'Earlier answer', id: 'msg-2', role: 'assistant', timestamp: 101 },
    ]);
    expect(request.currentDocument).toBe('# Current document');
    expect(request.currentFilePath).toBe('C:\\workspace\\override.md');
    expect(request.selection).toBe('explicit selection');
  });

  it('aborts the active engine when cancel is requested during streaming', async () => {
    let finish!: (message: {
      content: string;
      id: string;
      role: 'assistant';
      timestamp: number;
    }) => void;
    const engine = createMockEngine(async (_request, callbacks) => {
      callbacks.onToken?.('partial');
      return await new Promise((resolve) => {
        finish = resolve;
      });
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const iterator = runtime.query(runtime.prepareTurn({ text: 'Hello' }));

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'text', content: 'partial' },
    });

    runtime.cancel();

    expect(engine.abort).toHaveBeenCalledTimes(1);

    finish({
      content: 'partial',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
    });

    await collectRemainingChunks(iterator);
  });

  it('emits a compact boundary without calling the engine', async () => {
    const engine = createMockEngine(async () => {
      throw new Error('should not query');
    });
    mockedCreateAgentEngine.mockReturnValue(engine);

    const runtime = new TyporaChatRuntime(createPlugin());
    const chunks = await collectChunks(runtime.query(runtime.prepareTurn({ text: '/compact' })));

    expect(chunks).toEqual([
      { type: 'context_compacted' },
      expect.objectContaining({ type: 'usage', sessionId: expect.stringMatching(/^typora-session-/) }),
      { type: 'done' },
    ]);
    expect(engine.chat).not.toHaveBeenCalled();
  });

  it('preserves fork source state while resolving new session ids', () => {
    const runtime = new TyporaChatRuntime(createPlugin());

    runtime.syncConversationState({
      sessionId: null,
      providerState: {
        forkSource: {
          sessionId: 'source-session',
          resumeAt: 'assistant-1',
        },
      },
    });

    expect(runtime.resolveSessionIdForFork(null)).toBe('source-session');
    expect(runtime.buildSessionUpdates({
      conversation: {
        id: 'conv-1',
        providerId: 'typora',
        title: 'Fork',
        createdAt: 1,
        updatedAt: 1,
        sessionId: null,
        providerState: {
          forkSource: {
            sessionId: 'source-session',
            resumeAt: 'assistant-1',
          },
        },
        messages: [],
      },
      sessionInvalidated: false,
    }).updates).toMatchObject({
      providerState: {
        forkSource: {
          sessionId: 'source-session',
          resumeAt: 'assistant-1',
        },
      },
    });
  });

  it('reports rewind as unsupported for the lightweight Typora provider', async () => {
    const runtime = new TyporaChatRuntime(createPlugin());

    await expect(runtime.rewind('user-1', 'assistant-1')).resolves.toEqual({
      canRewind: false,
      error: 'Typora provider does not support rewind.',
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

function createPlugin(typoraConfig: Record<string, unknown> = {}, permissionMode = 'yolo'): any {
  return {
    app: { vault: { adapter: { basePath: process.cwd() } } },
    settings: {
      permissionMode,
      providerConfigs: {
        typora: {
          enabled: true,
          apiKey: 'test-key',
          ...typoraConfig,
        },
      },
    },
  };
}

async function collectChunks(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

async function collectRemainingChunks(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  while (true) {
    const next = await generator.next();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
}
