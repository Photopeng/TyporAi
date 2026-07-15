import '@/providers';

import type { HostServices } from '@/core/ports';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';

describe('ProviderWorkspaceRegistry', () => {
  afterEach(() => {
    ProviderWorkspaceRegistry.clear();
  });

  it('returns agent mention providers through the workspace registry', () => {
    const claudeProvider = { searchAgents: jest.fn().mockReturnValue([]) };
    const codexProvider = { searchAgents: jest.fn().mockReturnValue([]) };

    ProviderWorkspaceRegistry.setServices('claude', {
      agentMentionProvider: claudeProvider as any,
    });
    ProviderWorkspaceRegistry.setServices('codex', {
      agentMentionProvider: codexProvider as any,
    });

    expect(ProviderWorkspaceRegistry.getAgentMentionProvider('claude')).toBe(claudeProvider);
    expect(ProviderWorkspaceRegistry.getAgentMentionProvider('codex')).toBe(codexProvider);
  });

  it('refreshes agent mention state through the workspace registry', async () => {
    const refreshClaude = jest.fn().mockResolvedValue(undefined);
    const refreshCodex = jest.fn().mockResolvedValue(undefined);

    ProviderWorkspaceRegistry.setServices('claude', {
      refreshAgentMentions: refreshClaude,
    });
    ProviderWorkspaceRegistry.setServices('codex', {
      refreshAgentMentions: refreshCodex,
    });

    await ProviderWorkspaceRegistry.refreshAgentMentions('codex');

    expect(refreshClaude).not.toHaveBeenCalled();
    expect(refreshCodex).toHaveBeenCalled();
  });

  it('returns the assigned catalog for a provider', () => {
    const mockCatalog = {
      listDropdownEntries: jest.fn(),
      listVaultEntries: jest.fn(),
      saveVaultEntry: jest.fn(),
      deleteVaultEntry: jest.fn(),
      setRuntimeCommands: jest.fn(),
      getDropdownConfig: jest.fn(),
      refresh: jest.fn(),
    };

    ProviderWorkspaceRegistry.setServices('claude', {
      commandCatalog: mockCatalog as any,
    });

    expect(ProviderWorkspaceRegistry.getCommandCatalog('claude')).toBe(mockCatalog);
  });

  it('returns the runtime command loader for a provider', () => {
    const runtimeCommandLoader = {
      isAvailable: jest.fn().mockReturnValue(true),
      loadCommands: jest.fn().mockResolvedValue([]),
    };

    ProviderWorkspaceRegistry.setServices('opencode', {
      runtimeCommandLoader: runtimeCommandLoader as any,
    });

    expect(ProviderWorkspaceRegistry.getRuntimeCommandLoader('opencode')).toBe(runtimeCommandLoader);
  });

  it('returns the tab warmup policy for a provider', () => {
    const tabWarmupPolicy = {
      resolveMode: jest.fn().mockReturnValue('commands'),
    };

    ProviderWorkspaceRegistry.setServices('opencode', {
      tabWarmupPolicy: tabWarmupPolicy as any,
    });

    expect(ProviderWorkspaceRegistry.getTabWarmupPolicy('opencode')).toBe(tabWarmupPolicy);
  });

  it('late-binds host capabilities to initialized workspace services', () => {
    const configureClaude = jest.fn();
    const configureCodex = jest.fn();
    const host = { processes: { start: jest.fn() } } as unknown as HostServices;
    ProviderWorkspaceRegistry.setServices('claude', { configureHostServices: configureClaude });
    ProviderWorkspaceRegistry.setServices('codex', { configureHostServices: configureCodex });

    ProviderWorkspaceRegistry.configureHostServices(host);

    expect(configureClaude).toHaveBeenCalledWith(host);
    expect(configureCodex).toHaveBeenCalledWith(host);
  });

  it('disposes workspace services before clearing their registry entries', async () => {
    const disposeClaude = jest.fn().mockResolvedValue(undefined);
    const disposeCodex = jest.fn().mockResolvedValue(undefined);
    ProviderWorkspaceRegistry.setServices('claude', { dispose: disposeClaude });
    ProviderWorkspaceRegistry.setServices('codex', { dispose: disposeCodex });

    await ProviderWorkspaceRegistry.disposeAll();

    expect(disposeClaude).toHaveBeenCalledTimes(1);
    expect(disposeCodex).toHaveBeenCalledTimes(1);
    expect(ProviderWorkspaceRegistry.getServices('claude')).toBeNull();
    expect(ProviderWorkspaceRegistry.getServices('codex')).toBeNull();
  });

  it('disposes workspace services in reverse registration order without overlap', async () => {
    const events: string[] = [];
    let releaseCodex: (() => void) | undefined;
    const codexGate = new Promise<void>(resolve => { releaseCodex = resolve; });
    ProviderWorkspaceRegistry.setServices('claude', {
      dispose: async () => { events.push('claude'); },
    });
    ProviderWorkspaceRegistry.setServices('codex', {
      dispose: async () => {
        events.push('codex:start');
        await codexGate;
        events.push('codex:end');
      },
    });

    const disposal = ProviderWorkspaceRegistry.disposeAll();
    await Promise.resolve();
    expect(events).toEqual(['codex:start']);

    releaseCodex?.();
    await disposal;
    expect(events).toEqual(['codex:start', 'codex:end', 'claude']);
  });
});
