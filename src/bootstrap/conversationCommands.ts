import type { HotkeyAdapter } from '../adapters/hotkey';
import type { CommandRegistry } from '../core/CommandRegistry';

export interface ConversationCommandHost {
  cancelActiveStreaming(): void;
  closeTab(tabId: string): Promise<void>;
  createNewConversationInActiveTab(): Promise<void>;
  createNewTab(): Promise<void>;
  focusActiveInput(): void;
  openHistoryConversation(conversationId: string): Promise<void>;
  openHistoryConversationInNewTab(conversationId: string, activate?: boolean): Promise<void>;
  sendActiveInputMessage(): Promise<void>;
  switchToTab(tabId: string): void;
  toggleHistoryDropdown(): void;
}

export interface ConversationCommandRuntime {
  commandRegistry: CommandRegistry;
  hotkey: HotkeyAdapter | null;
}

export function registerConversationCommands(
  runtime: ConversationCommandRuntime,
  host: ConversationCommandHost,
): void {
  runtime.commandRegistry.register(
    'conversation.send',
    'Send active conversation message',
    () => host.sendActiveInputMessage(),
  );
  runtime.commandRegistry.register(
    'conversation.cancel',
    'Cancel active conversation stream',
    () => host.cancelActiveStreaming(),
  );
  runtime.commandRegistry.register(
    'conversation.new',
    'New conversation in active tab',
    () => host.createNewConversationInActiveTab(),
  );
  runtime.commandRegistry.register(
    'conversation.new-tab',
    'New conversation tab',
    () => host.createNewTab(),
  );
  runtime.commandRegistry.register(
    'conversation.focus-input',
    'Focus active conversation input',
    () => host.focusActiveInput(),
  );
  runtime.commandRegistry.register(
    'conversation.toggle-history',
    'Toggle conversation history',
    () => host.toggleHistoryDropdown(),
  );
  runtime.commandRegistry.register(
    'conversation.open-history',
    'Open conversation from history',
    (conversationId) => {
      if (typeof conversationId === 'string') {
        return host.openHistoryConversation(conversationId);
      }
    },
  );
  runtime.commandRegistry.register(
    'conversation.open-history-new-tab',
    'Open conversation from history in new tab',
    (payload) => {
      if (typeof payload === 'string') {
        return host.openHistoryConversationInNewTab(payload);
      }
      if (payload && typeof payload === 'object' && 'conversationId' in payload) {
        const request = payload as { activate?: boolean; conversationId?: unknown };
        if (typeof request.conversationId === 'string') {
          return host.openHistoryConversationInNewTab(request.conversationId, request.activate);
        }
      }
    },
  );
  runtime.commandRegistry.register(
    'tab.switch',
    'Switch conversation tab',
    (tabId) => {
      if (typeof tabId === 'string') {
        host.switchToTab(tabId);
      }
    },
  );
  runtime.commandRegistry.register(
    'tab.close',
    'Close conversation tab',
    (tabId) => {
      if (typeof tabId === 'string') {
        return host.closeTab(tabId);
      }
    },
  );

  runtime.hotkey?.register('panel', 'Mod+Enter', (event) => {
    event.preventDefault();
    void runtime.commandRegistry.execute('conversation.send');
  });
  runtime.hotkey?.register('panel', 'Escape', (event) => {
    event.preventDefault();
    void runtime.commandRegistry.execute('conversation.cancel');
  });
}
