import { ApprovalBroker } from '@/sidecar/services/approval/ApprovalBroker';

describe('ApprovalBroker', () => {
  it('publishes a pending request and resolves only the matching interaction', async () => {
    const published: string[] = [];
    const broker = new ApprovalBroker(interaction => published.push(interaction.id));
    const result = broker.request({ connectionId: 'connection-1', id: 'approval-1', kind: 'approval', payload: { command: 'git status' } });
    expect(published).toEqual(['approval-1']);
    expect(broker.resolve('approval-1', { approved: true })).toBe(true);
    await expect(result).resolves.toEqual({ approved: true });
    expect(broker.size).toBe(0);
  });

  it('rejects every unresolved action when its connection disappears', async () => {
    const broker = new ApprovalBroker(() => undefined);
    const result = broker.request({ connectionId: 'connection-1', id: 'approval-2', kind: 'approval', payload: {} });
    broker.rejectAll();
    await expect(result).resolves.toEqual({ approved: false, reason: 'connection-lost' });
  });

  it('does not resolve an interaction from another connection', async () => {
    const broker = new ApprovalBroker(() => undefined);
    const result = broker.request({ connectionId: 'connection-a', id: 'approval-3', kind: 'approval', payload: {} });
    expect(broker.resolve('approval-3', { approved: true }, 'connection-b')).toBe(false);
    expect(broker.resolve('approval-3', { approved: true }, 'connection-a')).toBe(true);
    await expect(result).resolves.toEqual({ approved: true });
  });

  it('denies requests once its pending capacity is reached', async () => {
    const broker = new ApprovalBroker(() => undefined, 60_000, 1);
    void broker.request({ connectionId: 'connection-1', id: 'approval-capacity-1', kind: 'approval', payload: {} });
    await expect(broker.request({ connectionId: 'connection-1', id: 'approval-capacity-2', kind: 'approval', payload: {} })).resolves.toEqual({ approved: false, reason: 'capacity' });
    broker.rejectAll();
  });
});
