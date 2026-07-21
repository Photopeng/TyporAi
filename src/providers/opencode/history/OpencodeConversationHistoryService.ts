import type { FileProbe, ProcessTransportFactory } from '../../../core/ports';
import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { Conversation, ForkSource } from '../../../core/types';
import { getOpencodeState, type OpencodeProviderState } from '../types';
import {
  isOpencodeSessionHydrationDiagnosticMessage,
  loadOpencodeSessionMessages,
} from './OpencodeHistoryStore';

export class OpencodeConversationHistoryService implements ProviderConversationHistoryService {
  private hydratedKeys = new Map<string, string>();
  private processTransport: ProcessTransportFactory | undefined;
  private fileProbe: FileProbe | undefined;

  setProcessTransport(processTransport: ProcessTransportFactory | undefined): void {
    this.processTransport = processTransport;
  }

  setFileProbe(fileProbe: FileProbe | undefined): void {
    this.fileProbe = fileProbe;
  }

  async hydrateConversationHistory(
    conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    const sessionId = conversation.sessionId;
    if (!sessionId) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    const state = getOpencodeState(conversation.providerState);
    const hydrationKey = `${sessionId}::${state.databasePath ?? ''}`;
    if (
      conversation.messages.length > 0
      && this.hydratedKeys.get(conversation.id) === hydrationKey
    ) {
      return;
    }

    const messages = await loadOpencodeSessionMessages(sessionId, state, {
      processTransport: this.processTransport,
      fileProbe: this.fileProbe,
    });
    if (messages.length === 0) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    conversation.messages = messages;
    if (
      messages.length === 1
      && isOpencodeSessionHydrationDiagnosticMessage(messages[0])
    ) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    this.hydratedKeys.set(conversation.id, hydrationKey);
  }

  async deleteConversationSession(
    _conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    // Never mutate OpenCode native history.
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? null;
  }

  isPendingForkConversation(conversation: Conversation): boolean {
    const state = getOpencodeState(conversation.providerState);
    return !!state.forkSource && !conversation.sessionId;
  }

  buildForkProviderState(
    sourceSessionId: string,
    resumeAt: string,
    sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    const source = getOpencodeState(sourceProviderState);
    const providerState: OpencodeProviderState = {
      ...(source.databasePath ? { databasePath: source.databasePath } : {}),
      forkSource: { sessionId: sourceSessionId, resumeAt } satisfies ForkSource,
    };
    return providerState as Record<string, unknown>;
  }

  buildPersistedProviderState(
    conversation: Conversation,
  ): Record<string, unknown> | undefined {
    const state = getOpencodeState(conversation.providerState);
    const providerState: OpencodeProviderState = {
      ...(state.databasePath ? { databasePath: state.databasePath } : {}),
      ...(this.isPendingForkConversation(conversation) && state.forkSource
        ? { forkSource: state.forkSource }
        : {}),
    };

    return Object.keys(providerState).length > 0
      ? providerState as Record<string, unknown>
      : undefined;
  }
}

export const opencodeConversationHistoryService = new OpencodeConversationHistoryService();
