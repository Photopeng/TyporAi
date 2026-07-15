import type { FileStore, KeyValueStore } from '@/core/ports';

export class TyporAiSettingsStore implements KeyValueStore {
  private values: Record<string, unknown> | null = null;
  private write: Promise<void> = Promise.resolve();

  constructor(private readonly files: FileStore, private readonly path: string) {}

  async get<T>(key: string): Promise<T | null> { return (await this.load())[key] as T | undefined ?? null; }
  set<T>(key: string, value: T): Promise<void> { return this.change(values => { values[key] = value; }); }
  delete(key: string): Promise<void> { return this.change(values => { delete values[key]; }); }

  private async change(mutator: (values: Record<string, unknown>) => void): Promise<void> {
    const values = await this.load();
    mutator(values);
    this.write = this.write.catch(() => undefined).then(() => this.files.writeAtomic(this.path, JSON.stringify(values, null, 2)));
    return this.write;
  }

  private async load(): Promise<Record<string, unknown>> {
    if (this.values) return this.values;
    if (!await this.files.exists(this.path)) return this.values = {};
    try {
      const parsed: unknown = JSON.parse(await this.files.readText(this.path));
      return this.values = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return this.values = {}; }
  }
}
