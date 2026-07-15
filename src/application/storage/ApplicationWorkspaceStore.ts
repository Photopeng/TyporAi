import type { FileStore, PathService, WorkspaceStore } from '@/core/ports';

export class ApplicationWorkspaceStore implements WorkspaceStore {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(readonly root: string, private readonly files: FileStore, private readonly paths: PathService) {}

  async readText(relativePath: string): Promise<string | null> {
    const path = this.resolve(relativePath);
    return this.files.exists(path).then(exists => exists ? this.files.readText(path) : null);
  }

  writeText(relativePath: string, value: string): Promise<void> {
    return this.enqueue(relativePath, () => this.files.writeAtomic(this.resolve(relativePath), value));
  }

  appendText(relativePath: string, value: string): Promise<void> {
    return this.enqueue(relativePath, async () => {
      const path = this.resolve(relativePath);
      const previous = await this.files.exists(path) ? await this.files.readText(path) : '';
      await this.files.writeAtomic(path, previous + value);
    });
  }

  private enqueue(relativePath: string, operation: () => Promise<void>): Promise<void> {
    const path = this.resolve(relativePath);
    const previous = this.chains.get(path) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    this.chains.set(path, result.then(() => undefined, () => undefined));
    return result;
  }

  private resolve(relativePath: string): string {
    if (!relativePath || this.paths.isAbsolute(relativePath) || /(^|[\\/])\.\.([\\/]|$)/.test(relativePath)) {
      throw new Error(`Workspace path must be relative and contained: ${relativePath}`);
    }
    return this.paths.join(this.root, relativePath);
  }
}
