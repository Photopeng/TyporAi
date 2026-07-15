import type { ChatTurnRequest, PreparedChatTurn } from '../../../core/runtime/types';
import { appendPromptContext } from '../../../utils/context';

function isCompactCommand(text: string): boolean {
  return /^\/compact(\s|$)/i.test(text);
}

export function encodeCodexTurn(request: ChatTurnRequest): PreparedChatTurn {
  const isCompact = isCompactCommand(request.text);

  if (isCompact) {
    return {
      request,
      persistedContent: request.text,
      prompt: request.text,
      isCompact: true,
      mcpMentions: new Set(),
    };
  }

  const prompt = appendPromptContext(request.text, request);

  return {
    request,
    persistedContent: prompt,
    prompt,
    isCompact: false,
    mcpMentions: new Set(),
  };
}
