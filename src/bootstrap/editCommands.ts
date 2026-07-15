import type { HotkeyAdapter } from '../adapters/hotkey';
import type { CommandRegistry } from '../core/CommandRegistry';
export interface EditCommandHost {
  apply(): void;
  accept(blockId: string): void;
  discard(): void;
  preview(instruction?: string): Promise<void>;
  refineBlock(blockId: string, instruction: string): Promise<void>;
  reject(blockId: string): void;
  start(instruction?: string): void;
}

export interface EditCommandRuntime {
  commandRegistry: CommandRegistry;
  hotkey: HotkeyAdapter | null;
}

export function registerEditCommands(
  runtime: EditCommandRuntime,
  controller: EditCommandHost,
): void {
  runtime.commandRegistry.register(
    'edit.start',
    'Start Typora edit mode',
    (payload) => controller.start(resolveInstructionPayload(payload)),
  );
  runtime.commandRegistry.register(
    'edit.preview',
    'Preview Typora edit',
    (payload) => controller.preview(resolveInstructionPayload(payload)),
  );
  runtime.commandRegistry.register(
    'edit.apply',
    'Apply Typora edit',
    () => controller.apply(),
  );
  runtime.commandRegistry.register(
    'edit.acceptBlock',
    'Accept Typora edit block',
    (payload) => {
      const blockId = resolveBlockPayload(payload);
      if (blockId) controller.accept(blockId);
    },
  );
  runtime.commandRegistry.register(
    'edit.rejectBlock',
    'Reject Typora edit block',
    (payload) => {
      const blockId = resolveBlockPayload(payload);
      if (blockId) controller.reject(blockId);
    },
  );
  runtime.commandRegistry.register(
    'edit.refineBlock',
    'Refine Typora edit block',
    (payload) => {
      const refine = resolveRefinePayload(payload);
      if (refine) void controller.refineBlock(refine.blockId, refine.instruction);
    },
  );
  runtime.commandRegistry.register(
    'edit.discard',
    'Discard Typora edit',
    () => controller.discard(),
  );

  runtime.hotkey?.register('editor', 'Ctrl+Shift+E', (event) => {
    event.preventDefault();
    void runtime.commandRegistry.execute('edit.start');
  });
}

function resolveInstructionPayload(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object' && 'instruction' in payload) {
    const instruction = (payload as { instruction?: unknown }).instruction;
    return typeof instruction === 'string' ? instruction : undefined;
  }
  return undefined;
}

function resolveBlockPayload(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object' && 'blockId' in payload) {
    const blockId = (payload as { blockId?: unknown }).blockId;
    return typeof blockId === 'string' ? blockId : undefined;
  }
  return undefined;
}

function resolveRefinePayload(payload: unknown): { blockId: string; instruction: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const value = payload as { blockId?: unknown; instruction?: unknown };
  return typeof value.blockId === 'string' && typeof value.instruction === 'string'
    ? { blockId: value.blockId, instruction: value.instruction }
    : null;
}
