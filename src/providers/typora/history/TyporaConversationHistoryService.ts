import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';

export class TyporaConversationHistoryService implements ProviderConversationHistoryService {
  async hydrateConversationHistory(): Promise<void> {
    // Typora engine conversations are stored in TyporAi's provider-neutral history.
  }

  async deleteConversationSession(): Promise<void> {
    // There is no provider-native transcript to delete.
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    const forkSource = getForkSource(conversation?.providerState);
    return conversation?.sessionId ?? forkSource?.sessionId ?? null;
  }

  isPendingForkConversation(): boolean {
    return false;
  }

  buildForkProviderState(sourceSessionId: string, resumeAt: string): Record<string, unknown> {
    return { forkSource: { sessionId: sourceSessionId, resumeAt } };
  }

  buildPersistedProviderState(conversation: Conversation): Record<string, unknown> | undefined {
    return conversation.providerState;
  }
}

function getForkSource(providerState: Record<string, unknown> | undefined): {
  resumeAt: string;
  sessionId: string;
} | null {
  const forkSource = providerState?.forkSource;
  if (!forkSource || typeof forkSource !== 'object' || Array.isArray(forkSource)) {
    return null;
  }

  const candidate = forkSource as Record<string, unknown>;
  return typeof candidate.sessionId === 'string' && typeof candidate.resumeAt === 'string'
    ? { sessionId: candidate.sessionId, resumeAt: candidate.resumeAt }
    : null;
}
