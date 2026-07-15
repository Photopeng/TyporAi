import { CommandRegistry } from '@/core/CommandRegistry';

describe('CommandRegistry', () => {
  it('registers and executes commands by id', async () => {
    const registry = new CommandRegistry();
    const handler = jest.fn();

    registry.register('send', 'Send', handler);
    await registry.execute('send');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(registry.list()).toEqual([{ id: 'send', label: 'Send' }]);
  });

  it('passes payloads to command handlers', async () => {
    const registry = new CommandRegistry();
    const handler = jest.fn();

    registry.register('open', 'Open', handler);
    await registry.execute('open', { id: 'conv-1' });

    expect(handler).toHaveBeenCalledWith({ id: 'conv-1' });
  });

  it('rejects duplicate command ids', () => {
    const registry = new CommandRegistry();
    registry.register('send', 'Send', jest.fn());

    expect(() => registry.register('send', 'Send again', jest.fn())).toThrow(/already registered/i);
  });
});
