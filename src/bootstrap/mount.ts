import { DomHotkeyAdapter } from '../adapters/hotkey';
import { ToastNoticeAdapter } from '../adapters/notice';
import { CommandRegistry } from '../core/CommandRegistry';
import { getTabProviderId } from '../features/chat/tabs/providerResolution';
import { EventBus } from '../shared/EventBus';
import { ConsoleLogger } from '../shared/Logger';
import type { Unsubscribe } from '../shared/types';
import { setNoticeHandler } from '../typora/platform';
import { mountRealTyporAiInTypora, unmountRealTyporAiInTypora } from '../typora/typora-host';
import { TyporaEditModeController } from '../typora/TyporaEditModeController';
import { registerConversationCommands } from './conversationCommands';
import { registerEditCommands } from './editCommands';

const BOOTSTRAP_STYLE_ID = 'typora-ai-assistant-bootstrap-styles';

interface TyporaAiRuntime {
  commandRegistry: CommandRegistry;
  eventBus: EventBus;
  editMode?: TyporaEditModeController | null;
  hotkey: DomHotkeyAdapter | null;
  logger: ConsoleLogger;
  notice: ToastNoticeAdapter;
  disposables: Unsubscribe[];
}

let activeRuntime: TyporaAiRuntime | null = null;

export async function mountApp(): Promise<void> {
  await unmountApp();

  const runtime: TyporaAiRuntime = {
    commandRegistry: new CommandRegistry(),
    editMode: null,
    eventBus: new EventBus(),
    hotkey: null,
    logger: new ConsoleLogger('typora-ai-assistant'),
    notice: new ToastNoticeAdapter(),
    disposables: [],
  };
  activeRuntime = runtime;

  // Wire platform notices to the real Typora toast adapter so the
  // 29 call sites in the codebase actually surface messages. Without this
  // hook, Notice is a no-op and the user sees no feedback for the failures
  // reported in §3.1 of the diagnostic report.
  setNoticeHandler((message, timeout) => {
    runtime.notice.show(message, 'info', timeout && timeout > 0 ? timeout : 3000);
  });

  injectBootstrapStyles();
  const typoraRuntime = await mountRealTyporAiInTypora();
  runtime.hotkey = new DomHotkeyAdapter({
    panelRoot: document.getElementById('typorai-typora-root'),
    editorRoot: document.querySelector<HTMLElement>('#write')
      ?? document.querySelector<HTMLElement>('content'),
  });
  const resolveActiveProviderId = () => {
    const activeTab = typoraRuntime?.view?.getActiveTab?.();
    return activeTab && typoraRuntime?.plugin
      ? getTabProviderId(activeTab, typoraRuntime.plugin)
      : undefined;
  };
  if (typoraRuntime?.view) {
    typoraRuntime.view.setCommandRegistry?.(runtime.commandRegistry);
    typoraRuntime.view.setDocumentSnapshotProvider?.(() => typoraRuntime.editor.getSnapshot());
    registerConversationCommands(runtime, typoraRuntime.view);
  }
  if (typoraRuntime?.plugin) {
    runtime.editMode = new TyporaEditModeController(
      typoraRuntime.plugin,
      document.getElementById('typorai-typora-root') ?? document.body,
      resolveActiveProviderId,
      typoraRuntime.providerServiceFactory ?? undefined,
    );
    registerEditCommands(runtime, runtime.editMode);
  }
}

export async function unmountApp(): Promise<void> {
  const runtime = activeRuntime;
  if (runtime) {
    for (const dispose of runtime.disposables.splice(0)) {
      dispose();
    }
    runtime.editMode?.destroy();
    runtime.hotkey?.unregisterAll();
    runtime.eventBus.clear();
    runtime.commandRegistry.clear();
    runtime.notice.dispose();
    activeRuntime = null;
  }

  await unmountRealTyporAiInTypora();
  document.getElementById(BOOTSTRAP_STYLE_ID)?.remove();
  setNoticeHandler(null);
}

export function injectBootstrapStyles(): void {
  if (document.getElementById(BOOTSTRAP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = BOOTSTRAP_STYLE_ID;
  style.textContent = `
    .typora-ai-toast-container {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 10000;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .typora-ai-toast {
      max-width: 320px;
      padding: 8px 11px;
      border: 1px solid rgba(127, 127, 127, 0.22);
      border-radius: 6px;
      background: #ffffff;
      color: #242424;
      box-shadow: 0 8px 24px rgba(20, 28, 38, 0.12);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .typora-ai-toast-success {
      border-color: rgba(48, 132, 80, 0.35);
    }
    .typora-ai-toast-error {
      border-color: rgba(185, 48, 48, 0.38);
    }
    .typora-edit-mode-prompt {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 10003;
      width: min(360px, calc(100vw - 36px));
      display: flex;
      gap: 8px;
      padding: 8px;
      border: 1px solid rgba(127, 127, 127, 0.24);
      border-radius: 8px;
      background: #fff;
      color: #242424;
      box-shadow: 0 12px 34px rgba(20, 28, 38, 0.16);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body:not(.typorai-typora-panel-hidden) .typora-edit-mode-prompt {
      right: calc(var(--typorai-typora-panel-width, 430px) + 18px);
      width: min(360px, calc(100vw - var(--typorai-typora-panel-width, 430px) - 36px));
    }
    .typora-edit-mode-prompt-input {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      border: 1px solid rgba(127, 127, 127, 0.28);
      border-radius: 6px;
      font: inherit;
    }
    .typora-edit-block {
      display: grid;
      gap: 6px;
      margin: 0.85em 0;
      padding: 8px;
      border: 1px solid rgba(127, 127, 127, 0.22);
      border-radius: 8px;
      background: rgba(127, 127, 127, 0.055);
    }
    .typora-edit-block-original,
    .typora-edit-block-suggestion {
      padding: 8px;
      border: 1px solid rgba(127, 127, 127, 0.2);
      border-radius: 6px;
      white-space: pre-wrap;
    }
    .typora-edit-block-original {
      color: rgba(80, 80, 80, 0.86);
      background: rgba(127, 127, 127, 0.09);
    }
    .typora-edit-block-suggestion {
      outline: none;
      background: rgba(72, 160, 105, 0.12);
      border-color: rgba(72, 160, 105, 0.3);
    }
    .typora-edit-block-suggestion:focus {
      box-shadow: 0 0 0 2px rgba(72, 160, 105, 0.18);
    }
    .typora-edit-block-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
    }
    .typora-edit-block-actions button,
    .typora-edit-mode-prompt-submit {
      padding: 5px 9px;
      border: 1px solid rgba(127, 127, 127, 0.24);
      border-radius: 6px;
      background: #fff;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}
