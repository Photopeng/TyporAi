import * as fs from 'fs';
import * as nodePath from 'path';

import type { ExitPlanModeDecision } from '../../../core/types/tools';
import { t } from '../../../i18n/i18n';
import type { RenderContentFn } from './MessageRenderer';

const HINTS_TEXT = t('renderer.plan.hints');

export class InlineExitPlanMode {
  private containerEl: HTMLElement;
  private input: Record<string, unknown>;
  private resolveCallback: (decision: ExitPlanModeDecision | null) => void;
  private resolved = false;
  private signal?: AbortSignal;
  private renderContent?: RenderContentFn;
  private planPathPrefix?: string;
  private planContent: string | null = null;
  private planReadError: string | null = null;

  private rootEl!: HTMLElement;
  private focusedIndex = 0;
  private items: HTMLElement[] = [];
  private feedbackInput!: HTMLInputElement;
  private isInputFocused = false;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private abortHandler: (() => void) | null = null;

  constructor(
    containerEl: HTMLElement,
    input: Record<string, unknown>,
    resolve: (decision: ExitPlanModeDecision | null) => void,
    signal?: AbortSignal,
    renderContent?: RenderContentFn,
    planPathPrefix?: string,
  ) {
    this.containerEl = containerEl;
    this.input = input;
    this.resolveCallback = resolve;
    this.signal = signal;
    this.renderContent = renderContent;
    this.planPathPrefix = planPathPrefix;
    this.boundKeyDown = (event) => this.handleKeyDown(event);
  }

  render(): void {
    this.rootEl = this.containerEl.createDiv({ cls: 'typorai-plan-approval-inline' });

    const titleEl = this.rootEl.createDiv({ cls: 'typorai-plan-inline-title' });
    titleEl.setText(t('renderer.plan.title'));

    this.planContent = this.readPlanContent();
    if (this.planContent) {
      const contentEl = this.rootEl.createDiv({ cls: 'typorai-plan-content-preview' });
      if (this.renderContent) {
        void this.renderContent(contentEl, this.planContent);
      } else {
        contentEl.createDiv({ cls: 'typorai-plan-content-text', text: this.planContent });
      }
    } else if (this.planReadError) {
      this.rootEl.createDiv({
        cls: 'typorai-plan-content-preview typorai-plan-read-error',
        text: t('renderer.plan.readError', { error: this.planReadError }),
      });
    }

    const allowedPrompts = this.input.allowedPrompts as Array<{ tool: string; prompt: string }> | undefined;
    if (allowedPrompts && Array.isArray(allowedPrompts) && allowedPrompts.length > 0) {
      const permEl = this.rootEl.createDiv({ cls: 'typorai-plan-permissions' });
      permEl.createDiv({ text: t('renderer.plan.requestedPermissions'), cls: 'typorai-plan-permissions-label' });
      const listEl = permEl.createEl('ul', { cls: 'typorai-plan-permissions-list' });
      for (const perm of allowedPrompts) {
        listEl.createEl('li', { text: perm.prompt });
      }
    }

    const actionsEl = this.rootEl.createDiv({ cls: 'typorai-ask-list' });

    const newSessionRow = actionsEl.createDiv({ cls: 'typorai-ask-item' });
    newSessionRow.addClass('is-focused');
    newSessionRow.createSpan({ text: '\u203A', cls: 'typorai-ask-cursor' });
    newSessionRow.createSpan({ text: '1. ', cls: 'typorai-ask-item-num' });
    newSessionRow.createSpan({ text: t('renderer.plan.approveNewSession'), cls: 'typorai-ask-item-label' });
    newSessionRow.addEventListener('click', () => {
      this.focusedIndex = 0;
      this.updateFocus();
      this.handleResolve({
        type: 'approve-new-session',
        planContent: this.extractPlanContent(),
      });
    });
    this.items.push(newSessionRow);

    const approveRow = actionsEl.createDiv({ cls: 'typorai-ask-item' });
    approveRow.createSpan({ text: '\u00A0', cls: 'typorai-ask-cursor' });
    approveRow.createSpan({ text: '2. ', cls: 'typorai-ask-item-num' });
    approveRow.createSpan({ text: t('renderer.plan.approveCurrentSession'), cls: 'typorai-ask-item-label' });
    approveRow.addEventListener('click', () => {
      this.focusedIndex = 1;
      this.updateFocus();
      this.handleResolve({ type: 'approve' });
    });
    this.items.push(approveRow);

    const feedbackRow = actionsEl.createDiv({ cls: 'typorai-ask-item typorai-ask-custom-item' });
    feedbackRow.createSpan({ text: '\u00A0', cls: 'typorai-ask-cursor' });
    feedbackRow.createSpan({ text: '3. ', cls: 'typorai-ask-item-num' });
    this.feedbackInput = feedbackRow.createEl('input', {
      type: 'text',
      cls: 'typorai-ask-custom-text',
      placeholder: t('renderer.plan.feedbackPlaceholder'),
    });
    this.feedbackInput.addEventListener('focus', () => { this.isInputFocused = true; });
    this.feedbackInput.addEventListener('blur', () => { this.isInputFocused = false; });
    feedbackRow.addEventListener('click', () => {
      this.focusedIndex = 2;
      this.updateFocus();
    });
    this.items.push(feedbackRow);

    this.rootEl.createDiv({ text: HINTS_TEXT, cls: 'typorai-ask-hints' });

    this.rootEl.setAttribute('tabindex', '0');
    this.rootEl.addEventListener('keydown', this.boundKeyDown);

    window.requestAnimationFrame(() => {
      this.rootEl.focus();
      this.rootEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    if (this.signal) {
      this.abortHandler = () => this.handleResolve(null);
      this.signal.addEventListener('abort', this.abortHandler, { once: true });
    }
  }

  destroy(): void {
    this.handleResolve(null);
  }

  private readPlanContent(): string | null {
    const suppliedContent = this.input.planContent;
    if (typeof suppliedContent === 'string' && suppliedContent.trim()) {
      return suppliedContent.trim();
    }
    const planFilePath = this.input.planFilePath as string | undefined;
    if (!planFilePath) return null;

    const resolved = nodePath.resolve(planFilePath).replace(/\\/g, '/');
    if (!this.planPathPrefix || !resolved.includes(this.planPathPrefix)) {
      this.planReadError = 'path outside allowed plan directory';
      return null;
    }

    try {
      const content = fs.readFileSync(planFilePath, 'utf-8');
      return content.trim() || null;
    } catch (err) {
      this.planReadError = err instanceof Error ? err.message : 'unknown error';
      return null;
    }
  }

  private extractPlanContent(): string {
    if (this.planContent) {
      return `Implement this plan:\n\n${this.planContent}`;
    }
    return 'Implement the approved plan.';
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isInputFocused) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.isInputFocused = false;
        this.feedbackInput.blur();
        this.rootEl.focus();
        return;
      }
      if (e.key === 'Enter' && this.feedbackInput.value.trim()) {
        e.preventDefault();
        e.stopPropagation();
        this.handleResolve({ type: 'feedback', text: this.feedbackInput.value.trim() });
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.focusedIndex = Math.min(this.focusedIndex + 1, this.items.length - 1);
        this.updateFocus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
        this.updateFocus();
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (this.focusedIndex === 0) {
          this.handleResolve({
            type: 'approve-new-session',
            planContent: this.extractPlanContent(),
          });
        } else if (this.focusedIndex === 1) {
          this.handleResolve({ type: 'approve' });
        } else if (this.focusedIndex === 2) {
          this.feedbackInput.focus();
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.handleResolve(null);
        break;
    }
  }

  private updateFocus(): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const cursor = item.querySelector('.typorai-ask-cursor');
      if (i === this.focusedIndex) {
        item.addClass('is-focused');
        if (cursor) cursor.textContent = '\u203A';
        item.scrollIntoView({ block: 'nearest' });

        if (item.hasClass('typorai-ask-custom-item')) {
          const input = item.querySelector('.typorai-ask-custom-text') as HTMLInputElement;
          if (input) {
            input.focus();
            this.isInputFocused = true;
          }
        }
      } else {
        item.removeClass('is-focused');
        if (cursor) cursor.textContent = '\u00A0';

        if (item.hasClass('typorai-ask-custom-item')) {
          const input = item.querySelector('.typorai-ask-custom-text') as HTMLInputElement;
          if (input && this.rootEl.ownerDocument.activeElement === input) {
            input.blur();
            this.isInputFocused = false;
          }
        }
      }
    }
  }

  private handleResolve(decision: ExitPlanModeDecision | null): void {
    if (!this.resolved) {
      this.resolved = true;
      this.rootEl?.removeEventListener('keydown', this.boundKeyDown);
      if (this.signal && this.abortHandler) {
        this.signal.removeEventListener('abort', this.abortHandler);
        this.abortHandler = null;
      }
      this.rootEl?.remove();
      this.resolveCallback(decision);
    }
  }
}
