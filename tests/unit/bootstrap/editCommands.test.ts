import type { HotkeyAdapter } from '@/adapters/hotkey';
import { registerEditCommands } from '@/bootstrap/editCommands';
import { CommandRegistry } from '@/core/CommandRegistry';
import type { TyporaEditModeController } from '@/typora/TyporaEditModeController';

describe('registerEditCommands', () => {
  it('registers Typora edit mode commands', async () => {
    const commandRegistry = new CommandRegistry();
    const controller = createController();

    registerEditCommands({ commandRegistry, hotkey: null }, controller);

    expect(commandRegistry.list().map(command => command.id)).toEqual([
      'edit.start',
      'edit.preview',
      'edit.apply',
      'edit.acceptBlock',
      'edit.rejectBlock',
      'edit.refineBlock',
      'edit.discard',
    ]);

    await commandRegistry.execute('edit.start', { instruction: 'Improve it' });
    await commandRegistry.execute('edit.preview', 'Make it shorter');
    await commandRegistry.execute('edit.apply');
    await commandRegistry.execute('edit.acceptBlock', { blockId: 'block-a' });
    await commandRegistry.execute('edit.rejectBlock', 'block-b');
    await commandRegistry.execute('edit.refineBlock', { blockId: 'block-c', instruction: 'Tighten this' });
    await commandRegistry.execute('edit.discard');

    expect(controller.start).toHaveBeenCalledWith('Improve it');
    expect(controller.preview).toHaveBeenCalledWith('Make it shorter');
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.accept).toHaveBeenCalledWith('block-a');
    expect(controller.reject).toHaveBeenCalledWith('block-b');
    expect(controller.refineBlock).toHaveBeenCalledWith('block-c', 'Tighten this');
    expect(controller.discard).toHaveBeenCalledTimes(1);
  });

  it('wires the editor hotkey to edit.start', () => {
    const commandRegistry = new CommandRegistry();
    const controller = createController();
    const hotkey: jest.Mocked<HotkeyAdapter> = {
      register: jest.fn().mockReturnValue('hotkey-id'),
      unregister: jest.fn(),
      unregisterAll: jest.fn(),
    };

    registerEditCommands({ commandRegistry, hotkey }, controller);

    expect(hotkey.register).toHaveBeenCalledWith('editor', 'Ctrl+Shift+E', expect.any(Function));
  });
});

function createController(): jest.Mocked<Pick<TyporaEditModeController, 'accept' | 'apply' | 'discard' | 'preview' | 'refineBlock' | 'reject' | 'start'>> {
  return {
    accept: jest.fn(),
    apply: jest.fn(),
    discard: jest.fn(),
    preview: jest.fn().mockResolvedValue(undefined),
    refineBlock: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn(),
    start: jest.fn(),
  };
}
