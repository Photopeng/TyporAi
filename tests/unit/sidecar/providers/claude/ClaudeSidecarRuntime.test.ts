import { query as agentQuery } from '@anthropic-ai/claude-agent-sdk';

import type { StreamChunk } from '@/core/types';
import { ClaudeSidecarRuntime } from '@/sidecar/providers/claude/ClaudeSidecarRuntime';

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

const mockQuery = agentQuery as jest.Mock;

function createQuery(messages: readonly unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* messages;
    },
    interrupt: jest.fn(),
  };
}

describe('ClaudeSidecarRuntime', () => {
  it('refuses an ungranted workspace without starting the Claude SDK', async () => {
    const start = jest.fn();
    const runtime = new ClaudeSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => null,
      processes: { start },
      requestApproval: async () => 'deny',
    });
    const chunks: StreamChunk[] = [];

    await runtime.startTurn('connection', 'turn', 'hello', event => chunks.push(event.payload));

    expect(chunks).toEqual([
      { type: 'error', content: 'WORKSPACE_NOT_GRANTED' },
      { type: 'done' },
    ]);
    expect(start).not.toHaveBeenCalled();
  });

  it('can be disposed before a query is created', async () => {
    const runtime = new ClaudeSidecarRuntime({
      getSettings: () => ({}),
      getWorkspacePath: () => '/workspace',
      processes: { start: jest.fn() },
      requestApproval: async () => 'deny',
    });

    await expect(runtime.dispose()).resolves.toBeUndefined();
  });

  it('passes Sidecar-owned enabled MCP servers into the native SDK options', () => {
    const runtime = new ClaudeSidecarRuntime({
      getMcpServers: () => [
        { name: 'docs', config: { command: 'docs-mcp' }, enabled: true, contextSaving: false },
        { name: 'mentioned-only', config: { command: 'other-mcp' }, enabled: true, contextSaving: true },
      ],
      getSettings: () => ({ providerConfigs: { claude: { cliPath: process.execPath } } }),
      getWorkspacePath: () => '/workspace',
      processes: { start: jest.fn() },
      requestApproval: async () => 'deny',
    });

    expect((runtime as any).createQueryOptions('/workspace').mcpServers).toEqual({ docs: { command: 'docs-mcp' } });
  });

  it('does not repeat the completed assistant text after streaming it', async () => {
    mockQuery.mockReturnValue(createQuery([
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      },
    ]));
    const runtime = new ClaudeSidecarRuntime({
      getSettings: () => ({ providerConfigs: { claude: { cliPath: process.execPath } } }),
      getWorkspacePath: () => process.cwd(),
      processes: { start: jest.fn() },
      requestApproval: async () => 'deny',
    });
    const chunks: StreamChunk[] = [];

    await runtime.startTurn('connection', 'turn', 'hello', event => chunks.push(event.payload));

    expect(chunks).toEqual([
      { type: 'text', content: 'Hello' },
      { type: 'done' },
    ]);
  });
});
