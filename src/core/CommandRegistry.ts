export interface CommandEntry {
  id: string;
  label: string;
}

export type CommandHandler<TPayload = unknown> = (payload?: TPayload) => void | Promise<void>;

type RegisteredCommand = CommandEntry & {
  handler: CommandHandler;
};

export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>();

  register(id: string, label: string, handler: CommandHandler): void {
    if (!id.trim()) {
      throw new Error('Command id is required.');
    }
    if (this.commands.has(id)) {
      throw new Error(`Command already registered: ${id}`);
    }

    this.commands.set(id, { id, label, handler });
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  async execute<TPayload = unknown>(id: string, payload?: TPayload): Promise<void> {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`Unknown command: ${id}`);
    }

    await command.handler(payload);
  }

  list(): CommandEntry[] {
    return [...this.commands.values()].map(({ id, label }) => ({ id, label }));
  }

  clear(): void {
    this.commands.clear();
  }
}
