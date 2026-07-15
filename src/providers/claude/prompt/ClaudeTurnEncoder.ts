import type { McpServerManager } from '../../../core/mcp/McpServerManager';
import type { ChatTurnRequest, PreparedChatTurn } from '../../../core/runtime/types';
import { appendPromptContext } from '../../../utils/context';

function isCompactCommand(text: string): boolean {
  return /^\/compact(\s|$)/i.test(text);
}

export function encodeClaudeTurn(
  request: ChatTurnRequest,
  mcpManager: Pick<McpServerManager, 'extractMentions' | 'transformMentions'>,
): PreparedChatTurn {
  const isCompact = isCompactCommand(request.text);

  const persistedContent = isCompact
    ? request.text
    : appendPromptContext(request.text, request);

  const mcpMentions = mcpManager.extractMentions(persistedContent);

  return {
    request,
    persistedContent,
    prompt: mcpManager.transformMentions(persistedContent),
    isCompact,
    mcpMentions,
  };
}
