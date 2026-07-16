export interface SettingsSnapshot<T extends Record<string, unknown>> {
  readonly revision: number;
  readonly value: Readonly<T>;
}

export class SettingsRevisionConflictError extends Error {
  constructor() { super('Settings revision conflict.'); }
}

export class VersionedSettingsStore<T extends Record<string, unknown>> {
  private revision: number;
  private value: T;

  constructor(initial: T, revision = 0) { this.value = structuredClone(initial); this.revision = revision; }

  getSnapshot(): SettingsSnapshot<T> {
    return { revision: this.revision, value: structuredClone(this.value) };
  }

  applyPatch(patch: Partial<T>, expectedRevision: number, idempotencyKey: string): SettingsSnapshot<T> {
    if (!idempotencyKey) throw new Error('An idempotency key is required.');
    if (expectedRevision !== this.revision) throw new SettingsRevisionConflictError();
    this.value = { ...this.value, ...structuredClone(patch) };
    this.revision += 1;
    return this.getSnapshot();
  }
}
