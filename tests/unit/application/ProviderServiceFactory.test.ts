const createTitleGenerationService = jest.fn();
const createInstructionRefineService = jest.fn();
const createInlineEditService = jest.fn();

jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    createTitleGenerationService,
    createInstructionRefineService,
    createInlineEditService,
  },
}));

import { ProviderServiceFactory } from '@/application/providers/ProviderServiceFactory';
import type { HostServices } from '@/core/ports';

describe('ProviderServiceFactory', () => {
  it('composes auxiliary provider services with the host process boundary', () => {
    const processes = { start: jest.fn() };
    const factory = new ProviderServiceFactory({ processes } as unknown as HostServices);
    const plugin = {} as any;

    factory.createTitleGenerationService(plugin, 'codex');
    factory.createInstructionRefineService(plugin, 'codex');
    factory.createInlineEditService(plugin, 'codex');

    const options = { processTransport: processes };
    expect(createTitleGenerationService).toHaveBeenCalledWith(plugin, 'codex', options);
    expect(createInstructionRefineService).toHaveBeenCalledWith(plugin, 'codex', options);
    expect(createInlineEditService).toHaveBeenCalledWith(plugin, 'codex', options);
  });
});
