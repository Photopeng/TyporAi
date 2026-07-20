import type { WebSocketRpcClient } from '@/bridge/client/WebSocketRpcClient';
import type { RpcEventEnvelope } from '@/protocol';
import { FullBridgeChatRuntime } from '@/renderer/FullBridgeChatRuntime';

describe('FullBridgeChatRuntime', () => {
  it('projects rich stream metadata and JSON-safe turn options through Sidecar', async () => {
    const harness = createRpcHarness();
    const runtime = new FullBridgeChatRuntime(harness.rpc, 'codex');
    const turn = runtime.prepareTurn({ text: 'review this' });
    const chunks = [];

    for await (const chunk of runtime.query(turn, [], {
      allowedTools: ['Read'],
      enabledMcpServers: new Set(['docs']),
      model: 'gpt-test',
    })) chunks.push(chunk);

    expect(chunks.map(chunk => chunk.type)).toEqual(['user_message_start', 'assistant_message_start', 'text', 'done']);
    expect(harness.requests.find(request => request.method === 'chat.startTurn')).toMatchObject({
      params: {
        options: { allowedTools: ['Read'], enabledMcpServers: ['docs'], model: 'gpt-test' },
        prompt: 'review this',
      },
    });
    expect(runtime.getSessionId()).toBe('thread-1');
    expect(runtime.consumeTurnMetadata()).toMatchObject({
      assistantMessageId: 'assistant-1',
      planCompleted: true,
      userMessageId: 'user-1',
      wasSent: true,
    });
    runtime.cleanup();
  });

  it('routes provider approval interactions back to the owning runtime', async () => {
    const harness = createRpcHarness({ approval: true });
    const runtime = new FullBridgeChatRuntime(harness.rpc, 'claude');
    runtime.setApprovalCallback(async () => 'allow');

    const chunks = [];
    for await (const chunk of runtime.query(runtime.prepareTurn({ text: 'write file' }))) chunks.push(chunk);

    expect(chunks.at(-1)).toEqual({ type: 'done' });
    expect(harness.requests.find(request => request.method === 'approval.resolve')).toMatchObject({
      params: { id: 'approval-1', result: { approved: true, decision: 'allow' } },
    });
    runtime.cleanup();
  });

  it('does not advertise or simulate unsupported Sidecar rewind', async () => {
    const runtime = new FullBridgeChatRuntime(createRpcHarness().rpc, 'claude');
    expect(runtime.getCapabilities().supportsRewind).toBe(false);
    await expect(runtime.rewind('user-1', 'assistant-1')).resolves.toEqual({ canRewind: false, error: 'Sidecar rewind is unavailable.' });
    runtime.cleanup();
  });
});

function createRpcHarness(options: { approval?: boolean } = {}): {
  rpc: WebSocketRpcClient;
  requests: Array<{ method: string; params: unknown }>;
} {
  const requests: Array<{ method: string; params: unknown }> = [];
  let eventListener: (event: RpcEventEnvelope<unknown>) => void = () => undefined;
  const notificationListeners = new Map<string, (params: unknown) => void>();
  let activeTurnId = '';
  const publish = (payload: unknown, seq: number): void => eventListener({
    connectionId: 'connection-1', event: 'chat.chunk', payload, seq,
    streamId: activeTurnId, timestamp: 1,
  });
  const rpc = {
    onEvent(listener: (event: RpcEventEnvelope<unknown>) => void) {
      eventListener = listener;
      return () => { eventListener = () => undefined; };
    },
    onNotification(method: string, listener: (params: unknown) => void) {
      notificationListeners.set(method, listener);
      return () => { notificationListeners.delete(method); };
    },
    async request<TResult>(method: string, params?: unknown): Promise<TResult> {
      requests.push({ method, params });
      if (method === 'provider.list') return [{ providerId: 'codex', status: 'available' }] as TResult;
      if (method === 'chat.getRuntimeState') {
        return { sessionId: 'thread-1', turnMetadata: { planCompleted: true } } as TResult;
      }
      if (method === 'chat.startTurn') {
        activeTurnId = (params as { turnId: string }).turnId;
        queueMicrotask(() => {
          if (options.approval) {
            notificationListeners.get('approval.request')?.({
              id: 'approval-1',
              payload: { description: 'Write a file', input: { path: 'a.md' }, toolName: 'Write' },
            });
            return;
          }
          publish({ type: 'user_message_start', content: 'review this', itemId: 'user-1' }, 1);
          publish({ type: 'assistant_message_start', itemId: 'assistant-1' }, 2);
          publish({ type: 'text', content: 'done' }, 3);
          publish({ type: 'done' }, 4);
        });
        return { streamId: activeTurnId } as TResult;
      }
      if (method === 'approval.resolve') queueMicrotask(() => publish({ type: 'done' }, 1));
      return {} as TResult;
    },
  };
  return { requests, rpc: rpc as unknown as WebSocketRpcClient };
}
