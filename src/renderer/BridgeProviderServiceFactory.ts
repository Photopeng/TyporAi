import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type {
  InlineEditRequest,
  InlineEditResult,
  InlineEditService,
  InstructionRefineService,
  ProviderId,
  ProviderServiceFactory,
  RefineProgressCallback,
  TitleGenerationCallback,
  TitleGenerationService,
} from '@/core/providers/types';
import type TyporAiPlugin from '@/main';

import { FullBridgeChatRuntime } from './FullBridgeChatRuntime';

export class BridgeProviderServiceFactory implements ProviderServiceFactory {
  constructor(private readonly rpc: WebSocketRpcClient) {}

  createTitleGenerationService(plugin: TyporAiPlugin, providerId?: ProviderId): TitleGenerationService {
    return new BridgeTitleGenerationService(
      this.rpc,
      providerId ?? ProviderRegistry.resolveTitleGenerationProviderId(plugin.settings),
      plugin,
    );
  }

  createInstructionRefineService(plugin: TyporAiPlugin, providerId: ProviderId): InstructionRefineService {
    return new BridgeInstructionRefineService(this.rpc, providerId, plugin);
  }

  createInlineEditService(plugin: TyporAiPlugin, providerId: ProviderId): InlineEditService {
    return new BridgeInlineEditService(this.rpc, providerId, plugin);
  }
}

abstract class BridgeAuxiliaryService {
  protected runtime: FullBridgeChatRuntime | null = null;
  protected modelOverride: string | undefined;

  constructor(
    protected readonly rpc: WebSocketRpcClient,
    protected readonly providerId: ProviderId,
    private readonly plugin: TyporAiPlugin,
  ) {}

  setModelOverride(model?: string): void { this.modelOverride = model; }
  resetConversation(): void { this.cancel(); }
  cancel(): void { this.runtime?.cancel(); }

  protected async run(prompt: string): Promise<string> {
    this.runtime?.cleanup();
    const runtime = new FullBridgeChatRuntime(this.rpc, this.providerId, this.plugin);
    this.runtime = runtime;
    let output = '';
    try {
      const turn = runtime.prepareTurn({ text: prompt });
      for await (const chunk of runtime.query(turn, [], { model: this.modelOverride })) {
        if (chunk.type === 'text') output += chunk.content;
        if (chunk.type === 'error') throw new Error(chunk.content);
      }
      return output.trim();
    } finally {
      runtime.cleanup();
      if (this.runtime === runtime) this.runtime = null;
    }
  }
}

class BridgeTitleGenerationService extends BridgeAuxiliaryService implements TitleGenerationService {
  async generateTitle(
    conversationId: string,
    userMessage: string,
    callback: TitleGenerationCallback,
  ): Promise<void> {
    try {
      const title = cleanTitle(await this.run(
        `Generate a concise title of at most eight words for the following user request. Return only the title.\n\n${userMessage}`,
      ));
      await callback(conversationId, title
        ? { success: true, title }
        : { success: false, error: 'The provider returned an empty title.' });
    } catch (error) {
      await callback(conversationId, { success: false, error: errorMessage(error) });
    }
  }
}

class BridgeInstructionRefineService extends BridgeAuxiliaryService implements InstructionRefineService {
  private previous = '';

  async refineInstruction(
    rawInstruction: string,
    existingInstructions: string,
    onProgress?: RefineProgressCallback,
  ) {
    try {
      this.previous = `Existing instructions:\n${existingInstructions}\n\nRequested change:\n${rawInstruction}`;
      const refinedInstruction = await this.run(
        `Rewrite the requested change as a precise reusable instruction. Return only the instruction.\n\n${this.previous}`,
      );
      const result = { success: true as const, refinedInstruction };
      onProgress?.(result);
      return result;
    } catch (error) {
      return { success: false as const, error: errorMessage(error) };
    }
  }

  async continueConversation(message: string, onProgress?: RefineProgressCallback) {
    return this.refineInstruction(message, this.previous, onProgress);
  }
}

class BridgeInlineEditService extends BridgeAuxiliaryService implements InlineEditService {
  private lastRequest: InlineEditRequest | null = null;

  async editText(request: InlineEditRequest): Promise<InlineEditResult> {
    this.lastRequest = request;
    const source = request.mode === 'selection'
      ? request.selectedText
      : `${request.cursorContext.beforeCursor}\n<cursor/>\n${request.cursorContext.afterCursor}`;
    try {
      const result = await this.run([
        'Edit the text according to the instruction.',
        'Return only the replacement text without Markdown fences or commentary.',
        `Instruction: ${request.instruction}`,
        `Document path: ${request.notePath}`,
        `Text:\n${source}`,
      ].join('\n\n'));
      return request.mode === 'selection'
        ? { success: true, editedText: result }
        : { success: true, insertedText: result };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  async continueConversation(message: string): Promise<InlineEditResult> {
    if (!this.lastRequest) return { success: false, error: 'No inline edit is active.' };
    return this.editText({ ...this.lastRequest, instruction: `${this.lastRequest.instruction}\n\nFollow-up: ${message}` });
  }
}

function cleanTitle(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/^["'`]|["'`]$/g, '').trim().slice(0, 120);
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
