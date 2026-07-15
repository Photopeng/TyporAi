import type { HotkeyAdapter } from '@/adapters/hotkey';
import {
  type ConversationCommandHost,
  registerConversationCommands,
} from '@/bootstrap/conversationCommands';
import { CommandRegistry } from '@/core/CommandRegistry';

describe('registerConversationCommands', () => {
  function createHost(): jest.Mocked<ConversationCommandHost> {
    return {
      cancelActiveStreaming: jest.fn(),
      closeTab: jest.fn().mockResolvedValue(undefined),
      createNewConversationInActiveTab: jest.fn().mockResolvedValue(undefined),
      createNewTab: jest.fn().mockResolvedValue(undefined),
      focusActiveInput: jest.fn(),
      openHistoryConversation: jest.fn().mockResolvedValue(undefined),
      openHistoryConversationInNewTab: jest.fn().mockResolvedValue(undefined),
      sendActiveInputMessage: jest.fn().mockResolvedValue(undefined),
      switchToTab: jest.fn(),
      toggleHistoryDropdown: jest.fn(),
    };
  }

  it('registers conversation commands against the shared command registry', async () => {
    const commandRegistry = new CommandRegistry();
    const host = createHost();

    registerConversationCommands({ commandRegistry, hotkey: null }, host);

    expect(commandRegistry.list().map(command => command.id)).toEqual([
      'conversation.send',
      'conversation.cancel',
      'conversation.new',
      'conversation.new-tab',
      'conversation.focus-input',
      'conversation.toggle-history',
      'conversation.open-history',
      'conversation.open-history-new-tab',
      'tab.switch',
      'tab.close',
    ]);

    await commandRegistry.execute('conversation.send');
    await commandRegistry.execute('conversation.cancel');
    await commandRegistry.execute('conversation.new');
    await commandRegistry.execute('conversation.new-tab');
    await commandRegistry.execute('conversation.focus-input');
    await commandRegistry.execute('conversation.toggle-history');
    await commandRegistry.execute('conversation.open-history', 'conv-1');
    await commandRegistry.execute('conversation.open-history-new-tab', {
      activate: false,
      conversationId: 'conv-2',
    });
    await commandRegistry.execute('tab.switch', 'tab-1');
    await commandRegistry.execute('tab.close', 'tab-2');

    expect(host.sendActiveInputMessage).toHaveBeenCalledTimes(1);
    expect(host.cancelActiveStreaming).toHaveBeenCalledTimes(1);
    expect(host.createNewConversationInActiveTab).toHaveBeenCalledTimes(1);
    expect(host.createNewTab).toHaveBeenCalledTimes(1);
    expect(host.focusActiveInput).toHaveBeenCalledTimes(1);
    expect(host.toggleHistoryDropdown).toHaveBeenCalledTimes(1);
    expect(host.openHistoryConversation).toHaveBeenCalledWith('conv-1');
    expect(host.openHistoryConversationInNewTab).toHaveBeenCalledWith('conv-2', false);
    expect(host.switchToTab).toHaveBeenCalledWith('tab-1');
    expect(host.closeTab).toHaveBeenCalledWith('tab-2');
  });

  it('wires panel hotkeys to command execution', () => {
    const commandRegistry = new CommandRegistry();
    const host = createHost();
    const hotkey: jest.Mocked<HotkeyAdapter> = {
      register: jest.fn().mockReturnValue('hotkey-id'),
      unregister: jest.fn(),
      unregisterAll: jest.fn(),
    };

    registerConversationCommands({ commandRegistry, hotkey }, host);

    expect(hotkey.register).toHaveBeenCalledWith('panel', 'Ctrl+Enter', expect.any(Function));
    expect(hotkey.register).toHaveBeenCalledWith('panel', 'Escape', expect.any(Function));
  });
});
