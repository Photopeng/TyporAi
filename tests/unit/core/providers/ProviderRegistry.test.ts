import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderId,
  TitleGenerationCallback,
  TitleGenerationResult,
  TitleGenerationService,
} from '@/core/providers/types';
import { setLocale } from '@/i18n/i18n';
import { DEFAULT_CODEX_PRIMARY_MODEL } from '@/providers/codex/types/models';

describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderWorkspaceRegistry.clear();
    ProviderWorkspaceRegistry.setServices('claude', {
      mcpManager: {} as any,
      mcpServerManager: {} as any,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a runtime with the default provider id', () => {
    const runtime = ProviderRegistry.createChatRuntime({
      plugin: {} as any,
    });

    expect(runtime.providerId).toBe('typora');
  });

  it('returns capabilities for the default provider', () => {
    const caps = ProviderRegistry.getCapabilities();
    expect(caps.providerId).toBe('typora');
    expect(caps).toHaveProperty('supportsPlanMode');
    expect(caps).toHaveProperty('supportsFork');
  });

  it('returns boundary services for the default provider', () => {
    const historyService = ProviderRegistry.getConversationHistoryService();
    expect(historyService).toHaveProperty('hydrateConversationHistory');

    const taskInterpreter = ProviderRegistry.getTaskResultInterpreter();
    expect(taskInterpreter).toHaveProperty('resolveTerminalStatus');
  });

  it('returns a settings reconciler for the default provider', () => {
    const reconciler = ProviderRegistry.getSettingsReconciler();
    expect(reconciler).toHaveProperty('reconcileModelWithEnvironment');
    expect(reconciler).toHaveProperty('normalizeModelVariantSettings');
  });

  it('returns a chat UI config for the default provider', () => {
    const uiConfig = ProviderRegistry.getChatUIConfig();
    expect(uiConfig).toHaveProperty('getModelOptions');
    expect(uiConfig).toHaveProperty('getCustomModelIds');
  });

  it('throws when an unknown provider is requested', () => {
    expect(() => ProviderRegistry.getCapabilities(
      'nonexistent' as any,
    )).toThrow('Provider "nonexistent" is not registered.');
  });

  it('creates a Codex runtime', () => {
    const runtime = ProviderRegistry.createChatRuntime({
      providerId: 'codex',
      plugin: {} as any,
    });
    expect(runtime.providerId).toBe('codex');
  });

  it('returns Codex capabilities', () => {
    const caps = ProviderRegistry.getCapabilities('codex');
    expect(caps.providerId).toBe('codex');
    expect(caps.supportsPlanMode).toBe(true);
    expect(caps.supportsFork).toBe(true);
    expect(caps.supportsInstructionMode).toBe(true);
    expect(caps.supportsRewind).toBe(false);
    expect(caps.reasoningControl).toBe('effort');
  });

  it('returns OpenCode capabilities', () => {
    const caps = ProviderRegistry.getCapabilities('opencode');
    expect(caps.providerId).toBe('opencode');
    expect(caps.supportsProviderCommands).toBe(true);
    expect(caps.supportsInstructionMode).toBe(true);
    expect(caps.supportsFork).toBe(false);
  });

  it('creates a Typora runtime behind the ChatRuntime boundary', () => {
    const runtime = ProviderRegistry.createChatRuntime({
      providerId: 'typora',
      plugin: {
        app: { vault: { adapter: { basePath: process.cwd() } } },
        settings: {},
      } as any,
    });

    expect(runtime.providerId).toBe('typora');
    expect(runtime).toHaveProperty('query');
  });

  it('returns Typora capabilities', () => {
    const caps = ProviderRegistry.getCapabilities('typora');
    expect(caps.providerId).toBe('typora');
    expect(caps.supportsProviderCommands).toBe(false);
    expect(caps.supportsNativeHistory).toBe(false);
    expect(caps.reasoningControl).toBe('effort');
  });

  it('lists registered provider ids', () => {
    const ids = ProviderRegistry.getRegisteredProviderIds();
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('opencode');
    expect(ids).toContain('typora');
    expect(ids).not.toContain('pi');
  });

  it('checks whether a provider is registered without throwing', () => {
    expect(ProviderRegistry.hasProvider('claude')).toBe(true);
    expect(ProviderRegistry.hasProvider('typora')).toBe(true);
    expect(ProviderRegistry.hasProvider('pi')).toBe(false);
    expect(ProviderRegistry.hasProvider(undefined)).toBe(false);
  });

  it('filters enabled provider ids using registration metadata', () => {
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        codex: { enabled: false },
      },
    })).toEqual(['typora']);
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        codex: { enabled: true },
      },
    })).toEqual(['codex', 'typora']);
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        codex: { enabled: true },
        opencode: { enabled: true },
      },
    })).toEqual(['opencode', 'codex', 'typora']);
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        typora: { enabled: true },
      },
    })).toEqual(['typora']);
  });

  it('resolves the display name from the provider registration i18n key', () => {
    setLocale('en');
    expect(ProviderRegistry.getProviderDisplayName('claude')).toBe('Claude');
    expect(ProviderRegistry.getProviderDisplayName('codex')).toBe('Codex');
    expect(ProviderRegistry.getProviderDisplayName('opencode')).toBe('OpenCode');
    expect(ProviderRegistry.getProviderDisplayName('typora')).toBe('Typora');
  });

  it('returns a non-empty display name under non-English locales', () => {
    for (const locale of ['zh-CN', 'ja', 'de', 'fr'] as const) {
      setLocale(locale);
      for (const id of ['claude', 'codex', 'opencode', 'typora'] as const) {
        const name = ProviderRegistry.getProviderDisplayName(id);
        expect(name).toBeTruthy();
        expect(name).not.toMatch(/^provider\./);
      }
    }
    setLocale('en');
  });

  it('routes auto title generation to the default API provider', async () => {
    const providerCalls: ProviderId[] = [];
    const originalCreate = ProviderRegistry.createTitleGenerationService.bind(ProviderRegistry);
    jest.spyOn(ProviderRegistry, 'createTitleGenerationService')
      .mockImplementation((plugin: any, providerId?: ProviderId) => {
        if (!providerId) {
          return originalCreate(plugin);
        }
        providerCalls.push(providerId);
        return createMockTitleService(providerId);
      });

    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        titleGenerationModel: '',
        providerConfigs: {
          codex: { enabled: true },
        },
      },
    } as any);
    const callback = jest.fn();

    await service.generateTitle('conv-1', 'hello', callback);

    expect(providerCalls).toEqual(['typora']);
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'typora title',
    });
  });

  it('routes explicit title model selections to the owning provider', async () => {
    const providerCalls: ProviderId[] = [];
    const originalCreate = ProviderRegistry.createTitleGenerationService.bind(ProviderRegistry);
    jest.spyOn(ProviderRegistry, 'createTitleGenerationService')
      .mockImplementation((plugin: any, providerId?: ProviderId) => {
        if (!providerId) {
          return originalCreate(plugin);
        }
        providerCalls.push(providerId);
        return createMockTitleService(providerId);
      });

    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        titleGenerationModel: DEFAULT_CODEX_PRIMARY_MODEL,
        providerConfigs: {
          codex: { enabled: true },
        },
      },
    } as any);
    const callback = jest.fn();

    await service.generateTitle('conv-1', 'hello', callback);

    expect(providerCalls).toEqual(['codex']);
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'codex title',
    });
  });

  it('suppresses stale callbacks when a newer title generation replaces the old one', async () => {
    const originalCreate = ProviderRegistry.createTitleGenerationService.bind(ProviderRegistry);
    const claudeService = createDeferredTitleService();
    const codexService = createMockTitleService('codex');

    jest.spyOn(ProviderRegistry, 'createTitleGenerationService')
      .mockImplementation((plugin: any, providerId?: ProviderId) => {
        if (!providerId) {
          return originalCreate(plugin);
        }
        return providerId === 'claude' ? claudeService : codexService;
      });

    const plugin = {
      settings: {
        titleGenerationModel: 'sonnet',
        providerConfigs: {
          codex: { enabled: true },
        },
      },
    } as any;
    const service = ProviderRegistry.createTitleGenerationService(plugin);
    const callback = jest.fn();

    const first = service.generateTitle('conv-1', 'first', callback);
    plugin.settings.titleGenerationModel = DEFAULT_CODEX_PRIMARY_MODEL;
    await service.generateTitle('conv-1', 'second', callback);
    await claudeService.resolve({ success: true, title: 'stale title' });
    await first;

    expect(claudeService.cancel).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'codex title',
    });
  });
});

function createMockTitleService(providerId: ProviderId): TitleGenerationService {
  return {
    cancel: jest.fn(),
    generateTitle: jest.fn(async (conversationId, _userMessage, callback) => {
      await callback(conversationId, {
        success: true,
        title: `${providerId} title`,
      });
    }),
  };
}

function createDeferredTitleService(): TitleGenerationService & {
  resolve: (result: TitleGenerationResult) => Promise<void>;
} {
  let callback: TitleGenerationCallback | null = null;
  let conversationId = '';
  let resolvePromise: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    cancel: jest.fn(),
    generateTitle: jest.fn(async (nextConversationId, _userMessage, nextCallback) => {
      conversationId = nextConversationId;
      callback = nextCallback;
      await done;
    }),
    resolve: async (result) => {
      await callback?.(conversationId, result);
      resolvePromise?.();
    },
  };
}
