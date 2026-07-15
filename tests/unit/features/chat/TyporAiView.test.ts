import { createMockEl } from '@test/helpers/mockElement';

import { CommandRegistry } from '@/core/CommandRegistry';
import { TyporAiView } from '@/features/chat/TyporAiView';
import { setLocale } from '@/i18n/i18n';
import { Platform, Scope } from '@/typora/platform';

function createViewHarness(options: {
  canCreateTab: boolean;
  tabCount?: number;
}): {
  newTabButtonEl: ReturnType<typeof createMockEl>;
  view: any;
} {
  const newTabButtonEl = createMockEl();
  const view = Object.create(TyporAiView.prototype) as any;

  view.plugin = {
    settings: {},
  };
  view.tabManager = {
    canCreateTab: jest.fn().mockReturnValue(options.canCreateTab),
    getTabCount: jest.fn().mockReturnValue(options.tabCount ?? 1),
  };
  view.tabBarContainerEl = createMockEl();
  view.logoEl = createMockEl();
  view.newTabButtonEl = newTabButtonEl;

  return { newTabButtonEl, view };
}

describe('TyporAiView tab controls', () => {

  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    setLocale('en');
  });

  it('hides the new-tab button when the tab manager is at capacity', () => {
    const { newTabButtonEl, view } = createViewHarness({ canCreateTab: false });

    view.refreshTabControls();

    expect(newTabButtonEl.hasClass('typorai-hidden')).toBe(true);
    expect(newTabButtonEl.getAttribute('aria-disabled')).toBe('true');
    expect(newTabButtonEl.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the new-tab button when another tab can be created', () => {
    const { newTabButtonEl, view } = createViewHarness({ canCreateTab: true });
    newTabButtonEl.addClass('typorai-hidden');
    newTabButtonEl.setAttribute('aria-disabled', 'true');
    newTabButtonEl.setAttribute('aria-hidden', 'true');

    view.refreshTabControls();

    expect(newTabButtonEl.hasClass('typorai-hidden')).toBe(false);
    expect(newTabButtonEl.getAttribute('aria-disabled')).toBeNull();
    expect(newTabButtonEl.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps tab controls in the header focus scope', () => {
    const tabBarContainerEl = createMockEl();
    const view = Object.create(TyporAiView.prototype) as any;

    view.tabBarContainerEl = tabBarContainerEl;

    expect(view.getSharedSelectionFocusScopeEls()).toEqual([tabBarContainerEl]);
  });

  it('builds header tabs between the title and action buttons', () => {
    const header = createMockEl();
    const view = Object.create(TyporAiView.prototype) as any;

    setLocale('zh-CN');
    view.buildHeader(header);

    expect(header.children[0].hasClass('typorai-title')).toBe(true);
    expect(header.children[0].tagName).toBe('BUTTON');
    expect(header.children[1].hasClass('typorai-header-tabs')).toBe(true);
    expect(header.children[2].hasClass('typorai-header-actions')).toBe(true);
    expect(view.tabBarContainerEl.hasClass('typorai-header-tab-bar-container')).toBe(true);
    expect(header.children[2].children[0].getAttribute('data-icon')).toBe('message-square-dot');
    expect(header.children[2].children[0].getAttribute('aria-label')).toBe('\u65b0\u5bf9\u8bdd');
    expect(header.children[2].children[0].getAttribute('data-typorai-tooltip')).toBe('\u65b0\u5bf9\u8bdd');
    expect(header.children[2].children[1].getAttribute('data-icon')).toBe('square-plus');
    expect(header.children[2].children[1].getAttribute('aria-label')).toBe('\u65b0\u6807\u7b7e\u9875');
    expect(header.children[2].children[1].getAttribute('data-typorai-tooltip')).toBe('\u65b0\u6807\u7b7e\u9875');
    expect(header.children[2].children[2].children[0].getAttribute('data-icon')).toBe('clock');
    expect(header.children[2].children[2].children[0].getAttribute('aria-label')).toBe('\u804a\u5929\u5386\u53f2');
    expect(header.children[2].children[2].children[0].getAttribute('data-typorai-tooltip')).toBe('\u804a\u5929\u5386\u53f2');
  });

  it('moves only the active tab input into the stable input slot', () => {
    const activeInputSlotEl = createMockEl();
    const tab1 = {
      id: 'tab-1',
      dom: {
        contentEl: createMockEl(),
        inputComposerEl: createMockEl(),
        inputContainerEl: createMockEl(),
      },
    };
    const tab2 = {
      id: 'tab-2',
      dom: {
        contentEl: createMockEl(),
        inputComposerEl: createMockEl(),
        inputContainerEl: createMockEl(),
      },
    };
    const view = Object.create(TyporAiView.prototype) as any;

    view.activeInputSlotEl = activeInputSlotEl;
    view.tabManager = {
      getActiveTab: jest.fn()
        .mockReturnValueOnce(tab1)
        .mockReturnValueOnce(tab2),
      getTab: jest.fn((id: string) => id === 'tab-1' ? tab1 : tab2),
    };

    view.updateInputLocation();
    view.updateInputLocation();

    expect(activeInputSlotEl.children).toContain(tab2.dom.inputComposerEl);
    expect(activeInputSlotEl.children).not.toContain(tab1.dom.inputComposerEl);
    expect(tab1.dom.contentEl.children).toContain(tab1.dom.inputComposerEl);
  });

  it('preserves active pending prompt siblings during same-tab input updates', () => {
    const activeInputSlotEl = createMockEl();
    const inputComposerEl = activeInputSlotEl.createDiv();
    const pendingPromptEl = inputComposerEl.createDiv({ cls: 'typorai-ask-question-inline' });
    const tab = {
      id: 'tab-1',
      dom: {
        contentEl: createMockEl(),
        inputComposerEl,
        inputContainerEl: inputComposerEl.createDiv({ cls: 'typorai-input-container' }),
      },
    };
    const view = Object.create(TyporAiView.prototype) as any;

    Object.defineProperty(inputComposerEl, 'parentElement', {
      configurable: true,
      get: () => activeInputSlotEl,
    });
    view.activeInputTabId = 'tab-1';
    view.activeInputSlotEl = activeInputSlotEl;
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue(tab),
      getTab: jest.fn().mockReturnValue(tab),
    };

    view.updateInputLocation();

    expect(activeInputSlotEl.children).toContain(inputComposerEl);
    expect(inputComposerEl.children).toContain(pendingPromptEl);
  });

  it('clears the stable input slot when no tab is active', () => {
    const activeInputSlotEl = createMockEl();
    const staleInputEl = activeInputSlotEl.createDiv();
    const view = Object.create(TyporAiView.prototype) as any;

    view.activeInputTabId = 'tab-1';
    view.activeInputSlotEl = activeInputSlotEl;
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue(null),
    };

    view.updateInputLocation();

    expect(activeInputSlotEl.children).not.toContain(staleInputEl);
    expect(view.activeInputTabId).toBeNull();
  });

  it('toggles the history dropdown when the history button is clicked', () => {
    const historyDropdown = createMockEl();
    const view = Object.create(TyporAiView.prototype) as any;

    view.historyDropdown = historyDropdown;
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue(null),
    };

    view.toggleHistoryDropdown();

    expect(historyDropdown.hasClass('visible')).toBe(true);

    view.toggleHistoryDropdown();

    expect(historyDropdown.hasClass('visible')).toBe(false);
  });

  it('refreshes cursor-flow copy with the rest of the active chat UI', () => {
    const view = Object.create(TyporAiView.prototype) as any;
    const updateDisplay = jest.fn();
    view.viewContainerEl = createMockEl();
    view.tabManager = {
      getAllTabs: jest.fn().mockReturnValue([{
        dom: { inputEl: { placeholder: '' } },
        ui: { cursorFlowToggle: { updateDisplay } },
      }]),
    };

    view.refreshLocalizedUI();

    expect(updateDisplay).toHaveBeenCalledTimes(1);
  });

  it('opens history directly from the header button even when a command registry is present', () => {
    const header = createMockEl();
    const view = Object.create(TyporAiView.prototype) as any;
    view.toggleHistoryDropdown = jest.fn();
    view.executeConversationCommand = jest.fn();

    view.buildHeader(header);
    const historyButton = header.children[2].children[2].children[0];
    historyButton.dispatchEvent({ stopPropagation: jest.fn(), type: 'click' });

    expect(view.toggleHistoryDropdown).toHaveBeenCalledTimes(1);
    expect(view.executeConversationCommand).not.toHaveBeenCalled();
  });

  it('dismisses the history dropdown when native focus leaves the history control', () => {
    const historyContainerEl = createMockEl();
    const insideTarget = historyContainerEl.createDiv();
    const historyDropdown = historyContainerEl.createDiv();
    const outsideTarget = createMockEl();
    const listeners = new Map<string, EventListener>();
    const ownerDocument = {
      hidden: false,
      defaultView: {
        addEventListener: jest.fn((type: string, listener: EventListener) => {
          listeners.set(`window:${type}`, listener);
        }),
        removeEventListener: jest.fn(),
      },
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: jest.fn(),
    };
    const eventRefs: unknown[] = [];
    const view = Object.create(TyporAiView.prototype) as any;

    historyDropdown.addClass('visible');
    view.app = { scope: new Scope() };
    view.containerEl = { ownerDocument };
    view.historyContainerEl = historyContainerEl;
    view.historyDropdown = historyDropdown;
    view.registerDomEvent = jest.fn();
    view.registerEvent = jest.fn();
    view.eventRefs = eventRefs;
    view.plugin = {
      app: {
        vault: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
        workspace: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
      },
    };
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue(null),
    };

    view.wireEventHandlers();
    const focusinHandler = listeners.get('focusin') as EventListener;

    focusinHandler({ target: insideTarget } as unknown as Event);
    expect(historyDropdown.hasClass('visible')).toBe(true);

    focusinHandler({ target: outsideTarget } as unknown as Event);
    expect(historyDropdown.hasClass('visible')).toBe(false);
    expect(ownerDocument.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(ownerDocument.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(ownerDocument.addEventListener).toHaveBeenCalledWith('focusin', expect.any(Function), true);
    expect(ownerDocument.defaultView.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function), undefined);
  });

  it('routes tab switching through CommandRegistry when runtime is available', async () => {
    const view = Object.create(TyporAiView.prototype) as any;
    const commandRegistry = new CommandRegistry();
    const commandHandler = jest.fn();
    commandRegistry.register('tab.switch', 'Switch tab', commandHandler);
    view.setCommandRegistry(commandRegistry);
    view.tabManager = {
      switchToTab: jest.fn().mockResolvedValue(undefined),
    };

    view.handleTabClick('tab-2');
    await Promise.resolve();

    expect(commandHandler).toHaveBeenCalledWith('tab-2');
    expect(view.tabManager.switchToTab).not.toHaveBeenCalled();
  });

  it('falls back to TabManager when switching tabs without runtime commands', () => {
    const view = Object.create(TyporAiView.prototype) as any;
    view.tabManager = {
      switchToTab: jest.fn().mockResolvedValue(undefined),
    };

    view.handleTabClick('tab-2');

    expect(view.tabManager.switchToTab).toHaveBeenCalledWith('tab-2');
  });

  it('closes tabs through the public command host method', async () => {
    const view = Object.create(TyporAiView.prototype) as any;
    view.updateTabBarVisibility = jest.fn();
    view.tabManager = {
      getTab: jest.fn().mockReturnValue({ state: { isStreaming: true } }),
      closeTab: jest.fn().mockResolvedValue(true),
    };

    await view.closeTab('tab-2');

    expect(view.tabManager.closeTab).toHaveBeenCalledWith('tab-2', true);
    expect(view.updateTabBarVisibility).toHaveBeenCalledTimes(1);
  });

  it('routes history item selection through CommandRegistry when runtime is available', async () => {
    const historyDropdown = createMockEl();
    const renderHistoryDropdown = jest.fn();
    const commandRegistry = new CommandRegistry();
    const commandHandler = jest.fn();
    const view = Object.create(TyporAiView.prototype) as any;

    commandRegistry.register('conversation.open-history', 'Open history', commandHandler);
    view.setCommandRegistry(commandRegistry);
    view.historyDropdown = historyDropdown;
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue({
        controllers: {
          conversationController: { renderHistoryDropdown },
        },
      }),
    };

    view.updateHistoryDropdown();
    const callbacks = renderHistoryDropdown.mock.calls[0][1];
    callbacks.onSelectConversation('conv-1');
    await Promise.resolve();

    expect(commandHandler).toHaveBeenCalledWith('conv-1');
  });

  it('opens history conversations in new tabs through CommandRegistry payloads', async () => {
    const historyDropdown = createMockEl();
    const renderHistoryDropdown = jest.fn();
    const commandRegistry = new CommandRegistry();
    const commandHandler = jest.fn();
    const view = Object.create(TyporAiView.prototype) as any;

    commandRegistry.register('conversation.open-history-new-tab', 'Open history in new tab', commandHandler);
    view.setCommandRegistry(commandRegistry);
    view.historyDropdown = historyDropdown;
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue({
        controllers: {
          conversationController: { renderHistoryDropdown },
        },
      }),
    };

    view.updateHistoryDropdown();
    const callbacks = renderHistoryDropdown.mock.calls[0][1];
    callbacks.onOpenConversationInNewTab('conv-2', false);
    await Promise.resolve();

    expect(commandHandler).toHaveBeenCalledWith({ activate: false, conversationId: 'conv-2' });
  });

  it('falls back when opening history conversations without runtime commands', async () => {
    const view = Object.create(TyporAiView.prototype) as any;
    view.historyDropdown = createMockEl();
    view.tabManager = {
      openConversation: jest.fn().mockResolvedValue(undefined),
    };

    await view.openHistoryConversationInNewTab('conv-3', false);

    expect(view.tabManager.openConversation).toHaveBeenCalledWith('conv-3', {
      preferNewTab: true,
      activate: false,
    });
    expect(view.historyDropdown.hasClass('visible')).toBe(false);
  });

  it('exposes active-tab conversation actions for the command registry', async () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const cancelStreaming = jest.fn();
    const createNew = jest.fn().mockResolvedValue(undefined);
    const focus = jest.fn();
    const view = Object.create(TyporAiView.prototype) as any;

    view.updateHistoryDropdown = jest.fn();
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue({
        controllers: {
          inputController: { sendMessage, cancelStreaming },
          conversationController: { createNew },
        },
        state: { isStreaming: true },
        dom: {
          inputEl: { focus },
        },
      }),
    };

    await view.sendActiveInputMessage();
    view.cancelActiveStreaming();
    await view.createNewConversationInActiveTab();
    view.focusActiveInput();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(cancelStreaming).toHaveBeenCalledTimes(1);
    expect(createNew).toHaveBeenCalledTimes(1);
    expect(view.updateHistoryDropdown).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe('TyporAiView Escape handling', () => {

  beforeEach(() => {
  });

  afterEach(() => {
  });

  function createEscapeHarness(options: {
    isStreaming: boolean;
  }): {
    cancelStreaming: jest.Mock;
    eventRefs: unknown[];
    view: any;
  } {
    const cancelStreaming = jest.fn();
    const eventRefs: unknown[] = [];
    const parentScope = new Scope();
    const view = Object.create(TyporAiView.prototype) as any;

    view.app = { scope: parentScope };
    view.containerEl = createMockEl();
    view.historyDropdown = createMockEl();
    view.registerDomEvent = jest.fn();
    view.registerEvent = jest.fn();
    view.eventRefs = eventRefs;
    view.plugin = {
      app: {
        vault: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
        workspace: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
      },
    };
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue({
        state: { isStreaming: options.isStreaming },
        controllers: {
          inputController: { cancelStreaming },
        },
        ui: {
          fileContextManager: {
            markFileCacheDirty: jest.fn(),
            markFolderCacheDirty: jest.fn(),
            handleFileOpen: jest.fn(),
            handleClickOutside: jest.fn(),
          },
        },
      }),
    };

    return { cancelStreaming, eventRefs, view };
  }

  function createScopedSendHarness(options: {
    inputFocused: boolean;
  }): {
    inputEl: HTMLTextAreaElement;
    sendMessage: jest.Mock;
    view: any;
  } {
    const sendMessage = jest.fn();
    const inputEl = createMockEl('textarea') as unknown as HTMLTextAreaElement;
    Object.defineProperty(inputEl.ownerDocument, 'activeElement', {
      configurable: true,
      get: () => options.inputFocused ? inputEl : null,
    });
    const eventRefs: unknown[] = [];
    const parentScope = new Scope();
    const view = Object.create(TyporAiView.prototype) as any;

    view.app = { scope: parentScope };
    view.containerEl = createMockEl();
    view.historyDropdown = createMockEl();
    view.registerDomEvent = jest.fn();
    view.registerEvent = jest.fn();
    view.eventRefs = eventRefs;
    view.plugin = {
      app: {
        vault: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
        workspace: {
          on: jest.fn((_event: string, handler: unknown) => {
            const ref = { handler };
            eventRefs.push(ref);
            return ref;
          }),
        },
      },
    };
    view.tabManager = {
      getActiveTab: jest.fn().mockReturnValue({
        state: { isStreaming: false },
        dom: { inputEl },
        controllers: {
          inputController: { sendMessage },
        },
        ui: {
          fileContextManager: {
            markFileCacheDirty: jest.fn(),
            markFolderCacheDirty: jest.fn(),
            handleFileOpen: jest.fn(),
            handleClickOutside: jest.fn(),
          },
        },
      }),
    };

    return { inputEl, sendMessage, view };
  }

  it('registers Escape on the Obsidian view scope instead of document keydown capture', () => {
    const { view } = createEscapeHarness({ isStreaming: true });

    view.wireEventHandlers();

    expect(view.scope).toBeInstanceOf(Scope);
    expect(view.scope.parent).toBe(view.app.scope);
    expect(view.scope.handlers).toEqual(expect.arrayContaining([
      expect.objectContaining({ modifiers: [], key: 'Escape', func: expect.any(Function) }),
    ]));
    expect(view.registerDomEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      'keydown',
      expect.any(Function),
      { capture: true }
    );
  });

  it('cancels streaming and consumes scoped Escape', () => {
    const { cancelStreaming, view } = createEscapeHarness({ isStreaming: true });

    view.wireEventHandlers();
    const escapeHandler = view.scope.handlers.find((handler: any) => handler.key === 'Escape');
    const result = escapeHandler.func({ key: 'Escape', isComposing: false } as KeyboardEvent);

    expect(cancelStreaming).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it('consumes scoped Escape without cancelling when not streaming', () => {
    const { cancelStreaming, view } = createEscapeHarness({ isStreaming: false });

    view.wireEventHandlers();
    const escapeHandler = view.scope.handlers.find((handler: any) => handler.key === 'Escape');
    const result = escapeHandler.func({ key: 'Escape', isComposing: false } as KeyboardEvent);

    expect(cancelStreaming).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('consumes already handled scoped Escape without cancelling again', () => {
    const { cancelStreaming, view } = createEscapeHarness({ isStreaming: true });

    view.wireEventHandlers();
    const escapeHandler = view.scope.handlers.find((handler: any) => handler.key === 'Escape');
    const result = escapeHandler.func({
      key: 'Escape',
      isComposing: false,
      defaultPrevented: true,
    } as KeyboardEvent);

    expect(cancelStreaming).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('sends from focused composer through scoped Ctrl+Enter', () => {
    const { sendMessage, view } = createScopedSendHarness({ inputFocused: true });

    view.wireEventHandlers();
    const sendHandler = view.scope.handlers.find(
      (handler: any) => handler.key === 'Enter' && handler.modifiers?.includes('Mod')
    );
    const event = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;
    const result = sendHandler.func(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it('sends from the focused composer through scoped Command+Enter on macOS', () => {
    const { sendMessage, view } = createScopedSendHarness({ inputFocused: true });
    view.setPlatform('macos');

    view.wireEventHandlers();
    const sendHandler = view.scope.handlers.find(
      (handler: any) => handler.key === 'Enter' && handler.modifiers?.includes('Mod')
    );
    const event = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;
    const result = sendHandler.func(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it('ignores scoped Mod+Enter when composer is not focused', () => {
    Platform.isMacOS = true;
    const { sendMessage, view } = createScopedSendHarness({ inputFocused: false });

    view.wireEventHandlers();
    const sendHandler = view.scope.handlers.find(
      (handler: any) => handler.key === 'Enter' && handler.modifiers?.includes('Mod')
    );
    const event = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;
    const result = sendHandler.func(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('routes focused scoped Ctrl+Enter through CommandRegistry when runtime is available', async () => {
    const { sendMessage, view } = createScopedSendHarness({ inputFocused: true });
    const commandRegistry = new CommandRegistry();
    const commandHandler = jest.fn();
    commandRegistry.register('conversation.send', 'Send', commandHandler);
    view.setCommandRegistry(commandRegistry);

    view.wireEventHandlers();
    const sendHandler = view.scope.handlers.find(
      (handler: any) => handler.key === 'Enter' && handler.modifiers?.includes('Mod')
    );
    const event = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;
    const result = sendHandler.func(event);
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(commandHandler).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('routes scoped Escape through CommandRegistry when runtime is available', async () => {
    const { cancelStreaming, view } = createEscapeHarness({ isStreaming: true });
    const commandRegistry = new CommandRegistry();
    const commandHandler = jest.fn();
    commandRegistry.register('conversation.cancel', 'Cancel', commandHandler);
    view.setCommandRegistry(commandRegistry);

    view.wireEventHandlers();
    const escapeHandler = view.scope.handlers.find((handler: any) => handler.key === 'Escape');
    const result = escapeHandler.func({ key: 'Escape', isComposing: false } as KeyboardEvent);
    await Promise.resolve();

    expect(commandHandler).toHaveBeenCalledTimes(1);
    expect(cancelStreaming).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
