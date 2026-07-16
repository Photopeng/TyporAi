import { ApprovalBroker } from '@/sidecar/services/approval/ApprovalBroker';

describe('ApprovalBroker', () => {
  it('publishes a pending request and resolves only the matching interaction', async () => {
    const published: string[] = [];
    const broker = new ApprovalBroker(interaction => published.push(interaction.id));
    const result = broker.request({ id: 'approval-1', kind: 'approval', payload: { command: 'git status' } });
    expect(published).toEqual(['approval-1']);
    expect(broker.resolve('approval-1', { approved: true })).toBe(true);
    await expect(result).resolves.toEqual({ approved: true });
    expect(broker.size).toBe(0);
  });

  it('rejects every unresolved action when its connection disappears', async () => {
    const broker = new ApprovalBroker(() => undefined);
    const result = broker.request({ id: 'approval-2', kind: 'approval', payload: {} });
    broker.rejectAll();
    await expect(result).resolves.toEqual({ approved: false, reason: 'connection-lost' });
  });
});
