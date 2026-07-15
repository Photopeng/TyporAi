/** @jest-environment jsdom */

import type { CodexSubagentStorage } from '@/providers/codex/storage/CodexSubagentStorage';
import { createCodexSubagentPersistenceKey } from '@/providers/codex/storage/CodexSubagentStorage';
import type { CodexSubagentDefinition } from '@/providers/codex/types/subagent';
import {
  CodexSubagentSettings,
  validateCodexNicknameCandidates,
  validateCodexSubagentName,
} from '@/providers/codex/ui/CodexSubagentSettings';

function makeAgent(name: string, overrides: Partial<CodexSubagentDefinition> = {}): CodexSubagentDefinition {
  return {
    name,
    description: `${name} description`,
    developerInstructions: `${name} instructions`,
    persistenceKey: createCodexSubagentPersistenceKey({ fileName: `${name}.toml` }),
    ...overrides,
  };
}

function createMockStorage(
  agents: CodexSubagentDefinition[] = [],
): CodexSubagentStorage {
  return {
    loadAll: jest.fn().mockResolvedValue(agents),
    load: jest.fn().mockImplementation(async (a: CodexSubagentDefinition) =>
      agents.find(x => x.name === a.name) ?? null,
    ),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as CodexSubagentStorage;
}

function createMockContainer(): any {
  return document.createElement('div');
}

describe('validateCodexSubagentName', () => {
  it('accepts lowercase with hyphens', () => {
    expect(validateCodexSubagentName('code-reviewer')).toBeNull();
  });

  it('accepts lowercase with underscores (Codex convention)', () => {
    expect(validateCodexSubagentName('pr_explorer')).toBeNull();
    expect(validateCodexSubagentName('docs_researcher')).toBeNull();
    expect(validateCodexSubagentName('code_mapper')).toBeNull();
  });

  it('accepts mixed hyphens and underscores', () => {
    expect(validateCodexSubagentName('my-code_reviewer')).toBeNull();
  });

  it('rejects empty name', () => {
    expect(validateCodexSubagentName('')).not.toBeNull();
  });

  it('rejects uppercase', () => {
    expect(validateCodexSubagentName('Code_Reviewer')).not.toBeNull();
  });

  it('rejects spaces', () => {
    expect(validateCodexSubagentName('code reviewer')).not.toBeNull();
  });

  it('rejects names over 64 characters', () => {
    expect(validateCodexSubagentName('a'.repeat(65))).not.toBeNull();
  });
});

describe('CodexSubagentSettings', () => {
  describe('validation', () => {
    it('accepts documented nickname candidates', () => {
      expect(
        validateCodexNicknameCandidates(['Atlas', 'Delta-1', 'Echo_2', 'Scout 3']),
      ).toBeNull();
    });

    it('rejects duplicate nickname candidates', () => {
      expect(
        validateCodexNicknameCandidates(['Atlas', 'atlas']),
      ).toBe('duplicate');
    });

    it('rejects nickname candidates with invalid characters', () => {
      expect(
        validateCodexNicknameCandidates(['Atlas', 'Delta!']),
      ).toBe('invalid');
    });
  });

  describe('constructor', () => {
    it('creates settings with storage reference', () => {
      const container = createMockContainer();
      const storage = createMockStorage([makeAgent('reviewer')]);

      const settings = new CodexSubagentSettings(container, storage);
      expect(settings).toBeInstanceOf(CodexSubagentSettings);
    });
  });

  describe('render', () => {
    it('calls loadAll on render', async () => {
      const container = createMockContainer();
      const storage = createMockStorage([makeAgent('reviewer')]);

      new CodexSubagentSettings(container, storage);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(storage.loadAll).toHaveBeenCalled();
    });

    it('shows empty state when no agents', async () => {
      const container = createMockContainer();
      const storage = createMockStorage([]);

      new CodexSubagentSettings(container, storage);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.typorai-sp-empty-state')).not.toBeNull();
    });

    it('renders multiple agents', async () => {
      const container = createMockContainer();
      const storage = createMockStorage([
        makeAgent('reviewer'),
        makeAgent('explorer'),
      ]);

      new CodexSubagentSettings(container, storage);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(storage.loadAll).toHaveBeenCalled();
    });
  });
});
