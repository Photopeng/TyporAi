import path from 'node:path';

export class WorkspaceGrantStore {
  private root: string | null = null;

  grant(root: string): string {
    this.root = path.resolve(root);
    return this.root;
  }

  revoke(): void { this.root = null; }
  get current(): string | null { return this.root; }

  contains(target: string): boolean {
    if (!this.root) return false;
    const relative = path.relative(this.root, path.resolve(target));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  require(target: string): string {
    if (!this.contains(target)) throw new Error('WORKSPACE_NOT_GRANTED');
    return path.resolve(target);
  }
}
