import type { Conversation } from '@/core/types';
import { TyporaConversationHistoryService } from '@/providers/typora/history/TyporaConversationHistoryService';

describe('TyporaConversationHistoryService', () => {
  it('uses provider-neutral session ids for resume', () => {
    const service = new TyporaConversationHistoryService();

    expect(service.resolveSessionIdForConversation(createConversation({
      sessionId: 'typora-session-1',
    }))).toBe('typora-session-1');
  });

  it('resolves fork source sessions for pending fork conversations', () => {
    const service = new TyporaConversationHistoryService();
    const providerState = service.buildForkProviderState('source-session', 'assistant-1');

    expect(providerState).toEqual({
      forkSource: {
        resumeAt: 'assistant-1',
        sessionId: 'source-session',
      },
    });
    expect(service.resolveSessionIdForConversation(createConversation({
      providerState,
      sessionId: null,
    }))).toBe('source-session');
  });

  it('persists provider state unchanged because TyporAi owns Typora history', () => {
    const service = new TyporaConversationHistoryService();
    const conversation = createConversation({
      providerState: { forkSource: { resumeAt: 'assistant-1', sessionId: 'source-session' } },
    });

    expect(service.buildPersistedProviderState(conversation)).toBe(conversation.providerState);
  });
});

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    createdAt: 1,
    id: 'conv-1',
    messages: [],
    providerId: 'typora',
    sessionId: null,
    title: 'Typora conversation',
    updatedAt: 1,
    ...overrides,
  };
}
