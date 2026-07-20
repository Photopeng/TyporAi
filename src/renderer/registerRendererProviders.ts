import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type {
  ProviderConversationHistoryService,
  ProviderId,
  ProviderRegistration,
  ProviderTaskResultInterpreter,
  ProviderTaskTerminalStatus,
} from '@/core/providers/types';
import type { Conversation } from '@/core/types';
import { CLAUDE_PROVIDER_CAPABILITIES } from '@/providers/claude/capabilities';
import { claudeSettingsReconciler } from '@/providers/claude/env/ClaudeSettingsReconciler';
import { getClaudeProviderSettings } from '@/providers/claude/settings';
import { claudeChatUIConfig } from '@/providers/claude/ui/ClaudeChatUIConfig';
import { CODEX_PROVIDER_CAPABILITIES } from '@/providers/codex/capabilities';
import { codexSettingsReconciler } from '@/providers/codex/env/CodexSettingsReconciler';
import { getCodexProviderSettings } from '@/providers/codex/settings';
import { codexChatUIConfig } from '@/providers/codex/ui/CodexChatUIConfig';
import { OPENCODE_PROVIDER_CAPABILITIES } from '@/providers/opencode/capabilities';
import { opencodeSettingsReconciler } from '@/providers/opencode/env/OpencodeSettingsReconciler';
import { getOpencodeProviderSettings } from '@/providers/opencode/settings';
import { opencodeChatUIConfig } from '@/providers/opencode/ui/OpencodeChatUIConfig';
import { TYPORA_PROVIDER_CAPABILITIES } from '@/providers/typora/capabilities';
import { typoraSettingsReconciler } from '@/providers/typora/env/TyporaSettingsReconciler';
import { getTyporaProviderSettings } from '@/providers/typora/settings';
import { typoraChatUIConfig } from '@/providers/typora/ui/TyporaChatUIConfig';

export function registerRendererProviders(): void {
  register('claude', {
    blankTabOrder: 20,
    capabilities: rendererCapabilities(CLAUDE_PROVIDER_CAPABILITIES),
    chatUIConfig: claudeChatUIConfig,
    displayNameKey: 'provider.claude',
    isEnabled: settings => getClaudeProviderSettings(settings).enabled,
    settingsReconciler: claudeSettingsReconciler,
  });
  register('codex', {
    blankTabOrder: 15,
    capabilities: rendererCapabilities(CODEX_PROVIDER_CAPABILITIES),
    chatUIConfig: codexChatUIConfig,
    displayNameKey: 'provider.codex',
    isEnabled: settings => getCodexProviderSettings(settings).enabled,
    settingsReconciler: codexSettingsReconciler,
  });
  register('opencode', {
    blankTabOrder: 10,
    capabilities: rendererCapabilities(OPENCODE_PROVIDER_CAPABILITIES),
    chatUIConfig: opencodeChatUIConfig,
    displayNameKey: 'provider.opencode',
    isEnabled: settings => getOpencodeProviderSettings(settings).enabled,
    settingsReconciler: opencodeSettingsReconciler,
  });
  register('typora', {
    blankTabOrder: 0,
    capabilities: rendererCapabilities(TYPORA_PROVIDER_CAPABILITIES),
    chatUIConfig: typoraChatUIConfig,
    displayNameKey: 'provider.typora',
    isEnabled: settings => getTyporaProviderSettings(settings).enabled,
    settingsReconciler: typoraSettingsReconciler,
  });
}

type RendererRegistration = Pick<
  ProviderRegistration,
  'blankTabOrder' | 'capabilities' | 'chatUIConfig' | 'displayNameKey' | 'isEnabled' | 'settingsReconciler'
>;

function register(providerId: ProviderId, registration: RendererRegistration): void {
  ProviderRegistry.register(providerId, {
    ...registration,
    createRuntime: () => unavailable('chat runtime'),
    createTitleGenerationService: () => unavailable('title generation'),
    createInstructionRefineService: () => unavailable('instruction refinement'),
    createInlineEditService: () => unavailable('inline editing'),
    historyService: history,
    taskResultInterpreter: taskResults,
  });
}

function rendererCapabilities(
  capabilities: ProviderRegistration['capabilities'],
): ProviderRegistration['capabilities'] {
  // Browser renderers persist their provider-neutral transcript through the
  // shared TyporAi storage layer. Native provider session ids remain opaque
  // Sidecar state and are used only to resume execution.
  return Object.freeze({ ...capabilities, supportsNativeHistory: false, supportsRewind: false });
}

function unavailable(capability: string): never {
  throw new Error(`Renderer ${capability} must be supplied by the Sidecar host.`);
}

class RendererConversationHistoryService implements ProviderConversationHistoryService {
  async hydrateConversationHistory(): Promise<void> {}
  async deleteConversationSession(): Promise<void> {}

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? readForkSource(conversation?.providerState)?.sessionId ?? null;
  }

  isPendingForkConversation(conversation: Conversation): boolean {
    return Boolean(readForkSource(conversation.providerState) && !conversation.sessionId);
  }

  buildForkProviderState(sourceSessionId: string, resumeAt: string): Record<string, unknown> {
    return { forkSource: { resumeAt, sessionId: sourceSessionId } };
  }

  buildPersistedProviderState(conversation: Conversation): Record<string, unknown> | undefined {
    return conversation.providerState;
  }
}

class RendererTaskResultInterpreter implements ProviderTaskResultInterpreter {
  hasAsyncLaunchMarker(value: unknown): boolean {
    return isRecord(value) && (value.isAsync === true || value.status === 'async_launched');
  }

  extractAgentId(value: unknown): string | null {
    if (!isRecord(value)) return null;
    const candidate = value.agentId ?? value.agent_id;
    return typeof candidate === 'string' ? candidate : null;
  }

  extractStructuredResult(value: unknown): string | null {
    if (!isRecord(value)) return null;
    for (const candidate of [value.result, value.output]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return null;
  }

  resolveTerminalStatus(
    value: unknown,
    fallbackStatus: ProviderTaskTerminalStatus,
  ): ProviderTaskTerminalStatus {
    if (isRecord(value) && (value.status === 'error' || value.error)) return 'error';
    return fallbackStatus;
  }

  extractTagValue(payload: string, tagName: string): string | null {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return payload.match(new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, 'i'))?.[1]?.trim() ?? null;
  }
}

const history = new RendererConversationHistoryService();
const taskResults = new RendererTaskResultInterpreter();

function readForkSource(value: Record<string, unknown> | undefined): { resumeAt: string; sessionId: string } | null {
  const source = value?.forkSource;
  if (!isRecord(source) || typeof source.resumeAt !== 'string' || typeof source.sessionId !== 'string') return null;
  return { resumeAt: source.resumeAt, sessionId: source.sessionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
