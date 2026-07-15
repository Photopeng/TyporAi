import type { TyporaEventRef, TyporaPanelHost } from '@/typora/platform';
import { Scope,TyporaPanelView } from '@/typora/platform';
import { setIcon } from '@/ui/Icon';

import type { CommandRegistry } from '../../core/CommandRegistry';
import type { FileWatchService, NotificationService, PlatformInfo, ProcessTransportFactory } from '../../core/ports';
import { getHiddenProviderCommandSet } from '../../core/providers/commands/hiddenCommands';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import {
  type CreateChatRuntimeOptions,
  DEFAULT_CHAT_PROVIDER_ID,
  type ProviderId,
  type ProviderServiceFactory,
} from '../../core/providers/types';
import type { ChatRuntime } from '../../core/runtime/ChatRuntime';
import { VIEW_TYPE_TYPORAI } from '../../core/types';
import { t } from '../../i18n/i18n';
import type TyporAiPlugin from '../../main';
import { executeRegisteredCommand, getRegisteredCommandRegistry } from '../../shared/commandRuntime';
import { DisposableBag } from '../../ui/DisposableBag';
import { NoticeAdapter } from '../../ui/NoticeAdapter';
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
  type ScheduledAnimationFrame,
} from '../../utils/animationFrame';
import type { HistoryConversationStatus } from './controllers/ConversationController';
import type { TyporaDocumentSnapshot } from './controllers/InputController';
import {
  getTabProviderId,
  onProviderAvailabilityChanged,
  updatePlanModeUI,
} from './tabs/Tab';
import { TabBar } from './tabs/TabBar';
import { TabManager } from './tabs/TabManager';
import type { TabData, TabId } from './tabs/types';
import { recalculateUsageForModel } from './utils/usageInfo';

type LoadableView = {
  containerEl?: HTMLElement;
  load: () => Promise<void> | void;
};

export class TyporAiView extends TyporaPanelView {
  private plugin: TyporAiPlugin;
  private notificationService: NotificationService = new NoticeAdapter();

  // Tab management
  private tabManager: TabManager | null = null;
  private runtimeFactory: ((options: CreateChatRuntimeOptions) => ChatRuntime) | null = null;
  private providerServiceFactory: ProviderServiceFactory | null = null;
  private processTransport: ProcessTransportFactory | null = null;
  private commandRegistry: CommandRegistry | null = null;
  private fileWatchService: FileWatchService | null = null;
  private tabBar: TabBar | null = null;
  private tabBarContainerEl: HTMLElement | null = null;
  private tabContentEl: HTMLElement | null = null;
  private inputFooterEl: HTMLElement | null = null;
  private activeInputSlotEl: HTMLElement | null = null;
  private activeInputTabId: TabId | null = null;

  // DOM Elements
  private viewContainerEl: HTMLElement | null = null;
  private newTabButtonEl: HTMLElement | null = null;

  // Header elements
  private historyContainerEl: HTMLElement | null = null;
  private historyDropdown: HTMLElement | null = null;

  // Event refs for cleanup
  private eventRefs: TyporaEventRef[] = [];
  private domEvents = new DisposableBag();

  // Debouncing for tab bar updates
  private pendingTabBarUpdate: ScheduledAnimationFrame | null = null;

  // Debouncing for tab state persistence
  private pendingPersist: number | null = null;

  constructor(leaf: TyporaPanelHost, plugin: TyporAiPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Hover Editor compatibility: Define load as an instance method that can't be
    // overwritten by prototype patching. Hover Editor patches TyporAiView.prototype.load
    // after our class is defined, but instance methods take precedence over prototype methods.
    const prototype = Object.getPrototypeOf(this) as LoadableView;
    const originalLoad = prototype.load.bind(this) as () => Promise<void> | void;
    Object.defineProperty(this, 'load', {
      value: async () => {
        // Ensure containerEl exists before any patched load code tries to use it
        if (!this.containerEl) {
          (this as LoadableView).containerEl = createDiv({ cls: 'view-content' });
        }
        // Wrap in try-catch to prevent Hover Editor errors from breaking our view
        try {
          return await originalLoad();
        } catch {
          // Hover Editor may throw if its DOM setup fails - continue anyway
        }
      },
      writable: false,
      configurable: false,
    });
  }

  setNotificationService(service: NotificationService): void {
    this.notificationService = service;
    this.tabManager?.setNotificationService(service);
  }

  getViewType(): string {
    return VIEW_TYPE_TYPORAI;
  }

  getDisplayText(): string {
    return 'TyporAi';
  }

  getIcon(): string {
    return 'bot';
  }

  /** Refreshes model-dependent UI across all tabs (used after settings/env changes). */
  refreshModelSelector(): void {
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      onProviderAvailabilityChanged(tab, this.plugin);
      const providerId = getTabProviderId(tab, this.plugin);
      const providerSettings = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
        this.plugin.settings,
        providerId,
      );
      const model = providerSettings.model;
      const uiConfig = ProviderRegistry.getChatUIConfig(providerId);
      const capabilities = ProviderRegistry.getCapabilities(providerId);
      const contextWindow = uiConfig.getContextWindowSize(
        model,
        providerSettings.customContextLimits,
        providerSettings,
      );

      if (tab.state.usage) {
        tab.state.usage = recalculateUsageForModel(tab.state.usage, model, contextWindow);
      }

      tab.ui.modelSelector?.updateDisplay();
      tab.ui.modelSelector?.renderOptions();
      tab.ui.modeSelector?.updateDisplay();
      tab.ui.modeSelector?.renderOptions();
      tab.ui.thinkingBudgetSelector?.updateDisplay();
      tab.ui.permissionToggle?.updateDisplay();
      tab.ui.serviceTierToggle?.updateDisplay();
      tab.dom.inputWrapper.toggleClass(
        'typorai-input-plan-mode',
        providerSettings.permissionMode === 'plan' && capabilities.supportsPlanMode,
      );
    }

    this.tabManager?.primeProviderRuntime();
  }

  /** Rebinds visible labels and tooltips after the user changes language. */
  refreshLocalizedUI(): void {
    const updateLabel = (
      selector: string,
      key: Parameters<typeof t>[0],
      titleKey: Parameters<typeof t>[0] = key,
    ): void => {
      const element = this.viewContainerEl?.querySelector<HTMLElement>(selector);
      if (!element) return;
      element.setAttribute('aria-label', t(key));
      element.title = t(titleKey);
    };

    updateLabel('.typorai-new-conversation-btn', 'chat.actions.newConversation');
    updateLabel('.typorai-new-tab-btn', 'chat.actions.newTab');
    updateLabel('.typorai-history-btn', 'chat.actions.history');
    updateLabel('.typorai-title', 'typora.panel.hideAria', 'typora.panel.hideTitle');
    updateLabel('.typorai-typora-settings-button', 'typora.settings.openAria', 'typora.settings.title');

    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      tab.dom.inputEl.placeholder = t('chat.input.placeholder');
      tab.ui.modelSelector?.updateDisplay();
      tab.ui.modeSelector?.updateDisplay();
      tab.ui.thinkingBudgetSelector?.updateDisplay();
      tab.ui.permissionToggle?.updateDisplay();
      tab.ui.serviceTierToggle?.updateDisplay();
      tab.ui.mcpServerSelector?.updateDisplay();
      tab.ui.cursorFlowToggle?.updateDisplay();
    }
  }

  invalidateProviderCommandCaches(providerIds?: ProviderId[]): void {
    this.tabManager?.invalidateProviderCommandCaches(providerIds);
  }

  /** Updates provider-scoped hidden commands on all tabs after settings changes. */
  updateHiddenProviderCommands(): void {
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      tab.ui.slashCommandDropdown?.setHiddenCommands(
        getHiddenProviderCommandSet(this.plugin.settings, getTabProviderId(tab, this.plugin)),
      );
    }
  }

  async onOpen() {
    // Guard: Hover Editor and similar plugins may call onOpen before DOM is ready.
    // containerEl must exist before we can access contentEl or create elements.
    if (!this.containerEl) {
      return;
    }
    this.domEvents.dispose();
    this.domEvents = new DisposableBag();
    this.disposePlatformListeners();

    // Use contentEl (standard Typora API) as primary target.
    // Hover Editor and other plugins may modify the DOM structure,
    // so we need fallbacks to handle non-standard scenarios.
    let container: HTMLElement | null =
      this.contentEl ?? (this.containerEl.children[1] as HTMLElement | null);

    if (!container) {
      // Last resort: create our own container inside containerEl
      container = this.containerEl.createDiv();
    }

    this.viewContainerEl = container;
    this.viewContainerEl.empty();
    this.viewContainerEl.addClass('typorai-container');

    const header = this.viewContainerEl.createDiv({ cls: 'typorai-header' });
    this.buildHeader(header);

    this.tabContentEl = this.viewContainerEl.createDiv({ cls: 'typorai-tab-content-container' });
    this.buildInputFooter();

    this.tabManager = new TabManager(
      this.plugin,
      this.tabContentEl,
      this,
      {
        onTabCreated: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.updateInputLocation();
          this.persistTabState();
          this.syncProviderBrandColor();
        },
        onActiveTabChanged: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.updateInputLocation();
          this.syncProviderBrandColor();
        },
        onTabSwitched: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.updateInputLocation();
          this.persistTabState();
          this.syncProviderBrandColor();
        },
        onTabClosed: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.updateInputLocation();
          this.persistTabState();
        },
        onTabStreamingChanged: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
        },
        onTabTitleChanged: () => this.updateTabBar(),
        onTabAttentionChanged: () => this.updateTabBar(),
        onTabConversationChanged: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.persistTabState();
          this.syncProviderBrandColor();
        },
        onTabProviderChanged: () => {
          this.updateTabBar();
          this.syncProviderBrandColor();
          this.persistTabState();
        },
      }
    );
    if (this.runtimeFactory) this.tabManager.setRuntimeFactory(this.runtimeFactory);
    if (this.providerServiceFactory) this.tabManager.setProviderServiceFactory(this.providerServiceFactory);
    if (this.processTransport) this.tabManager.setProcessTransport(this.processTransport);
    if (this.fileWatchService) this.tabManager.setFileWatchService(this.fileWatchService);
    this.tabManager.setNotificationService(this.notificationService);

    this.wireEventHandlers();
    await this.restoreOrCreateTabs();
    this.syncProviderBrandColor();
    this.updateInputLocation();
    this.updateTabBarVisibility();
    this.tabManager?.primeProviderRuntime();
  }

  async onClose() {
    if (this.pendingTabBarUpdate !== null) {
      cancelScheduledAnimationFrame(this.pendingTabBarUpdate);
      this.pendingTabBarUpdate = null;
    }

    for (const ref of this.eventRefs) {
      this.plugin.app.vault.offref(ref);
    }
    this.eventRefs = [];

    await this.persistTabStateImmediate();

    this.restoreActiveInputToTabContent();
    await this.tabManager?.destroy();
    this.tabManager = null;

    this.tabBar?.destroy();
    this.tabBar = null;
    this.scope = null;

    this.domEvents.dispose();
    this.disposePlatformListeners();
  }

  // ============================================
  // UI Building
  // ============================================

  private buildHeader(header: HTMLElement): void {
    const titleEl = header.createEl('button', {
      cls: 'typorai-title',
      attr: { type: 'button' },
    });
    titleEl.createSpan({ text: 'TyporAi', cls: 'typorai-title-text' });

    const tabsEl = header.createDiv({ cls: 'typorai-header-tabs' });
    this.tabBarContainerEl = tabsEl.createDiv({ cls: 'typorai-tab-bar-container typorai-header-tab-bar-container' });
    this.tabBar = new TabBar(this.tabBarContainerEl, {
      onTabClick: (tabId) => this.handleTabClick(tabId),
      onTabClose: (tabId) => {
        void this.executeConversationCommand(
          'tab.close',
          tabId,
          () => this.closeTab(tabId),
          t('chat.tabs.closeFailed'),
        );
      },
      onNewTab: () => {
        void this.executeConversationCommand(
          'conversation.new-tab',
          undefined,
          () => this.createNewTab(),
          t('chat.tabs.createFailed'),
        );
      },
    });

    const actionsEl = header.createDiv({ cls: 'typorai-header-actions' });

    const newBtn = actionsEl.createDiv({ cls: 'typorai-header-action-btn typorai-new-conversation-btn' });
    setIcon(newBtn, 'message-square-dot');
    const newConversationLabel = t('chat.actions.newConversation');
    newBtn.setAttribute('aria-label', newConversationLabel);
    newBtn.title = newConversationLabel;
    newBtn.addEventListener('click', () => {
      void this.executeConversationCommand(
        'conversation.new',
        undefined,
        () => this.createNewConversationInActiveTab(),
        t('chat.tabs.newConversationFailed'),
      );
    });

    this.newTabButtonEl = actionsEl.createDiv({ cls: 'typorai-header-action-btn typorai-new-tab-btn' });
    setIcon(this.newTabButtonEl, 'square-plus');
    const newTabLabel = t('chat.actions.newTab');
    this.newTabButtonEl.setAttribute('aria-label', newTabLabel);
    this.newTabButtonEl.title = newTabLabel;
    this.newTabButtonEl.addEventListener('click', () => {
      void this.executeConversationCommand(
        'conversation.new-tab',
        undefined,
        () => this.createNewTab(),
        t('chat.tabs.createFailed'),
      );
    });

    this.historyContainerEl = actionsEl.createDiv({ cls: 'typorai-history-container typorai-header-history-container' });
    const historyBtn = this.historyContainerEl.createDiv({ cls: 'typorai-header-action-btn typorai-history-btn' });
    setIcon(historyBtn, 'clock');
    const historyLabel = t('chat.actions.history');
    historyBtn.setAttribute('aria-label', historyLabel);
    historyBtn.title = historyLabel;

    this.historyDropdown = this.historyContainerEl.createDiv({ cls: 'typorai-history-menu' });

    historyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHistoryDropdown();
    });
  }

  private buildInputFooter(): void {
    if (!this.viewContainerEl) return;

    this.inputFooterEl = this.viewContainerEl.createDiv({ cls: 'typorai-input-footer' });
    this.activeInputSlotEl = this.inputFooterEl.createDiv({ cls: 'typorai-active-input-slot' });
  }

  private updateInputLocation(): void {
    const activeTab = this.tabManager?.getActiveTab();
    if (!this.activeInputSlotEl) return;

    if (!activeTab) {
      this.activeInputSlotEl.empty();
      this.activeInputTabId = null;
      return;
    }

    if (this.activeInputTabId && this.activeInputTabId !== activeTab.id) {
      const previousTab = this.tabManager?.getTab(this.activeInputTabId);
      if (previousTab) {
        previousTab.dom.contentEl.appendChild(previousTab.dom.inputComposerEl);
      }
    }

    if (this.activeInputTabId === activeTab.id) {
      if (activeTab.dom.inputComposerEl.parentElement !== this.activeInputSlotEl) {
        this.activeInputSlotEl.appendChild(activeTab.dom.inputComposerEl);
      }
      return;
    }

    this.activeInputSlotEl.empty();
    this.activeInputSlotEl.appendChild(activeTab.dom.inputComposerEl);
    this.activeInputTabId = activeTab.id;
  }

  private restoreActiveInputToTabContent(): void {
    if (!this.activeInputTabId) return;

    const activeInputTab = this.tabManager?.getTab(this.activeInputTabId);
    if (activeInputTab) {
      activeInputTab.dom.contentEl.appendChild(activeInputTab.dom.inputComposerEl);
    }
    this.activeInputSlotEl?.empty();
    this.activeInputTabId = null;
  }

  /** Refreshes tab controls after settings that affect tab availability change. */
  refreshTabControls(): void {
    this.updateTabBarVisibility();
  }

  // ============================================
  // Tab Management
  // ============================================

  private handleTabClick(tabId: TabId): void {
    void this.executeConversationCommand(
      'tab.switch',
      tabId,
      () => this.switchToTab(tabId),
      t('chat.tabs.switchFailed'),
    );
  }

  switchToTab(tabId: TabId): void {
    const switched = this.tabManager?.switchToTab(tabId);
    if (switched) {
      void switched.catch(() => this.notificationService.show(t('chat.tabs.switchFailed'), 'error'));
    }
  }

  async closeTab(tabId: TabId): Promise<void> {
    try {
      const tab = this.tabManager?.getTab(tabId);
      // If streaming, treat close like user interrupt (force close cancels the stream)
      const force = tab?.state.isStreaming ?? false;
      await this.tabManager?.closeTab(tabId, force);
      this.updateTabBarVisibility();
    } catch {
      this.notificationService.show(t('chat.tabs.closeFailed'), 'error');
    }
  }

  async createNewTab(): Promise<void> {
    const tab = await this.tabManager?.createTab();
      if (!tab) {
        const maxTabs = this.plugin.settings.maxTabs ?? 3;
        this.notificationService.show(t('chat.tabs.maxReached', { count: String(maxTabs) }), 'warning');
        this.updateTabBarVisibility();
        return;
      }
    this.updateTabBarVisibility();
  }

  async sendActiveInputMessage(): Promise<void> {
    await this.tabManager?.getActiveTab()?.controllers.inputController?.sendMessage();
  }

  cancelActiveStreaming(): void {
    const activeTab = this.tabManager?.getActiveTab();
    if (activeTab?.state.isStreaming) {
      activeTab.controllers.inputController?.cancelStreaming();
    }
  }

  async createNewConversationInActiveTab(): Promise<void> {
    await this.tabManager?.getActiveTab()?.controllers.conversationController?.createNew();
    this.updateHistoryDropdown();
  }

  focusActiveInput(): void {
    this.tabManager?.getActiveTab()?.dom.inputEl.focus();
  }

  private executeConversationCommand(
    commandId: string,
    payload: unknown,
    fallback: () => void | Promise<void>,
    failureMessage: string,
  ): Promise<void> {
    if (getRegisteredCommandRegistry(this.commandRegistry, commandId)) {
      return executeRegisteredCommand(this.commandRegistry, commandId, payload)
        .then(() => undefined)
        .catch(() => {
          this.notificationService.show(failureMessage, 'error');
        });
    }

    return Promise.resolve(fallback())
      .then(() => undefined)
      .catch(() => {
        this.notificationService.show(failureMessage, 'error');
      });
  }

  private isExplicitSendShortcut(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
      return false;
    }

    return event.ctrlKey === true && !event.metaKey && !event.altKey;
  }

  private updateTabBar(): void {
    if (!this.tabManager || !this.tabBar) return;

    // Debounce tab bar updates using requestAnimationFrame
    if (this.pendingTabBarUpdate !== null) {
      cancelScheduledAnimationFrame(this.pendingTabBarUpdate);
    }

    this.pendingTabBarUpdate = scheduleAnimationFrame(() => {
      this.pendingTabBarUpdate = null;
      if (!this.tabManager || !this.tabBar) return;

      const items = this.tabManager.getTabBarItems();
      this.tabBar.update(items);
      this.updateTabBarVisibility();
    }, this.containerEl.ownerDocument.defaultView ?? null);
  }

  private updateTabBarVisibility(): void {
    if (!this.tabBarContainerEl || !this.tabManager) return;

    const tabCount = this.tabManager.getTabCount();
    const showTabBar = tabCount >= 2;

    this.tabBarContainerEl.toggleClass('typorai-hidden', !showTabBar);

    this.updateNewTabButtonVisibility();
  }

  private updateNewTabButtonVisibility(): void {
    if (!this.newTabButtonEl || !this.tabManager) return;

    const canCreateTab = this.tabManager.canCreateTab();
    this.newTabButtonEl.toggleClass('typorai-hidden', !canCreateTab);
    if (canCreateTab) {
      this.newTabButtonEl.removeAttribute('aria-disabled');
      this.newTabButtonEl.removeAttribute('aria-hidden');
      return;
    }

    this.newTabButtonEl.setAttribute('aria-disabled', 'true');
    this.newTabButtonEl.setAttribute('aria-hidden', 'true');
  }

  /** Sets `data-provider` on the root container so CSS brand color follows the active provider. */
  private syncProviderBrandColor(): void {
    if (!this.viewContainerEl) return;
    const activeTab = this.tabManager?.getActiveTab();
    const providerId = activeTab ? getTabProviderId(activeTab, this.plugin) : DEFAULT_CHAT_PROVIDER_ID;
    this.viewContainerEl.dataset.provider = providerId;
  }

  // ============================================
  // History Dropdown
  // ============================================

  toggleHistoryDropdown(): void {
    if (!this.historyDropdown) return;

    const isVisible = this.historyDropdown.hasClass('visible');
    if (isVisible) {
      this.historyDropdown.removeClass('visible');
    } else {
      this.updateHistoryDropdown();
      this.historyDropdown.addClass('visible');
    }
  }

  private closeHistoryDropdown(): void {
    this.historyDropdown?.removeClass('visible');
  }

  private shouldKeepHistoryDropdownOpen(target: EventTarget | null): boolean {
    if (!this.historyDropdown || !target) {
      return false;
    }

    return Boolean(this.historyContainerEl?.contains(target as Node));
  }

  private registerNativeDomEvent(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (!target || typeof target.addEventListener !== 'function') return;

    target.addEventListener(type, listener, options);
    (this.domEvents ??= new DisposableBag()).add(() => target.removeEventListener?.(type, listener, options));
  }

  private updateHistoryDropdown(): void {
    if (!this.historyDropdown) return;
    this.historyDropdown.empty();

    const activeTab = this.tabManager?.getActiveTab();
    const conversationController = activeTab?.controllers.conversationController;

    if (conversationController) {
      conversationController.renderHistoryDropdown(this.historyDropdown, {
        onSelectConversation: (id) => {
          return this.executeConversationCommand(
            'conversation.open-history',
            id,
            () => this.openHistoryConversation(id),
            t('renderer.history.loadFailed'),
          );
        },
        onOpenConversationInNewTab: (id, activate) => {
          return this.executeConversationCommand(
            'conversation.open-history-new-tab',
            { activate, conversationId: id },
            () => this.openHistoryConversationInNewTab(id, activate),
            t('renderer.history.loadFailed'),
          );
        },
        getConversationStatus: (id) => this.getHistoryConversationStatus(id),
      });
    }
  }

  async openHistoryConversation(conversationId: string): Promise<void> {
    await this.tabManager?.openConversation(conversationId);
    this.historyDropdown?.removeClass('visible');
  }

  async openHistoryConversationInNewTab(
    conversationId: string,
    activate = true,
  ): Promise<void> {
    await this.tabManager?.openConversation(conversationId, {
      preferNewTab: true,
      activate,
    });
    this.historyDropdown?.removeClass('visible');
  }

  private getHistoryConversationStatus(conversationId: string): HistoryConversationStatus {
    const activeTab = this.tabManager?.getActiveTab();
    if (activeTab?.conversationId === conversationId) {
      return {
        openState: 'current',
        isRunning: activeTab.state.isStreaming,
        location: 'current-view',
        tabIndex: this.getHistoryTabIndex(activeTab),
      };
    }

    const localTab = this.findTabWithConversation(conversationId);
    if (localTab) {
      return {
        openState: 'open',
        isRunning: localTab.state.isStreaming,
        location: 'current-view',
        tabIndex: this.getHistoryTabIndex(localTab),
      };
    }

    const crossViewResult = this.plugin.findConversationAcrossViews(conversationId);
    if (crossViewResult && crossViewResult.view !== this) {
      const crossViewTab = crossViewResult.view.getTabManager()?.getTab(crossViewResult.tabId);
      return {
        openState: 'open',
        isRunning: crossViewTab?.state.isStreaming ?? false,
        location: 'other-view',
      };
    }

    return {
      openState: 'closed',
      isRunning: false,
      location: 'current-view',
    };
  }

  private findTabWithConversation(conversationId: string): TabData | null {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    return tabs.find(tab => tab.conversationId === conversationId) ?? null;
  }

  private getHistoryTabIndex(tab: TabData): number | undefined {
    const index = this.tabManager?.getAllTabs().findIndex(candidate => candidate.id === tab.id) ?? -1;
    return index >= 0 ? index + 1 : undefined;
  }

  // ============================================
  // Event Wiring
  // ============================================

  private wireEventHandlers(): void {
    const activeDocument = this.containerEl.ownerDocument;

    // The Typora view owns explicit DOM listeners so they can be disposed reliably.
    // dismissal handlers are bound directly and cleaned up on close.
    this.registerNativeDomEvent(activeDocument, 'pointerdown', ((e: Event) => {
      if (this.shouldKeepHistoryDropdownOpen(e.target)) return;
      this.closeHistoryDropdown();
    }) as EventListener, true);
    this.registerNativeDomEvent(activeDocument, 'click', ((e: Event) => {
      if (this.shouldKeepHistoryDropdownOpen(e.target)) return;
      this.closeHistoryDropdown();
    }) as EventListener, true);
    this.registerNativeDomEvent(activeDocument, 'focusin', ((e: Event) => {
      if (this.shouldKeepHistoryDropdownOpen(e.target)) return;
      this.closeHistoryDropdown();
    }) as EventListener, true);
    const activeWindow = activeDocument.defaultView;
    this.registerNativeDomEvent(activeWindow, 'blur', () => this.closeHistoryDropdown());
    this.registerNativeDomEvent(activeDocument, 'visibilitychange', () => {
      if (!activeDocument.hidden) return;
      this.closeHistoryDropdown();
    });

    // View-level Shift+Tab to toggle plan mode (works from any focused element)
    this.registerDomEvent(this.containerEl, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const activeTab = this.tabManager?.getActiveTab();
        if (!activeTab) return;
        const providerId = getTabProviderId(activeTab, this.plugin);
        if (!ProviderRegistry.getCapabilities(providerId).supportsPlanMode) return;
        const current = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
          this.plugin.settings,
          providerId,
        ).permissionMode as string;
        if (current === 'plan') {
          const restoreMode = activeTab.state.prePlanPermissionMode ?? 'normal';
          activeTab.state.prePlanPermissionMode = null;
          updatePlanModeUI(activeTab, this.plugin, restoreMode);
        } else {
          activeTab.state.prePlanPermissionMode = current;
          updatePlanModeUI(activeTab, this.plugin, 'plan');
        }
      }
    });

    // View scopes are the Typora-owned boundary for main-area tab hotkeys.
    // Returning false consumes Escape before Typora uses it for pane navigation.
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (!e.defaultPrevented) {
        void this.executeConversationCommand(
          'conversation.cancel',
          undefined,
          () => {
            this.cancelActiveStreaming();
          },
          'Failed to cancel response',
        );
      }
      return false;
    });
    this.scope.register(['Mod'], 'Enter', (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const activeTab = this.tabManager?.getActiveTab();
      if (!activeTab) return;
      if (
        this.isExplicitSendShortcut(e)
        && activeTab.dom.inputEl.ownerDocument.activeElement === activeTab.dom.inputEl
      ) {
        e.preventDefault();
        void this.executeConversationCommand(
          'conversation.send',
          undefined,
          () => this.sendActiveInputMessage(),
          'Failed to send message',
        );
        return false;
      }
    });

    // TyporaWorkspace events - forward to active tab's file context manager
    const markCacheDirty = (includesFolders: boolean): void => {
      const mgr = this.tabManager?.getActiveTab()?.ui.fileContextManager;
      if (!mgr) return;
      mgr.markFileCacheDirty();
      if (includesFolders) mgr.markFolderCacheDirty();
    };
    this.eventRefs.push(
      this.plugin.app.vault.on('create', () => markCacheDirty(true)),
      this.plugin.app.vault.on('delete', () => markCacheDirty(true)),
      this.plugin.app.vault.on('rename', () => markCacheDirty(true)),
      this.plugin.app.vault.on('modify', () => markCacheDirty(false))
    );

    // File open event
    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file) {
          this.tabManager?.getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
        }
      })
    );

    // Click outside to close mention dropdown
    this.registerNativeDomEvent(activeDocument, 'click', (e) => {
      const activeTab = this.tabManager?.getActiveTab();
      if (activeTab) {
        const fcm = activeTab.ui.fileContextManager;
        if (fcm && !fcm.containsElement(e.target as Node) && e.target !== activeTab.dom.inputEl) {
          fcm.hideMentionDropdown();
        }
      }
    });
  }

  // ============================================
  // Persistence
  // ============================================

  private async restoreOrCreateTabs(): Promise<void> {
    if (!this.tabManager) return;

    // Try to restore from persisted state
    const persistedState = await this.plugin.storage.getTabManagerState();
    if (persistedState && persistedState.openTabs.length > 0) {
      await this.tabManager.restoreState(persistedState);
      return;
    }

    // Fallback: create a new empty tab
    await this.tabManager.createTab();
  }

  private persistTabState(): void {

    // Debounce persistence to avoid rapid writes (300ms delay)
    if (this.pendingPersist !== null) {
      window.clearTimeout(this.pendingPersist);
    }
    this.pendingPersist = window.setTimeout(() => {
      this.pendingPersist = null;
      if (!this.tabManager) return;
      const state = this.tabManager.getPersistedState();
      this.plugin.persistTabManagerState(state).catch(() => {
        // Silently ignore persistence errors
      });
    }, 300);
  }

  /** Force immediate persistence (for onClose/onunload). */
  private async persistTabStateImmediate(): Promise<void> {
    // Cancel any pending debounced persist
    if (this.pendingPersist !== null) {
      window.clearTimeout(this.pendingPersist);
      this.pendingPersist = null;
    }
    if (!this.tabManager) return;
    const state = this.tabManager.getPersistedState();
    await this.plugin.persistTabManagerState(state);
  }

  // ============================================
  // Public API
  // ============================================

  /** Gets the currently active tab. */
  getActiveTab(): TabData | null {
    return this.tabManager?.getActiveTab() ?? null;
  }

  /** Gets the tab manager. */
  getTabManager(): TabManager | null {
    return this.tabManager;
  }

  setRuntimeFactory(factory: (options: CreateChatRuntimeOptions) => ChatRuntime): void {
    this.runtimeFactory = factory;
    this.tabManager?.setRuntimeFactory(factory);
  }

  setProviderServiceFactory(factory: ProviderServiceFactory): void {
    this.providerServiceFactory = factory;
    this.tabManager?.setProviderServiceFactory(factory);
  }

  setProcessTransport(processTransport: ProcessTransportFactory): void {
    this.processTransport = processTransport;
    this.tabManager?.setProcessTransport(processTransport);
  }

  setPlatform(platform: PlatformInfo['operatingSystem']): void {
    this.tabManager?.setPlatform(platform);
  }

  setCommandRegistry(commandRegistry: CommandRegistry): void {
    this.commandRegistry = commandRegistry;
    this.tabManager?.setCommandRegistry?.(commandRegistry);
  }

  setDocumentSnapshotProvider(provider: () => TyporaDocumentSnapshot | null): void {
    this.tabManager?.setDocumentSnapshotProvider?.(provider);
  }

  setFileWatchService(fileWatchService: FileWatchService): void {
    this.fileWatchService = fileWatchService;
    this.tabManager?.setFileWatchService(fileWatchService);
  }

  /** Gets shared view controls that should preserve active tab selection context. */
  getSharedSelectionFocusScopeEls(): HTMLElement[] {
    return [
      this.tabBarContainerEl,
    ].filter((el): el is HTMLElement => el !== null);
  }
}
