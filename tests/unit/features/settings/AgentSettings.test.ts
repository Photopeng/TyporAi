import { JSDOM } from 'jsdom';

import type { AgentDefinition } from '@/core/types';
import { AgentSettings } from '@/providers/claude/ui/AgentSettings';

const showNotice = jest.fn();
jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show = showNotice; } }));

function agent(name: string, filePath?: string): AgentDefinition {
  return { id: name, name, description: `${name} description`, prompt: `${name} prompt`, source: 'vault', filePath };
}

describe('AgentSettings', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;
  let save: jest.Mock;
  let remove: jest.Mock;
  let storage: any;
  let manager: any;
  let settings: AgentSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    save = jest.fn().mockResolvedValue(undefined);
    remove = jest.fn().mockResolvedValue(undefined);
    storage = { load: jest.fn(), save, delete: remove };
    manager = { getAvailableAgents: jest.fn().mockReturnValue([]), loadAgents: jest.fn().mockResolvedValue(undefined) };
    settings = new AgentSettings(document.createElement('section'), { agentManager: manager, agentStorage: storage });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('renames by saving before deleting the previous file', async () => {
    const existing = agent('old-name', '.claude/agents/custom-old.md');
    const renamed = agent('new-name', '.claude/agents/custom-old.md');
    await (settings as any).saveAgent(renamed, existing);

    expect(save).toHaveBeenCalledWith({ ...renamed, filePath: undefined });
    expect(remove).toHaveBeenCalledWith(existing);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it('uses native notifications when loading an existing agent fails', async () => {
    const existing = agent('existing-agent', '.claude/agents/existing-agent.md');
    storage.load.mockRejectedValue(new Error('permission denied'));
    await (settings as any).openAgentModal(existing);

    expect(showNotice).toHaveBeenCalledWith('settings.subagents.loadFailed', 'error');
  });
});
