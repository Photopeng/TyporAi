import type { ProviderCapabilities, ProviderId } from '@/core/providers/types';

export interface RendererProviderDescriptor {
  readonly capabilities: Readonly<ProviderCapabilities>;
  readonly displayNameKey: string;
  readonly providerId: ProviderId;
}

const descriptor = (providerId: ProviderId, displayNameKey: string, capabilities: Omit<ProviderCapabilities, 'providerId'>): RendererProviderDescriptor => ({ capabilities: Object.freeze({ providerId, ...capabilities }), displayNameKey, providerId });

export const RENDERER_PROVIDERS: readonly RendererProviderDescriptor[] = Object.freeze([
  descriptor('claude', 'provider.claude', { reasoningControl: 'effort', planPathPrefix: '/.claude/plans/', supportsFork: true, supportsImageAttachments: true, supportsInstructionMode: true, supportsMcpRuntime: true, supportsInAppMcpManagement: true, supportsMcpTools: true, supportsNativeHistory: true, supportsPersistentRuntime: true, supportsPlanMode: true, supportsProviderCommands: true, supportsRewind: false, supportsTurnSteer: false }),
  descriptor('codex', 'provider.codex', { reasoningControl: 'effort', supportsFork: true, supportsImageAttachments: true, supportsInstructionMode: true, supportsMcpRuntime: false, supportsInAppMcpManagement: false, supportsMcpTools: false, supportsNativeHistory: true, supportsPersistentRuntime: true, supportsPlanMode: true, supportsProviderCommands: false, supportsRewind: false, supportsTurnSteer: true }),
  descriptor('opencode', 'provider.opencode', { reasoningControl: 'effort', supportsFork: false, supportsImageAttachments: true, supportsInstructionMode: true, supportsMcpRuntime: false, supportsInAppMcpManagement: false, supportsMcpTools: false, supportsNativeHistory: true, supportsPersistentRuntime: true, supportsPlanMode: true, supportsProviderCommands: true, supportsRewind: false, supportsTurnSteer: false }),
  descriptor('typora', 'provider.typora', { reasoningControl: 'effort', supportsFork: true, supportsImageAttachments: false, supportsInstructionMode: true, supportsMcpRuntime: false, supportsInAppMcpManagement: false, supportsMcpTools: false, supportsNativeHistory: false, supportsPersistentRuntime: false, supportsPlanMode: false, supportsProviderCommands: false, supportsRewind: false, supportsTurnSteer: false }),
]);

export function getRendererProvider(providerId: ProviderId): RendererProviderDescriptor | null {
  return RENDERER_PROVIDERS.find(provider => provider.providerId === providerId) ?? null;
}
