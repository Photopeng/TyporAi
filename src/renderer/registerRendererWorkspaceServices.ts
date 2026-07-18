import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import { McpServerManager } from '@/core/mcp/McpServerManager';
import { setSingleEnabledCliProvider } from '@/core/providers/cliProviderSelection';
import type { ProviderCommandCatalog,ProviderCommandDropdownConfig } from '@/core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { getProviderConfig } from '@/core/providers/providerConfig';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type {
  AgentMentionProvider,
  AppAgentManager,
  AppAgentStorage,
  AppMcpStorage,
  ProviderCliResolver,
  ProviderId,
  ProviderRuntimeCommandLoader,
  ProviderSettingsTabRenderer,
  ProviderWorkspaceServices,
} from '@/core/providers/types';
import type { AgentDefinition,ManagedMcpServer,SlashCommand } from '@/core/types';
import { renderEnvironmentSettingsSection } from '@/features/settings/ui/EnvironmentSettingsSection';
import { McpSettingsManager } from '@/features/settings/ui/McpSettingsManager';
import { t } from '@/i18n/i18n';
import type TyporAiPlugin from '@/main';
import { CLAUDE_SAFE_MODES,getClaudeProviderSettings,updateClaudeProviderSettings } from '@/providers/claude/settings';
import { AgentSettings } from '@/providers/claude/ui/AgentSettings';
import { getCodexProviderSettings,updateCodexProviderSettings } from '@/providers/codex/settings';
import { getOpencodeProviderSettings,updateOpencodeProviderSettings } from '@/providers/opencode/settings';
import { typoraSettingsTabRenderer } from '@/providers/typora/ui/TyporaSettingsTab';
import { SettingBuilder } from '@/ui/SettingBuilder';

interface DiscoveredAgent {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly provider: 'claude' | 'codex' | 'opencode';
}

interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export async function registerRendererWorkspaceServices(
  rpc: WebSocketRpcClient,
  plugin: TyporAiPlugin,
): Promise<void> {
  const mcpStorage = new BridgeMcpStorage(rpc);
  const mcpManager = new McpServerManager(mcpStorage);
  try { await mcpManager.loadServers(); } catch {
    // Discovery is optional during startup. The settings surface can retry
    // once Sidecar workspace services become available.
  }

  for (const providerId of ProviderRegistry.getRegisteredProviderIds()) {
    if (providerId === 'typora') {
      ProviderWorkspaceRegistry.setServices(providerId, { settingsTabRenderer: typoraSettingsTabRenderer });
      continue;
    }
    const agents = new BridgeAgentManager(rpc, providerId);
    await agents.loadAgents();
    const commandCatalog = new BridgeCommandCatalog(rpc, providerId);
    await commandCatalog.refresh();
    const services: ProviderWorkspaceServices = {
      agentMentionProvider: agents,
      cliResolver: new BridgeCliResolver(providerId),
      commandCatalog,
      mcpServerManager: mcpManager,
      refreshAgentMentions: () => agents.loadAgents(),
      runtimeCommandLoader: bridgeRuntimeCommandLoader,
      settingsTabRenderer: createBridgeSettingsRenderer(rpc, providerId, agents, mcpStorage),
      tabWarmupPolicy: { resolveMode: () => 'commands' },
    };
    ProviderWorkspaceRegistry.setServices(providerId, services);
  }

  // Keep the cache synchronized when settings opens after an external edit.
  void plugin;
}

class BridgeCliResolver implements ProviderCliResolver {
  constructor(private readonly providerId: Exclude<ProviderId, 'typora'>) {}
  resolveFromSettings(settings: Record<string, unknown>): string | null {
    if (!ProviderRegistry.isEnabled(this.providerId, settings)) return null;
    const configured = getProviderConfig(settings, this.providerId).cliPath;
    return typeof configured === 'string' && configured.trim() ? configured.trim() : this.providerId;
  }
  reset(): void {}
}

const bridgeRuntimeCommandLoader: ProviderRuntimeCommandLoader = {
  isAvailable: () => true,
  async loadCommands(context): Promise<SlashCommand[]> {
    return await context.runtime?.getSupportedCommands?.() ?? [];
  },
};

class BridgeCommandCatalog implements ProviderCommandCatalog {
  private skills: DiscoveredSkill[] = [];
  private runtimeCommands: SlashCommand[] = [];
  constructor(private readonly rpc: WebSocketRpcClient, private readonly providerId: ProviderId) {}

  async listDropdownEntries({ includeBuiltIns }: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    const entries: ProviderCommandEntry[] = this.skills.filter(skill => skillBelongsToProvider(skill, this.providerId)).map(skill => ({
      content: '',
      displayPrefix: this.providerId === 'codex' ? '$' : '/',
      id: skill.id,
      insertPrefix: this.providerId === 'codex' ? '$' : '/',
      isDeletable: false,
      isEditable: false,
      kind: 'skill' as const,
      name: skill.name,
      providerId: this.providerId,
      scope: 'vault' as const,
      source: 'user' as const,
    }));
    const runtime = this.runtimeCommands.map(command => slashCommandEntry(command, this.providerId));
    if (includeBuiltIns && this.providerId === 'codex') {
      entries.unshift(slashCommandEntry({ id: 'codex-compact', name: 'compact', content: '', source: 'builtin' }, this.providerId));
    }
    return [...entries, ...runtime];
  }
  listVaultEntries(): Promise<ProviderCommandEntry[]> { return this.listDropdownEntries({ includeBuiltIns: false }); }
  saveVaultEntry(): Promise<void> { return Promise.reject(new Error('Edit the skill file in the workspace.')); }
  deleteVaultEntry(): Promise<void> { return Promise.reject(new Error('Delete the skill file in the workspace.')); }
  setRuntimeCommands(commands: SlashCommand[]): void { this.runtimeCommands = [...commands]; }
  getDropdownConfig(): ProviderCommandDropdownConfig {
    const codex = this.providerId === 'codex';
    return {
      builtInPrefix: '/',
      commandPrefix: '/',
      providerId: this.providerId,
      skillPrefix: codex ? '$' : '/',
      triggerChars: codex ? ['/', '$'] : ['/'],
    };
  }
  async refresh(): Promise<void> {
    try { this.skills = [...await this.rpc.request<readonly DiscoveredSkill[]>('skills.list')]; }
    catch { this.skills = []; }
  }
}

class BridgeMcpStorage implements AppMcpStorage {
  constructor(private readonly rpc: WebSocketRpcClient) {}
  load(): Promise<ManagedMcpServer[]> { return this.rpc.request('mcp.list'); }
  async save(servers: ManagedMcpServer[]): Promise<void> { await this.rpc.request('mcp.save', { servers }); }
}

class BridgeAgentManager implements AppAgentManager,AppAgentStorage,AgentMentionProvider {
  private agents: AgentDefinition[] = [];
  constructor(private readonly rpc: WebSocketRpcClient, private readonly providerId: Exclude<ProviderId, 'typora'>) {}
  async loadAgents(): Promise<void> {
    try {
      const discovered = await this.rpc.request<readonly DiscoveredAgent[]>('agents.list');
      const own = discovered.filter(agent => agent.provider === this.providerId);
      this.agents = await Promise.all(own.map(agent => this.readDiscoveredAgent(agent)));
    } catch {
      this.agents = [];
    }
  }
  getAvailableAgents(): AgentDefinition[] { return [...this.agents]; }
  getAgentById(id: string): AgentDefinition | undefined { return this.agents.find(agent => agent.id === id); }
  searchAgents(query: string): AgentDefinition[] {
    const needle = query.trim().toLowerCase();
    return this.agents.filter(agent => !needle || `${agent.name} ${agent.description}`.toLowerCase().includes(needle));
  }
  setBuiltinAgentNames(): void {}
  async load(agent: AgentDefinition): Promise<AgentDefinition | null> {
    await this.loadAgents();
    return this.agents.find(candidate => candidate.name === agent.name) ?? null;
  }
  async save(agent: AgentDefinition): Promise<void> {
    await this.rpc.request('agents.save', {
      content: serializeAgent(agent, this.providerId),
      name: agent.name,
      provider: this.providerId,
    });
    await this.loadAgents();
  }
  async delete(agent: AgentDefinition): Promise<void> {
    await this.rpc.request('agents.delete', { name: agent.name, provider: this.providerId });
    await this.loadAgents();
  }
  private async readDiscoveredAgent(agent: DiscoveredAgent): Promise<AgentDefinition> {
    try {
      const content = await this.rpc.request<string>('fs.readText', { path: agent.path });
      return parseAgent(content, agent);
    } catch {
      return { description: '', filePath: agent.path, id: agent.id, name: agent.name, prompt: '', source: 'vault' };
    }
  }
}

function createBridgeSettingsRenderer(
  rpc: WebSocketRpcClient,
  providerId: Exclude<ProviderId, 'typora'>,
  agents: BridgeAgentManager,
  mcpStorage: BridgeMcpStorage,
): ProviderSettingsTabRenderer {
  return {
    render(container, context): void {
      const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
      const settings = new SettingBuilder(container);
      const provider = readCliProviderSettings(settingsBag, providerId);
      settings.heading(t('settings.setup'));
      settings.toggle(
        ProviderRegistry.getProviderDisplayName(providerId),
        provider.enabled,
        async enabled => {
          setSingleEnabledCliProvider(settingsBag, providerId, enabled);
          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        },
        'Enable this provider in TyporAi.',
      );
      const cliInput = settings.text(
        t('settings.cliPath.name'),
        provider.cliPath,
        value => { updateCliProviderSettings(settingsBag, providerId, { cliPath: value.trim() }); },
        t('settings.cliPath.desc'),
      );
      cliInput.placeholder = providerId;
      cliInput.addEventListener('blur', () => { void context.plugin.saveSettings(); });

      renderProviderSpecificOptions(settings, settingsBag, providerId, async () => {
        await context.plugin.saveSettings();
        context.refreshModelSelectors();
      });

      renderEnvironmentSettingsSection({
        container,
        desc: providerId === 'claude'
          ? t('settings.claude.customVariables.desc')
          : providerId === 'codex' ? t('settings.codex.env.desc') : 'Environment variables passed to OpenCode.',
        heading: t('settings.environment'),
        name: providerId === 'claude'
          ? t('settings.customVariables.name')
          : providerId === 'codex' ? t('settings.codex.env.name') : 'Environment variables',
        placeholder: 'KEY=value',
        plugin: context.plugin,
        renderCustomContextLimits: target => context.renderCustomContextLimits(target, providerId),
        scope: `provider:${providerId}`,
      });

      context.renderHiddenProviderCommandSetting(container, providerId, {
        desc: 'Commands hidden from the composer menu.',
        name: 'Hidden commands',
        placeholder: 'command-name',
      });

      settings.heading(t('settings.subagents.name'));
      const agentsContainer = container.createDiv({ cls: 'typorai-agents-container' });
      new AgentSettings(agentsContainer, { agentManager: agents, agentStorage: agents });

      if (providerId === 'claude') {
        settings.heading(t('settings.mcpServers.name'));
        const mcpContainer = container.createDiv({ cls: 'typorai-mcp-container' });
        new McpSettingsManager(mcpContainer, {
          broadcastMcpReload: async () => {
            for (const view of context.plugin.getAllViews()) {
              await view.getTabManager()?.broadcastToProviderTabs?.('claude', service => service.reloadMcpServers());
            }
          },
          mcpStorage,
          testServer: async server => await rpc.request('mcp.test', { name: server.name }),
        });
      }
    },
  };
}

function readCliProviderSettings(settings: Record<string, unknown>, providerId: Exclude<ProviderId, 'typora'>): { cliPath: string; enabled: boolean } {
  if (providerId === 'claude') return getClaudeProviderSettings(settings);
  if (providerId === 'codex') return getCodexProviderSettings(settings);
  return getOpencodeProviderSettings(settings);
}

function updateCliProviderSettings(settings: Record<string, unknown>, providerId: Exclude<ProviderId, 'typora'>, updates: { cliPath: string }): void {
  if (providerId === 'claude') updateClaudeProviderSettings(settings, updates);
  else if (providerId === 'codex') updateCodexProviderSettings(settings, updates);
  else updateOpencodeProviderSettings(settings, updates);
}

function renderProviderSpecificOptions(
  settings: SettingBuilder,
  settingsBag: Record<string, unknown>,
  providerId: Exclude<ProviderId, 'typora'>,
  save: () => Promise<void>,
): void {
  if (providerId === 'claude') {
    const provider = getClaudeProviderSettings(settingsBag);
    settings.heading(t('settings.safety'));
    settings.select(
      t('settings.claudeSafeMode.name'),
      provider.safeMode,
      CLAUDE_SAFE_MODES.map(value => ({ value, label: value })),
      async value => { updateClaudeProviderSettings(settingsBag, { safeMode: value as typeof provider.safeMode }); await save(); },
      t('settings.claudeSafeMode.desc'),
    );
    settings.toggle(
      t('settings.loadUserSettings.name'), provider.loadUserSettings,
      async value => { updateClaudeProviderSettings(settingsBag, { loadUserSettings: value }); await save(); },
      t('settings.loadUserSettings.desc'),
    );
    settings.heading(t('settings.models'));
    const models = settings.textarea(
      t('settings.customModels.name'), provider.customModels,
      value => updateClaudeProviderSettings(settingsBag, { customModels: value }),
      t('settings.customModels.desc'),
    );
    models.placeholder = t('settings.customModels.placeholder');
    models.addEventListener('blur', () => { void save(); });
    settings.toggle(
      t('settings.enableOpus1M.name'), provider.enableOpus1M,
      async value => { updateClaudeProviderSettings(settingsBag, { enableOpus1M: value }); await save(); },
      t('settings.enableOpus1M.desc'),
    );
    settings.toggle(
      t('settings.enableSonnet1M.name'), provider.enableSonnet1M,
      async value => { updateClaudeProviderSettings(settingsBag, { enableSonnet1M: value }); await save(); },
      t('settings.enableSonnet1M.desc'),
    );
    settings.heading(t('settings.experimental'));
    settings.toggle(
      t('settings.enableChrome.name'), provider.enableChrome,
      async value => { updateClaudeProviderSettings(settingsBag, { enableChrome: value }); await save(); },
      t('settings.enableChrome.desc'),
    );
    settings.toggle(
      t('settings.enableBangBash.name'), provider.enableBangBash,
      async value => { updateClaudeProviderSettings(settingsBag, { enableBangBash: value }); await save(); },
      t('settings.enableBangBash.desc'),
    );
    return;
  }

  if (providerId === 'codex') {
    const provider = getCodexProviderSettings(settingsBag);
    settings.heading(t('settings.safety'));
    settings.select(
      t('settings.codexSafeMode.name'), provider.safeMode,
      [
        { value: 'workspace-write', label: t('settings.codex.safeMode.workspaceWrite') },
        { value: 'read-only', label: t('settings.codex.safeMode.readOnly') },
      ],
      async value => { updateCodexProviderSettings(settingsBag, { safeMode: value as typeof provider.safeMode }); await save(); },
      t('settings.codexSafeMode.desc'),
    );
    settings.heading(t('settings.models'));
    const models = settings.textarea(
      t('settings.customModels.name'), provider.customModels,
      value => updateCodexProviderSettings(settingsBag, { customModels: value }),
      t('settings.customModels.desc'),
    );
    models.placeholder = t('settings.codex.customModels.placeholder');
    models.addEventListener('blur', () => { void save(); });
    settings.select(
      t('settings.codex.reasoningSummary.name'), provider.reasoningSummary,
      (['auto', 'concise', 'detailed', 'none'] as const).map(value => ({
        value,
        label: t(`settings.codex.reasoningSummary.${value}`),
      })),
      async value => { updateCodexProviderSettings(settingsBag, { reasoningSummary: value as typeof provider.reasoningSummary }); await save(); },
      t('settings.codex.reasoningSummary.desc'),
    );
    return;
  }

  const provider = getOpencodeProviderSettings(settingsBag);
  settings.heading(t('settings.opencode.models.heading'));
  const visibleModels = settings.textarea(
    t('settings.opencode.models.visible.name'),
    provider.visibleModels.join('\n'),
    value => updateOpencodeProviderSettings(settingsBag, {
      visibleModels: value.split(/\r?\n|,/).map(model => model.trim()).filter(Boolean),
    }),
    t('settings.opencode.models.visible.desc'),
  );
  visibleModels.placeholder = provider.discoveredModels.map(model => model.rawId).slice(0, 4).join('\n');
  visibleModels.addEventListener('blur', () => { void save(); });
}

function skillBelongsToProvider(skill: DiscoveredSkill, providerId: ProviderId): boolean {
  if (providerId === 'claude') return skill.id.startsWith('.claude/');
  if (providerId === 'codex') return skill.id.startsWith('.codex/') || skill.id.startsWith('.agents/');
  return providerId === 'opencode' && skill.id.startsWith('.agents/');
}

function slashCommandEntry(command: SlashCommand, providerId: ProviderId): ProviderCommandEntry {
  const codexSkill = providerId === 'codex' && command.kind === 'skill';
  return {
    content: command.content,
    description: command.description,
    displayPrefix: codexSkill ? '$' : '/',
    id: command.id,
    insertPrefix: codexSkill ? '$' : '/',
    isDeletable: false,
    isEditable: false,
    kind: command.kind ?? 'command',
    name: command.name,
    providerId,
    scope: command.source === 'builtin' ? 'builtin' : 'runtime',
    source: command.source ?? 'sdk',
  };
}

function parseAgent(content: string, discovered: DiscoveredAgent): AgentDefinition {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const values: Record<string, string> = {};
  for (const line of frontmatter?.[1].split(/\r?\n/) ?? []) {
    const separator = line.indexOf(':');
    if (separator > 0) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  const toml = (key: string): string | undefined => content.match(new RegExp(`^${key}\\s*=\\s*["']([^"']*)["']`, 'm'))?.[1];
  const prompt = frontmatter
    ? content.slice(frontmatter[0].length).trim()
    : content.match(/developer_instructions\s*=\s*"""([\s\S]*?)"""/m)?.[1]?.trim() ?? '';
  return {
    description: values.description ?? toml('description') ?? '',
    filePath: discovered.path,
    id: discovered.id,
    name: values.name ?? toml('name') ?? discovered.name,
    prompt,
    source: 'vault',
  };
}

function serializeAgent(agent: AgentDefinition, providerId: Exclude<ProviderId, 'typora'>): string {
  if (providerId === 'codex') {
    return `name = ${JSON.stringify(agent.name)}\ndescription = ${JSON.stringify(agent.description)}\ndeveloper_instructions = """\n${agent.prompt.replace(/"""/g, '\\"\\"\\"')}\n"""\n`;
  }
  const lines = ['---', `name: ${JSON.stringify(agent.name)}`, `description: ${JSON.stringify(agent.description)}`];
  if (agent.model && agent.model !== 'inherit') lines.push(`model: ${agent.model}`);
  if (agent.tools?.length) lines.push(`tools: ${agent.tools.join(', ')}`);
  if (agent.disallowedTools?.length) lines.push(`disallowedTools: ${agent.disallowedTools.join(', ')}`);
  if (agent.skills?.length) lines.push(`skills: ${agent.skills.join(', ')}`);
  lines.push('---', agent.prompt, '');
  return lines.join('\n');
}
