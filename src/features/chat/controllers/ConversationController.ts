import { setIcon } from '@/ui/Icon';

import type { TitleGenerationService } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ChatRewindMode } from '../../../core/runtime/types';
import type { Conversation } from '../../../core/types';
import { t, tArray } from '../../../i18n/i18n';
import type TyporAiPlugin from '../../../main';
import { confirm } from '../../../shared/modals/ConfirmModal';
import { ContextMenu as Menu } from '../../../ui/ContextMenu';
import { NoticeAdapter } from '../../../ui/NoticeAdapter';
import { setTyporAiTooltip } from '../../../ui/Tooltip';
import { extractUserDisplayContent } from '../../../utils/context';
import type { MessageRenderer } from '../rendering/MessageRenderer';
import { cleanupThinkingBlock } from '../rendering/ThinkingBlockRenderer';
import { findRewindContext } from '../rewind';
import type { SubagentManager } from '../services/SubagentManager';
import type { ChatState } from '../state/ChatState';
import type { FileContextManager } from '../ui/FileContext';
import type { ImageContextManager } from '../ui/ImageContext';
import type { McpServerSelector } from '../ui/InputToolbar';
import type { StatusPanel } from '../ui/StatusPanel';

const notifications = new NoticeAdapter();
class Notice {
  constructor(message: string) { notifications.show(message, 'error'); }
}

function runConversationAction(action: () => Promise<void>, failureMessage: string): void {
  void action().catch(() => {
    new Notice(failureMessage);
  });
}

export interface ConversationCallbacks {
  onNewConversation?: () => void;
  onConversationLoaded?: () => void;
  onConversationSwitched?: () => void;
}

export interface ConversationControllerDeps {
  plugin: TyporAiPlugin;
  state: ChatState;
  renderer: MessageRenderer;
  subagentManager: SubagentManager;
  getHistoryDropdown: () => HTMLElement | null;
  getWelcomeEl: () => HTMLElement | null;
  setWelcomeEl: (el: HTMLElement | null) => void;
  getMessagesEl: () => HTMLElement;
  getInputEl: () => HTMLTextAreaElement;
  getFileContextManager: () => FileContextManager | null;
  getImageContextManager: () => ImageContextManager | null;
  getMcpServerSelector: () => McpServerSelector | null;
  clearQueuedMessage: () => void;
  getTitleGenerationService: () => TitleGenerationService | null;
  getStatusPanel: () => StatusPanel | null;
  getAgentService?: () => ChatRuntime | null;
  ensureServiceForConversation?: (conversation: Conversation | null) => Promise<void>;
  dismissPendingInlinePrompts?: () => void;
}

type SaveOptions = {
  resumeAtMessageId?: string;
  resetProviderSession?: boolean;
};

export type HistoryConversationOpenState = 'closed' | 'open' | 'current';

export type HistoryConversationStatus = {
  openState: HistoryConversationOpenState;
  isRunning: boolean;
  location?: 'current-view' | 'other-view';
  tabIndex?: number;
};

type HistoryRenderOptions = {
  onSelectConversation: (id: string) => Promise<void>;
  onOpenConversationInNewTab?: (id: string, activate?: boolean) => Promise<void>;
  getConversationOpenState?: (id: string) => HistoryConversationOpenState;
  getConversationStatus?: (id: string) => HistoryConversationStatus;
  onRerender: () => void;
};

export class ConversationController {
  private deps: ConversationControllerDeps;
  private callbacks: ConversationCallbacks;

  constructor(deps: ConversationControllerDeps, callbacks: ConversationCallbacks = {}) {
    this.deps = deps;
    this.callbacks = callbacks;
  }

  private getAgentService(): ChatRuntime | null {
    return this.deps.getAgentService?.() ?? null;
  }

  // ============================================
  // Conversation Lifecycle
  // ============================================

  /**
   * Resets to entry point state (New Chat).
   *
   * Entry point is a blank UI state - no conversation is created until the
   * first message is sent. This prevents empty conversations cluttering history.
   */
  async createNew(options: { force?: boolean } = {}): Promise<void> {
    const { plugin, state, subagentManager } = this.deps;
    const force = !!options.force;
    if (state.isStreaming && !force) return;
    if (state.isCreatingConversation) return;
    if (state.isSwitchingConversation) return;

    // Set flag to block message sending during reset
    state.isCreatingConversation = true;

    try {
      this.deps.dismissPendingInlinePrompts?.();

      if (force && state.isStreaming) {
        state.cancelRequested = true;
        state.bumpStreamGeneration();
        this.getAgentService()?.cancel();
      }

      // Save current conversation if it has messages
      if (state.currentConversationId && state.messages.length > 0) {
        await this.save();
      }

      subagentManager.orphanAllActive();
      subagentManager.clear();

      // Clear streaming state and related DOM references
      cleanupThinkingBlock(state.currentThinkingState);
      state.currentContentEl = null;
      state.currentTextEl = null;
      state.currentTextContent = '';
      state.currentThinkingState = null;
      state.toolCallElements.clear();
      state.writeEditStates.clear();
      state.isStreaming = false;

      // Reset to entry point state - no conversation created yet
      state.currentConversationId = null;
      state.clearMessages();
      state.usage = null;
      state.currentTodos = null;
      state.pendingNewSessionPlan = null;
      state.planFilePath = null;
      state.prePlanPermissionMode = null;
      state.autoScrollEnabled = plugin.settings.enableAutoScroll ?? true;
      state.hasPendingConversationSave = false;

      // Reset agent service session (no session ID for entry point)
      this.getAgentService()?.syncConversationState(
        null,
        []
      );

      const messagesEl = this.deps.getMessagesEl();
      messagesEl.empty();

      // Recreate welcome element first (before StatusPanel for consistent ordering)
      const welcomeEl = messagesEl.createDiv({ cls: 'typorai-welcome' });
      welcomeEl.createDiv({ cls: 'typorai-welcome-greeting', text: this.getGreeting() });
      this.deps.setWelcomeEl(welcomeEl);

      // Remount StatusPanel to restore state for new conversation
      this.deps.getStatusPanel()?.remount();

      this.deps.getInputEl().value = '';

      const fileCtx = this.deps.getFileContextManager();
      fileCtx?.resetForNewConversation();
      fileCtx?.autoAttachActiveFile();

      this.deps.getImageContextManager()?.clearImages();
      this.deps.getMcpServerSelector()?.clearEnabled();
      this.deps.clearQueuedMessage();

      this.callbacks.onNewConversation?.();
    } finally {
      state.isCreatingConversation = false;
    }
  }

  /**
   * Loads the current tab conversation, or starts at entry point if none.
   *
   * Entry point (no conversation) shows welcome screen without
   * creating a conversation. Conversation is created lazily on first message.
   */
  async loadActive(): Promise<void> {
    const { plugin, state, renderer } = this.deps;

    const conversationId = state.currentConversationId;
    const conversation = conversationId ? await plugin.getConversationById(conversationId) : null;

    // No active conversation - start at entry point
    if (!conversation) {
      state.currentConversationId = null;
      state.clearMessages();
      state.usage = null;
      state.currentTodos = null;
      state.pendingNewSessionPlan = null;
      state.planFilePath = null;
      state.prePlanPermissionMode = null;
      state.autoScrollEnabled = plugin.settings.enableAutoScroll ?? true;
      state.hasPendingConversationSave = false;

      this.getAgentService()?.syncConversationState(
        null,
        []
      );

      const fileCtx = this.deps.getFileContextManager();
      fileCtx?.resetForNewConversation();
      fileCtx?.autoAttachActiveFile();

      this.deps.getMcpServerSelector()?.clearEnabled();

      const welcomeEl = renderer.renderMessages(
        [],
        () => this.getGreeting()
      );
      this.deps.setWelcomeEl(welcomeEl);
      this.updateWelcomeVisibility();

      this.callbacks.onConversationLoaded?.();
      return;
    }

    await this.deps.ensureServiceForConversation?.(conversation);
    this.restoreConversation(conversation, { autoAttachFile: true });
    this.updateWelcomeVisibility();

    this.callbacks.onConversationLoaded?.();
  }

  /** Switches to a different conversation. */
  async switchTo(id: string): Promise<void> {
    const { plugin, state, subagentManager } = this.deps;

    if (id === state.currentConversationId) return;
    if (state.isStreaming) return;
    if (state.isSwitchingConversation) return;
    if (state.isCreatingConversation) return;

    state.isSwitchingConversation = true;

    try {
      this.deps.dismissPendingInlinePrompts?.();
      await this.save();

      subagentManager.orphanAllActive();
      subagentManager.clear();

      const conversation = await plugin.switchConversation(id);
      if (!conversation) {
        return;
      }

      await this.deps.ensureServiceForConversation?.(conversation);

      this.deps.getInputEl().value = '';
      this.deps.clearQueuedMessage();

      this.restoreConversation(conversation);

      this.deps.getHistoryDropdown()?.removeClass('visible');
      this.updateWelcomeVisibility();

      this.callbacks.onConversationSwitched?.();
    } finally {
      state.isSwitchingConversation = false;
    }
  }

  async rewind(
    userMessageId: string,
    mode: ChatRewindMode = 'code-and-conversation',
  ): Promise<void> {
    const { plugin, state, renderer } = this.deps;

    const agentServiceForCheck = this.getAgentService();
    if (agentServiceForCheck && !agentServiceForCheck.getCapabilities().supportsRewind) {
      new Notice(t('chat.rewind.failed', { error: t('chat.rewind.unsupportedProvider') }));
      return;
    }

    if (state.isStreaming) {
      new Notice(t('chat.rewind.unavailableStreaming'));
      return;
    }

    const msgs = state.messages;
    const userIdx = msgs.findIndex(m => m.id === userMessageId);
    if (userIdx === -1) {
      new Notice(t('chat.rewind.failed', { error: t('chat.rewind.errorMessageNotFound') }));
      return;
    }
    const userMsg = msgs[userIdx];
    if (!userMsg.userMessageId) {
      new Notice(t('chat.rewind.unavailableNoUuid'));
      return;
    }

    const rewindCtx = findRewindContext(msgs, userIdx);
    if (!rewindCtx.hasResponse) {
      new Notice(t('chat.rewind.unavailableNoUuid'));
      return;
    }
    const prevAssistantUuid = rewindCtx.prevAssistantUuid;

    const confirmed = await confirm(
      plugin.app,
      mode === 'conversation'
        ? t('chat.rewind.confirmMessageConversationOnly')
        : t('chat.rewind.confirmMessage'),
      t('chat.rewind.confirmButton')
    );
    if (!confirmed) return;

    if (state.isStreaming) {
      new Notice(t('chat.rewind.unavailableStreaming'));
      return;
    }

    const agentService = this.getAgentService();
    if (!agentService) {
      new Notice(t('chat.rewind.failed', { error: t('chat.input.agentNotAvailable') }));
      return;
    }

    let result;
    try {
      result = await agentService.rewind(userMsg.userMessageId, prevAssistantUuid, mode);
    } catch (e) {
      new Notice(t('chat.rewind.failed', { error: e instanceof Error ? e.message : t('common.unknown') }));
      return;
    }
    if (!result.canRewind) {
      new Notice(t('chat.rewind.cannot', { error: result.error ?? t('common.unknown') }));
      return;
    }

    state.truncateAt(userMessageId);

    const inputEl = this.deps.getInputEl();
    inputEl.value = userMsg.content;
    inputEl.focus();

    const welcomeEl = renderer.renderMessages(state.messages, () => this.getGreeting());
    this.deps.setWelcomeEl(welcomeEl);
    this.updateWelcomeVisibility();

    const filesChanged = result.filesChanged?.length ?? 0;
    let saveError: string | null = null;
    try {
      await this.save(false, {
        resumeAtMessageId: prevAssistantUuid,
        resetProviderSession: !prevAssistantUuid,
      });
    } catch (e) {
      saveError = e instanceof Error ? e.message : t('renderer.history.saveFailed');
    }

    if (saveError) {
      new Notice(
        mode === 'conversation'
          ? t('chat.rewind.noticeConversationOnlySaveFailed', { error: saveError })
          : t('chat.rewind.noticeSaveFailed', { count: String(filesChanged), error: saveError })
      );
      return;
    }

    new Notice(
      mode === 'conversation'
        ? t('chat.rewind.noticeConversationOnly')
        : t('chat.rewind.notice', { count: String(filesChanged) })
    );
  }

  /**
   * Saves the current conversation.
   *
   * If we're at an entry point (no conversation yet) and have messages,
   * creates a new conversation first (lazy creation).
   *
   * For native sessions (new conversations with sessionId from SDK),
   * only metadata is saved - the SDK handles message persistence.
   */
  async save(updateLastResponse = false, options?: SaveOptions): Promise<void> {
    const { plugin, state } = this.deps;

    // Entry point with no messages - nothing to save
    if (!state.currentConversationId && state.messages.length === 0) {
      return;
    }

    const agentService = this.getAgentService();
    const sessionInvalidated = agentService?.consumeSessionInvalidation?.() ?? false;

    // Entry point with messages - create conversation lazily
    // New conversations always use SDK-native storage.
    if (!state.currentConversationId && state.messages.length > 0) {
      const initialSessionId = agentService?.getSessionId() ?? undefined;
      const conversation = await plugin.createConversation({
        providerId: agentService?.providerId,
        sessionId: initialSessionId,
      });
      state.currentConversationId = conversation.id;
    }

    const fileCtx = this.deps.getFileContextManager();
    const currentNote = fileCtx?.getCurrentNotePath() || undefined;
    const mcpServerSelector = this.deps.getMcpServerSelector();
    const enabledMcpServers = mcpServerSelector ? Array.from(mcpServerSelector.getEnabledServers()) : [];

    const conversation = plugin.getConversationSync(state.currentConversationId!);

    const { updates: sessionUpdates } = agentService && !options?.resetProviderSession
      ? agentService.buildSessionUpdates({ conversation, sessionInvalidated })
      : { updates: {} };

    const updates: Partial<Conversation> = {
      ...sessionUpdates,
      messages: state.messages,
      currentNote: currentNote,
      usage: state.usage ?? undefined,
      enabledMcpServers: enabledMcpServers.length > 0 ? enabledMcpServers : undefined,
    };

    if (updateLastResponse) {
      updates.lastResponseAt = Date.now();
    }

    if (options) {
      updates.resumeAtMessageId = options.resumeAtMessageId;
      if (options.resetProviderSession) {
        updates.sessionId = null;
        updates.providerState = undefined;
      }
    }

    await plugin.updateConversation(state.currentConversationId!, updates);
    state.hasPendingConversationSave = false;
  }

  /**
   * Shared logic for restoring a conversation into the current tab.
   * Used by both loadActive() and switchTo() to avoid duplication.
   */
  private restoreConversation(
    conversation: Conversation,
    options?: { autoAttachFile?: boolean }
  ): void {
    const { plugin, state, renderer } = this.deps;

    state.currentConversationId = conversation.id;
    state.messages = [...conversation.messages];
    state.usage = conversation.usage ?? null;
    state.autoScrollEnabled = plugin.settings.enableAutoScroll ?? true;
    state.hasPendingConversationSave = false;

    // Clear status panels (auto-hide: panels reappear when agent creates new todos)
    state.currentTodos = null;

    const hasMessages = state.messages.length > 0;

    // Restore persisted external paths together with the provider session.
    // Passing an empty array here made a loaded/switched conversation lose its
    // file context even though Tab initialization had already made it available.
    this.getAgentService()?.syncConversationState(
      conversation,
      conversation.externalContextPaths ?? []
    );

    const fileCtx = this.deps.getFileContextManager();
    fileCtx?.resetForLoadedConversation(hasMessages);

    if (conversation.currentNote) {
      fileCtx?.setCurrentNote(conversation.currentNote);
    } else if (!hasMessages && options?.autoAttachFile) {
      fileCtx?.autoAttachActiveFile();
    }

    const mcpServerSelector = this.deps.getMcpServerSelector();
    if (conversation.enabledMcpServers && conversation.enabledMcpServers.length > 0) {
      mcpServerSelector?.setEnabledServers(conversation.enabledMcpServers);
    } else {
      mcpServerSelector?.clearEnabled();
    }

    const welcomeEl = renderer.renderMessages(
      state.messages,
      () => this.getGreeting()
    );
    this.deps.setWelcomeEl(welcomeEl);
  }

  // ============================================
  // History Dropdown
  // ============================================

  toggleHistoryDropdown(): void {
    const dropdown = this.deps.getHistoryDropdown();
    if (!dropdown) return;

    const isVisible = dropdown.hasClass('visible');
    if (isVisible) {
      dropdown.removeClass('visible');
    } else {
      this.updateHistoryDropdown();
      dropdown.addClass('visible');
    }
  }

  updateHistoryDropdown(): void {
    const dropdown = this.deps.getHistoryDropdown();
    if (!dropdown) return;

    this.renderHistoryItems(dropdown, {
      onSelectConversation: (id) => this.switchTo(id),
      onRerender: () => this.updateHistoryDropdown(),
    });
  }

  /**
   * Renders history dropdown items to a container.
   * Shared implementation for updateHistoryDropdown() and renderHistoryDropdown().
   */
  private renderHistoryItems(
    container: HTMLElement,
    options: HistoryRenderOptions
  ): void {
    const { plugin, state } = this.deps;

    container.empty();

    const dropdownHeader = container.createDiv({ cls: 'typorai-history-header' });
    dropdownHeader.createSpan({ text: t('renderer.history.header') });

    const list = container.createDiv({ cls: 'typorai-history-list' });
    const allConversations = plugin.getConversationList();

    if (allConversations.length === 0) {
      list.createDiv({ cls: 'typorai-history-empty', text: t('renderer.history.empty') });
      return;
    }

    // Sort by lastResponseAt (fallback to createdAt) descending
    const conversations = [...allConversations].sort((a, b) => {
      return (b.lastResponseAt ?? b.createdAt) - (a.lastResponseAt ?? a.createdAt);
    });

    for (const conv of conversations) {
      const fallbackOpenState: HistoryConversationOpenState =
        conv.id === state.currentConversationId ? 'current' : 'closed';
      const conversationStatus = this.getHistoryConversationStatus(conv.id, fallbackOpenState, options);
      const { openState, isRunning } = conversationStatus;
      const isCurrent = openState === 'current';
      const isOpen = openState === 'open';
      const item = list.createDiv({
        cls: [
          'typorai-history-item',
          isCurrent ? 'active' : '',
          isOpen ? 'open' : '',
          isRunning ? 'running' : '',
        ].filter(Boolean).join(' '),
      });
      item.setAttribute('data-open-state', openState);
      item.setAttribute('data-running', isRunning ? 'true' : 'false');
      item.setAttribute('data-tab-location', conversationStatus.location ?? 'current-view');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      if (typeof conversationStatus.tabIndex === 'number') {
        item.setAttribute('data-tab-index', String(conversationStatus.tabIndex));
      }

      const iconEl = item.createDiv({ cls: 'typorai-history-item-icon' });
      setIcon(iconEl, this.getHistoryItemIcon(openState, isRunning));

      const content = item.createDiv({ cls: 'typorai-history-item-content' });
      const titleEl = content.createDiv({ cls: 'typorai-history-item-title', text: conv.title });
      setTyporAiTooltip(titleEl, conv.title);
      content.createDiv({
        cls: 'typorai-history-item-date',
        text: this.getHistoryItemStatusText(conversationStatus, conv.lastResponseAt ?? conv.createdAt),
      });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isHistoryNewTabModifierClick(e) && options.onOpenConversationInNewTab) {
          e.preventDefault();
          runConversationAction(
            () => this.runHistoryAction(
              () => options.onOpenConversationInNewTab?.(conv.id, true),
              t('renderer.history.loadFailed'),
            ),
            t('renderer.history.loadFailed'),
          );
          return;
        }

        runConversationAction(
          () => this.runHistoryAction(
            () => options.onSelectConversation(conv.id),
            t('renderer.history.loadFailed'),
          ),
          t('renderer.history.loadFailed'),
        );
      });
      item.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        runConversationAction(
          () => this.runHistoryAction(
            () => options.onSelectConversation(conv.id),
            t('renderer.history.loadFailed'),
          ),
          t('renderer.history.loadFailed'),
        );
      });

      if (options.onOpenConversationInNewTab) {
        item.addEventListener('auxclick', (e) => {
          if (e.button !== 1) return;
            e.preventDefault();
          e.stopPropagation();
          runConversationAction(
            () => this.runHistoryAction(
              () => options.onOpenConversationInNewTab?.(conv.id, true),
              t('renderer.history.loadFailed'),
            ),
            t('renderer.history.loadFailed'),
          );
        });
      }

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showHistoryContextMenu(item, conv.id, conv.title, isCurrent, options, e);
      });

      const actions = item.createDiv({ cls: 'typorai-history-item-actions' });

      // Show regenerate button if title generation failed, or loading indicator if pending
      if (conv.titleGenerationStatus === 'pending') {
        const loadingEl = actions.createEl('span', { cls: 'typorai-action-btn typorai-action-loading' });
        setIcon(loadingEl, 'loader-2');
        loadingEl.setAttribute('aria-label', t('renderer.history.generatingAria'));
      } else if (conv.titleGenerationStatus === 'failed') {
        const regenerateBtn = actions.createEl('button', { cls: 'typorai-action-btn' });
        setIcon(regenerateBtn, 'refresh-cw');
        regenerateBtn.setAttribute('aria-label', t('renderer.history.regenerateAria'));
        regenerateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runConversationAction(
            () => this.regenerateTitle(conv.id),
            t('renderer.history.regenerateFailed'),
          );
        });
      }

      if (openState === 'closed' && options.onOpenConversationInNewTab) {
        const openInNewTabBtn = actions.createEl('button', {
          cls: 'typorai-action-btn typorai-open-new-tab-btn',
        });
        setIcon(openInNewTabBtn, 'square-plus');
        openInNewTabBtn.setAttribute('aria-label', t('renderer.history.openInNewTabAria'));
        openInNewTabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runConversationAction(
            () => this.runHistoryAction(
              () => options.onOpenConversationInNewTab?.(conv.id, true),
              t('renderer.history.loadFailed'),
            ),
            t('renderer.history.loadFailed'),
          );
        });
      }

      const renameBtn = actions.createEl('button', { cls: 'typorai-action-btn' });
      setIcon(renameBtn, 'pencil');
      renameBtn.setAttribute('aria-label', t('renderer.history.renameAria'));
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRenameInput(item, conv.id, conv.title);
      });

      const deleteBtn = actions.createEl('button', { cls: 'typorai-action-btn typorai-delete-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('aria-label', t('renderer.history.deleteAria'));
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        runConversationAction(
          () => this.runHistoryAction(
            () => this.deleteHistoryConversation(conv.id, options),
            t('renderer.history.deleteFailed'),
          ),
          t('renderer.history.deleteFailed'),
        );
      });
    }
  }

  private getHistoryConversationStatus(
    conversationId: string,
    fallbackOpenState: HistoryConversationOpenState,
    options: HistoryRenderOptions,
  ): HistoryConversationStatus {
    const status = options.getConversationStatus?.(conversationId);
    if (status) return status;

    return {
      openState: options.getConversationOpenState?.(conversationId) ?? fallbackOpenState,
      isRunning: false,
    };
  }

  private getHistoryItemStatusText(
    status: HistoryConversationStatus,
    timestamp: number,
  ): string {
    const { openState, isRunning } = status;
    const location = status.location ?? 'current-view';

    if (openState !== 'closed' && location === 'other-view') {
      return isRunning ? t('renderer.history.runningInAnotherPane') : t('renderer.history.openInAnotherPane');
    }

    if (isRunning) {
      if (openState === 'closed') return t('renderer.history.running');
      return t('renderer.history.runningInTab', { tab: this.getHistoryTabLabel(status) });
    }

    switch (openState) {
      case 'current':
        return typeof status.tabIndex === 'number'
          ? t('renderer.history.currentTabIndex', { index: status.tabIndex })
          : t('renderer.history.currentSession');
      case 'open':
        return t('renderer.history.openInTab', { tab: this.getHistoryTabLabel(status) });
      case 'closed':
        return this.formatDate(timestamp);
    }
  }

  private getHistoryTabLabel(status: HistoryConversationStatus): string {
    if (typeof status.tabIndex === 'number') {
      return t('renderer.history.tabIndex', { index: status.tabIndex });
    }

    if (status.openState === 'current') {
      return t('renderer.history.currentTab');
    }

    return t('renderer.history.tab');
  }

  private getHistoryItemIcon(
    openState: HistoryConversationOpenState,
    isRunning: boolean,
  ): string {
    if (isRunning) return 'loader-2';
    if (openState === 'current') return 'message-square-dot';
    return 'message-square';
  }

  private isHistoryNewTabModifierClick(event: MouseEvent): boolean {
    return !event.altKey && !event.shiftKey && (event.metaKey || event.ctrlKey);
  }

  private async runHistoryAction(
    action: () => Promise<void> | void,
    errorMessage: string,
  ): Promise<void> {
    try {
      await action();
    } catch {
      new Notice(errorMessage);
    }
  }

  private showHistoryContextMenu(
    item: HTMLElement,
    conversationId: string,
    title: string,
    isCurrent: boolean,
    options: HistoryRenderOptions,
    event: MouseEvent,
  ): void {
    const menu = new Menu();
    const fallbackOpenState: HistoryConversationOpenState = isCurrent ? 'current' : 'closed';
    const { openState } = this.getHistoryConversationStatus(conversationId, fallbackOpenState, options);

    if (openState !== 'current') {
      if (openState === 'closed' && options.onOpenConversationInNewTab) {
        menu.addItem((menuItem) => menuItem
          .setTitle(t('renderer.history.openInNewTab'))
          .onClick(() => {
            void this.runHistoryAction(
              () => options.onOpenConversationInNewTab?.(conversationId, true),
              t('renderer.history.loadFailed'),
            );
          }));
        menu.addItem((menuItem) => menuItem
          .setTitle(t('renderer.history.openInBackgroundTab'))
          .onClick(() => {
            void this.runHistoryAction(
              () => options.onOpenConversationInNewTab?.(conversationId, false),
              t('renderer.history.loadFailed'),
            );
          }));
      } else if (openState === 'open') {
        menu.addItem((menuItem) => menuItem
          .setTitle(t('renderer.history.switchToOpenSession'))
          .onClick(() => {
            void this.runHistoryAction(
              () => options.onSelectConversation(conversationId),
              t('renderer.history.loadFailed'),
            );
          }));
      }
    }

    menu.addItem((menuItem) => menuItem
      .setTitle(t('renderer.history.rename'))
      .onClick(() => {
        this.showRenameInput(item, conversationId, title);
      }));
    menu.addItem((menuItem) => menuItem
      .setTitle(t('renderer.history.delete'))
      .onClick(() => {
        void this.runHistoryAction(
          () => this.deleteHistoryConversation(conversationId, options),
          t('renderer.history.deleteFailed'),
        );
      }));

    menu.showAtMouseEvent(event);
  }

  private async deleteHistoryConversation(
    conversationId: string,
    options: HistoryRenderOptions,
  ): Promise<void> {
    const { plugin, state } = this.deps;
    if (state.isStreaming) return;

    await plugin.deleteConversation(conversationId);
    options.onRerender();

    if (conversationId === state.currentConversationId) {
      await this.loadActive();
    }
  }

  /** Shows inline rename input for a conversation. */
  private showRenameInput(item: HTMLElement, convId: string, currentTitle: string): void {
    const titleEl = item.querySelector('.typorai-history-item-title') as HTMLElement;
    if (!titleEl) return;

    const input = (item.ownerDocument ?? window.document).createElement('input');
    input.type = 'text';
    input.className = 'typorai-rename-input';
    input.value = currentTitle;

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = async () => {
      try {
        const newTitle = input.value.trim() || currentTitle;
        await this.deps.plugin.renameConversation(convId, newTitle);
        this.updateHistoryDropdown();
      } catch {
        new Notice(t('chat.renameFailed'));
      }
    };

    input.addEventListener('blur', () => {
      runConversationAction(finishRename, t('chat.renameFailed'));
    });
    input.addEventListener('keydown', (e) => {
      // Check !e.isComposing for IME support (Chinese, Japanese, Korean, etc.)
      if (e.key === 'Enter' && !e.isComposing) {
        input.blur();
      } else if (e.key === 'Escape' && !e.isComposing) {
        input.value = currentTitle;
        input.blur();
      }
    });
  }

  // ============================================
  // Welcome & Greeting
  // ============================================

  /** Generates a dynamic greeting based on time/day. */
  getGreeting(): string {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const name = this.deps.plugin.settings.userName?.trim();

    type GreetingKey =
      | 'renderer.greeting.day.sun'
      | 'renderer.greeting.day.mon'
      | 'renderer.greeting.day.tue'
      | 'renderer.greeting.day.wed'
      | 'renderer.greeting.day.thu'
      | 'renderer.greeting.day.fri'
      | 'renderer.greeting.day.sat'
      | 'renderer.greeting.morning'
      | 'renderer.greeting.afternoon'
      | 'renderer.greeting.evening'
      | 'renderer.greeting.night'
      | 'renderer.greeting.general';

    const dayKeys: GreetingKey[] = [
      'renderer.greeting.day.sun',
      'renderer.greeting.day.mon',
      'renderer.greeting.day.tue',
      'renderer.greeting.day.wed',
      'renderer.greeting.day.thu',
      'renderer.greeting.day.fri',
      'renderer.greeting.day.sat',
    ];

    const pickFromArray = (key: GreetingKey): string => {
      const arr = tArray(key);
      if (arr.length === 0) return '';
      return arr[Math.floor(Math.random() * arr.length)];
    };

    // Helper to optionally personalize a greeting
    const personalize = (g: string, noNameFallback?: string): string => {
      const hasNamePlaceholder = g.includes('{name}');
      const result = name ? g.replace(/\{name\}/g, name) : g;
      if (hasNamePlaceholder && noNameFallback) return noNameFallback;
      return result;
    };

    // Combine day + time + general greetings
    const dayGreeting = personalize(pickFromArray(dayKeys[day]));
    let timePool: GreetingKey[];
    if (hour >= 5 && hour < 12) {
      timePool = ['renderer.greeting.morning', 'renderer.greeting.morning'];
    } else if (hour >= 12 && hour < 18) {
      timePool = ['renderer.greeting.afternoon', 'renderer.greeting.afternoon', 'renderer.greeting.afternoon'];
    } else if (hour >= 18 && hour < 22) {
      timePool = ['renderer.greeting.evening', 'renderer.greeting.evening', 'renderer.greeting.evening'];
    } else {
      timePool = ['renderer.greeting.night', 'renderer.greeting.evening'];
    }
    const timeGreeting = personalize(pickFromArray(timePool[Math.floor(Math.random() * timePool.length)]));

    const generalGreeting = personalize(pickFromArray('renderer.greeting.general'));

    const options = [dayGreeting, timeGreeting, generalGreeting].filter(g => g.length > 0);
    return options[Math.floor(Math.random() * options.length)];
  }

  /** Updates welcome element visibility based on message count. */
  updateWelcomeVisibility(): void {
    const welcomeEl = this.deps.getWelcomeEl();
    if (!welcomeEl) return;

    if (this.deps.state.messages.length === 0) {
      welcomeEl.removeClass('typorai-hidden');
    } else {
      welcomeEl.addClass('typorai-hidden');
    }
  }

  /**
   * Initializes the welcome greeting for a new tab without a conversation.
   * Called when a new tab is activated and has no conversation loaded.
   */
  initializeWelcome(): void {
    const welcomeEl = this.deps.getWelcomeEl();
    if (!welcomeEl) return;

    // Initialize file context to auto-attach the currently focused note
    const fileCtx = this.deps.getFileContextManager();
    fileCtx?.resetForNewConversation();
    fileCtx?.autoAttachActiveFile();

    // Only add greeting if not already present
    if (!welcomeEl.querySelector('.typorai-welcome-greeting')) {
      welcomeEl.createDiv({ cls: 'typorai-welcome-greeting', text: this.getGreeting() });
    }

    this.updateWelcomeVisibility();
  }

  // ============================================
  // Utilities
  // ============================================

  /** Generates a fallback title from the first message (used when AI fails). */
  generateFallbackTitle(firstMessage: string): string {
    const firstSentence = firstMessage.split(/[.!?\n]/)[0].trim();
    const autoTitle = firstSentence.substring(0, 50);
    const suffix = firstSentence.length > 50 ? '...' : '';
    return `${autoTitle}${suffix}`;
  }

  /** Regenerates AI title for a conversation. */
  async regenerateTitle(conversationId: string): Promise<void> {
    const { plugin } = this.deps;
    if (!plugin.settings.enableAutoTitleGeneration) return;

    // Title generation is delegated to the active provider service
    const fullConv = await plugin.getConversationById(conversationId);
    if (!fullConv || fullConv.messages.length < 1) return;

    const titleService = this.deps.getTitleGenerationService();
    if (!titleService) return;

    // Find first user message by role (not by index)
    const firstUserMsg = fullConv.messages.find(m => m.role === 'user');
    if (!firstUserMsg) return;

    const userContent = firstUserMsg.displayContent
      ?? extractUserDisplayContent(firstUserMsg.content)
      ?? firstUserMsg.content;

    // Store current title to check if user renames during generation
    const expectedTitle = fullConv.title;

    // Set pending status before starting generation
    await plugin.updateConversation(conversationId, { titleGenerationStatus: 'pending' });
    this.updateHistoryDropdown();

    // Fire async AI title generation
    await titleService.generateTitle(
      conversationId,
      userContent,
      async (convId, result) => {
        // Check if conversation still exists and user hasn't manually renamed
        const currentConv = await plugin.getConversationById(convId);
        if (!currentConv) return;

        // Only apply AI title if user hasn't manually renamed (title still matches expected)
        const userManuallyRenamed = currentConv.title !== expectedTitle;

        if (result.success && !userManuallyRenamed) {
          await plugin.renameConversation(convId, result.title);
          await plugin.updateConversation(convId, { titleGenerationStatus: 'success' });
        } else if (!userManuallyRenamed) {
          // Keep existing title, mark as failed (only if user hasn't renamed)
          await plugin.updateConversation(convId, { titleGenerationStatus: 'failed' });
        } else {
          // User manually renamed, clear the status (user's choice takes precedence)
          await plugin.updateConversation(convId, { titleGenerationStatus: undefined });
        }
        this.updateHistoryDropdown();
      }
    );
  }

  /** Formats a timestamp for display. */
  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ============================================
  // History Dropdown Rendering (for TyporAiView)
  // ============================================

  /**
   * Renders the history dropdown content to a provided container.
   * Used by TyporAiView to render the dropdown with custom selection callback.
   */
  renderHistoryDropdown(
    container: HTMLElement,
    options: Omit<HistoryRenderOptions, 'onRerender'>,
  ): void {
    this.renderHistoryItems(container, {
      ...options,
      onRerender: () => this.renderHistoryDropdown(container, options),
    });
  }
}


