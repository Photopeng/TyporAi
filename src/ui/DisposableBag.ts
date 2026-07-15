export class DisposableBag {
  private readonly disposers = new Set<() => void>();
  private disposed = false;

  add(dispose: () => void): () => void {
    if (this.disposed) { dispose(); return () => undefined; }
    this.disposers.add(dispose);
    return () => this.disposers.delete(dispose);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    [...this.disposers].reverse().forEach(dispose => dispose());
    this.disposers.clear();
  }
}
