import type { CommandRegistry } from '../core/CommandRegistry';

export function getRegisteredCommandRegistry(
  registry: CommandRegistry | null | undefined,
  commandId: string,
): CommandRegistry | null {
  if (!registry?.list().some(command => command.id === commandId)) {
    return null;
  }

  return registry;
}

export async function executeRegisteredCommand<TPayload = unknown>(
  registry: CommandRegistry | null | undefined,
  commandId: string,
  payload?: TPayload,
): Promise<boolean> {
  const resolved = getRegisteredCommandRegistry(registry, commandId);
  if (!resolved) {
    return false;
  }

  await resolved.execute(commandId, payload);
  return true;
}
