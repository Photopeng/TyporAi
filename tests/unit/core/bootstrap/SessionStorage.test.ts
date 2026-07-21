import '@/providers';

import {
  getProviderNeutralMessagesFromMetadata,
  SessionStorage,
} from '@/core/bootstrap/SessionStorage';
import type { Conversation } from '@/core/types';

describe('SessionStorage provider-neutral metadata', () => {
  it('persists visible messages for providers without native history', () => {
    const storage = new SessionStorage({} as any);
    const conversation: Conversation = {
      id: 'conv-typora',
      providerId: 'typora',
      title: 'Typora tools',
      createdAt: 1,
      updatedAt: 2,
      sessionId: 'typora-session-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Read the current document',
          timestamp: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Done.',
          timestamp: 2,
          toolCalls: [{
            id: 'tool-1',
            input: {},
            name: 'get_current_document',
            result: '{"content":"note"}',
            status: 'completed',
            isExpanded: false,
          }],
          contentBlocks: [{ type: 'tool_use', toolId: 'tool-1' }, { type: 'text', content: 'Done.' }],
        },
      ],
    };

    expect(storage.toSessionMetadata(conversation).messages).toEqual(conversation.messages);
    expect(storage.toSessionMetadata(conversation).schemaVersion).toBe(1);
  });

  it('does not duplicate messages for providers with native history', () => {
    const storage = new SessionStorage({} as any);
    const conversation: Conversation = {
      id: 'conv-claude',
      providerId: 'claude',
      title: 'Claude native',
      createdAt: 1,
      updatedAt: 2,
      sessionId: 'claude-session-1',
      messages: [{
        id: 'assistant-1',
        role: 'assistant',
        content: 'Native transcript owns this.',
        timestamp: 2,
      }],
    };

    expect(storage.toSessionMetadata(conversation).messages).toBeUndefined();
  });

  it('restores provider-neutral messages only for providers without native history', () => {
    const messages: Conversation['messages'] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: 'Restored with tools',
      timestamp: 2,
      toolCalls: [{
        id: 'tool-1',
        input: {},
        name: 'get_current_document',
        result: 'ok',
        status: 'completed',
        isExpanded: false,
      }],
    }];

    expect(getProviderNeutralMessagesFromMetadata({
      id: 'typora-meta',
      providerId: 'typora',
      title: 'Typora',
      createdAt: 1,
      updatedAt: 2,
      messages,
    })).toEqual(messages);
    expect(getProviderNeutralMessagesFromMetadata({
      id: 'claude-meta',
      providerId: 'claude',
      title: 'Claude',
      createdAt: 1,
      updatedAt: 2,
      messages,
    })).toEqual([]);
  });
});
