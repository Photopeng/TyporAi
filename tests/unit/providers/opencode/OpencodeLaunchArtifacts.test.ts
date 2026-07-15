import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  OPENCODE_SAFE_MODE_ID,
  OPENCODE_YOLO_MODE_ID,
} from '../../../../src/providers/opencode/modes';
import {
  buildOpencodeManagedConfig,
  prepareOpencodeLaunchArtifacts,
} from '../../../../src/providers/opencode/runtime/OpencodeLaunchArtifacts';

const hostIo = {
  fileStore: {
    exists: async (target: string) => { try { await fs.access(target); return true; } catch { return false; } },
    readText: (target: string) => fs.readFile(target, 'utf8'),
    writeAtomic: async (target: string, data: string) => { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data, 'utf8'); },
    writeBinary: async (target: string, data: Uint8Array) => { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data); },
    remove: (target: string) => fs.rm(target, { force: true, recursive: true }),
    list: async (target: string) => (await fs.readdir(target, { withFileTypes: true })).map(entry => ({ name: entry.name, path: path.join(target, entry.name), kind: entry.isFile() ? 'file' as const : entry.isDirectory() ? 'directory' as const : 'other' as const })),
    stat: async (target: string) => { const value = await fs.stat(target); return { size: value.size, modifiedAtMs: value.mtimeMs, kind: value.isFile() ? 'file' as const : value.isDirectory() ? 'directory' as const : 'other' as const }; },
    rename: (from: string, to: string) => fs.rename(from, to),
    ensureDirectory: async (target: string) => { await fs.mkdir(target, { recursive: true }); },
  },
  pathService: path,
};

describe('buildOpencodeManagedConfig', () => {
  it('pins OpenCode build, YOLO, safe, and plan prompts to the managed prompt file', () => {
    expect(buildOpencodeManagedConfig({}, '/vault/.typorai/opencode/system.md', 'Yishen')).toEqual({
      $schema: 'https://opencode.ai/config.json',
      agent: {
        build: {
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        [OPENCODE_YOLO_MODE_ID]: {
          mode: 'primary',
          permission: {
            plan_enter: 'allow',
            question: 'allow',
          },
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        [OPENCODE_SAFE_MODE_ID]: {
          mode: 'primary',
          permission: {
            bash: 'deny',
            edit: 'deny',
            plan_enter: 'allow',
            question: 'allow',
          },
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        plan: {
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
      },
      username: 'Yishen',
    });
  });

  it('can create a dedicated aux agent and default it for the process', () => {
    expect(buildOpencodeManagedConfig(
      {},
      '/vault/.typorai/opencode/auxiliary/system.md',
      undefined,
      [{
        definition: {
          mode: 'primary',
          permission: {
            '*': 'deny',
            read: 'allow',
          },
        },
        id: 'typorai-aux-readonly',
      }],
      'typorai-aux-readonly',
    )).toEqual({
      $schema: 'https://opencode.ai/config.json',
      agent: {
        'typorai-aux-readonly': {
          mode: 'primary',
          permission: {
            '*': 'deny',
            read: 'allow',
          },
          prompt: '{file:/vault/.typorai/opencode/auxiliary/system.md}',
        },
      },
      default_agent: 'typorai-aux-readonly',
    });
  });

  it('merges the user config instead of replacing it', () => {
    expect(buildOpencodeManagedConfig({
      agent: {
        build: {
          model: 'openai/gpt-5',
          permission: {
            bash: 'deny',
            edit: 'deny',
          },
        },
      },
      default_agent: 'build',
      providers: {
        openai: {
          api_key: 'test-key',
        },
      },
      username: 'Existing',
    }, '/vault/.typorai/opencode/system.md')).toEqual({
      $schema: 'https://opencode.ai/config.json',
      agent: {
        build: {
          model: 'openai/gpt-5',
          permission: {
            bash: 'deny',
            edit: 'deny',
          },
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        [OPENCODE_YOLO_MODE_ID]: {
          mode: 'primary',
          permission: {
            plan_enter: 'allow',
            question: 'allow',
          },
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        [OPENCODE_SAFE_MODE_ID]: {
          mode: 'primary',
          permission: {
            bash: 'deny',
            edit: 'deny',
            plan_enter: 'allow',
            question: 'allow',
          },
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
        plan: {
          prompt: '{file:/vault/.typorai/opencode/system.md}',
        },
      },
      default_agent: 'build',
      providers: {
        openai: {
          api_key: 'test-key',
        },
      },
      username: 'Existing',
    });
  });
});

describe('prepareOpencodeLaunchArtifacts', () => {
  it('layers the managed prompt config on top of OPENCODE_CONFIG', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-opencode-artifacts-'));
    const baseConfigPath = path.join(tmpRoot, 'opencode.base.json');
    await fs.writeFile(baseConfigPath, JSON.stringify({
      agent: {
        build: {
          model: 'openai/gpt-5',
        },
      },
      default_agent: 'build',
      providers: {
        anthropic: {
          api_key: 'anthropic-key',
        },
      },
    }), 'utf8');

    const result = await prepareOpencodeLaunchArtifacts({
      ...hostIo,
      runtimeEnv: {
        HOME: tmpRoot,
        OPENCODE_CONFIG: baseConfigPath,
      } as NodeJS.ProcessEnv,
      settings: {
        customPrompt: '',
        mediaFolder: '',
        userName: 'Yishen',
        vaultPath: tmpRoot,
      },
      workspaceRoot: tmpRoot,
    });

    expect(result.configPath).toBe(path.join(tmpRoot, '.typorai', 'opencode', 'config.json'));
    expect(result.systemPromptPath).toBe(path.join(tmpRoot, '.typorai', 'opencode', 'system.md'));
    const generatedConfig = JSON.parse(await fs.readFile(result.configPath, 'utf8'));
    expect(generatedConfig).toMatchObject({
      default_agent: 'build',
      providers: {
        anthropic: {
          api_key: 'anthropic-key',
        },
      },
      username: 'Yishen',
    });
    expect(generatedConfig.agent).toMatchObject({
      build: {
        model: 'openai/gpt-5',
        prompt: `{file:${result.systemPromptPath}}`,
      },
      [OPENCODE_YOLO_MODE_ID]: {
        mode: 'primary',
        permission: {
          plan_enter: 'allow',
          question: 'allow',
        },
        prompt: `{file:${result.systemPromptPath}}`,
      },
      [OPENCODE_SAFE_MODE_ID]: {
        mode: 'primary',
        permission: {
          bash: 'deny',
          edit: 'deny',
          plan_enter: 'allow',
          question: 'allow',
        },
        prompt: `{file:${result.systemPromptPath}}`,
      },
      plan: {
        prompt: `{file:${result.systemPromptPath}}`,
      },
    });
  });

  it('keeps the launch key stable when the resolved default database is later passed as OPENCODE_DB', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-opencode-artifacts-'));
    const baseParams = {
      ...hostIo,
      settings: {
        customPrompt: '',
        mediaFolder: '',
        userName: '',
        vaultPath: tmpRoot,
      },
      workspaceRoot: tmpRoot,
    };
    const first = await prepareOpencodeLaunchArtifacts({
      ...baseParams,
      runtimeEnv: {
        HOME: tmpRoot,
      } as NodeJS.ProcessEnv,
    });

    const second = await prepareOpencodeLaunchArtifacts({
      ...baseParams,
      runtimeEnv: {
        HOME: tmpRoot,
        OPENCODE_DB: first.databasePath ?? undefined,
      } as NodeJS.ProcessEnv,
    });

    expect(first.databasePath).toBe(second.databasePath);
    expect(first.launchKey).toBe(second.launchKey);
  });

  it('creates the resolved OpenCode database directory before launch', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-opencode-artifacts-'));
    const xdgDataHome = path.join(tmpRoot, 'xdg-data');
    const databaseDir = path.join(xdgDataHome, 'opencode');

    const result = await prepareOpencodeLaunchArtifacts({
      ...hostIo,
      runtimeEnv: {
        HOME: path.join(tmpRoot, 'home'),
        XDG_DATA_HOME: xdgDataHome,
      } as NodeJS.ProcessEnv,
      settings: {
        customPrompt: '',
        mediaFolder: '',
        userName: '',
        vaultPath: tmpRoot,
      },
      workspaceRoot: tmpRoot,
    });

    expect(result.databasePath).toBe(path.join(databaseDir, 'opencode.db'));
    await expect(fs.access(databaseDir)).resolves.toBeUndefined();
  });
});
