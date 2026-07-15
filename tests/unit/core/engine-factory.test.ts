import { createAgentEngine, DEFAULT_TYPORA_ENGINE_SETTINGS, loadTyporaEngineSettings, saveTyporaEngineSettings } from '@/core/engine-factory';
import { ApiEngine } from '@/engines/api-engine/ApiEngine';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Typora engine settings', () => {
  it('loads defaults when storage is empty', () => {
    expect(loadTyporaEngineSettings(new MemoryStorage())).toEqual(DEFAULT_TYPORA_ENGINE_SETTINGS);
  });

  it('persists settings to storage and loads them back', () => {
    const storage = new MemoryStorage();
    const settings = {
      ...DEFAULT_TYPORA_ENGINE_SETTINGS,
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.example.test/messages',
      apiModel: 'model-a',
    };

    saveTyporaEngineSettings(settings, storage);

    expect(loadTyporaEngineSettings(storage)).toEqual(settings);
  });

  it('ignores obsolete persisted CLI mode fields', () => {
    const storage = new MemoryStorage();
    storage.setItem('typorai.typora.settings', JSON.stringify({
      apiKey: 'test-key',
      cliArgs: '--json',
      cliPath: 'codex',
      mode: 'cli',
    }));

    expect(loadTyporaEngineSettings(storage)).toEqual({
      ...DEFAULT_TYPORA_ENGINE_SETTINGS,
      apiKey: 'test-key',
    });
  });
});

describe('createAgentEngine', () => {
  it('creates API engines', () => {
    expect(createAgentEngine(DEFAULT_TYPORA_ENGINE_SETTINGS)).toBeInstanceOf(ApiEngine);
  });
});
