import { TyporAiSettingsStore } from '@/application/storage/TyporAiSettingsStore';

describe('TyporAiSettingsStore', () => {
  it('recovers from corrupt JSON and serializes writes through one store', async () => {
    let content = '{not json';
    const files = {
      exists: jest.fn(async () => true),
      readText: jest.fn(async () => content),
      writeAtomic: jest.fn(async (_path: string, next: string) => { content = next; }),
    };
    const store = new TyporAiSettingsStore(files as never, '/settings.json');
    expect(await store.get('missing')).toBeNull();
    await Promise.all([store.set('theme', 'dark'), store.set('tabs', ['a'])]);
    expect(JSON.parse(content)).toEqual({ theme: 'dark', tabs: ['a'] });
    await store.delete('theme');
    expect(JSON.parse(content)).toEqual({ tabs: ['a'] });
  });
});
