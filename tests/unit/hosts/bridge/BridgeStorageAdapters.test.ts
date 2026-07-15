import path from 'node:path';

import type { SettingsStorageAdapter } from '@/adapters/settingsStorage';
import type { FileStore, FileWatchService, PathService } from '@/core/ports';
import { BridgeSettingsStorageAdapter } from '@/hosts/bridge/BridgeSettingsStorageAdapter';
import { BridgeWorkspaceAdapter } from '@/hosts/bridge/BridgeWorkspaceAdapter';

describe('BridgeSettingsStorageAdapter', () => {
  it('persists values through FileStore and notifies subscribers', async () => {
    let contents = '{}';
    const files = {
      exists: jest.fn().mockResolvedValue(true),
      readText: jest.fn().mockImplementation(async () => contents),
      writeAtomic: jest.fn().mockImplementation(async (_path: string, data: string) => { contents = data; }),
    } as unknown as FileStore;
    const watch = jest.fn().mockReturnValue(jest.fn());
    const adapter = new BridgeSettingsStorageAdapter('/Users/test/.typora-ai-assistant/config.json', files, { dispose: jest.fn(), watch } as unknown as FileWatchService);
    const onChange = jest.fn();

    adapter.subscribe('locale', onChange);
    await adapter.set('locale', 'zh-CN');

    expect(await adapter.get('locale')).toBe('zh-CN');
    expect(onChange).toHaveBeenCalledWith('zh-CN');
    await Promise.resolve();
    expect(watch).toHaveBeenCalled();
  });
});

describe('BridgeWorkspaceAdapter', () => {
  it('persists roots, creates markers, and rejects paths outside the workspace', async () => {
    const settings: SettingsStorageAdapter = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    };
    const files = {
      ensureDirectory: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      readText: jest.fn(),
      writeAtomic: jest.fn().mockResolvedValue(undefined),
    } as unknown as FileStore;
    const workspace = new BridgeWorkspaceAdapter(settings, files, posixPathService);

    await workspace.setRoot('/Users/test/vault');

    expect(workspace.getRoot()).toBe('/Users/test/vault');
    expect(files.ensureDirectory).toHaveBeenCalledWith('/Users/test/vault/.typora-ai-assistant');
    expect(settings.set).toHaveBeenCalledWith('workspaceRoot', '/Users/test/vault');
    await expect(workspace.resolvePath('../outside.md')).rejects.toThrow(/escapes its root/i);
  });

  it('walks upward through Sidecar file probes to find the marker directory', async () => {
    const files = {
      exists: jest.fn().mockImplementation(async (value: string) => value === '/Users/test/vault/.typora-ai-assistant'),
    } as unknown as FileStore;
    const settings = { get: jest.fn(), set: jest.fn(), subscribe: jest.fn() } as unknown as SettingsStorageAdapter;
    const workspace = new BridgeWorkspaceAdapter(settings, files, posixPathService);

    await expect(workspace.detectRoot('/Users/test/vault/notes/a.md')).resolves.toBe('/Users/test/vault');
  });
});

const posixPathService: PathService = {
  dirname: path.posix.dirname,
  isAbsolute: path.posix.isAbsolute,
  join: path.posix.join,
  normalize: path.posix.normalize,
  relative: path.posix.relative,
};
