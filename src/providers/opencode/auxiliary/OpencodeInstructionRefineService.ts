import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type { CreateProviderServiceOptions } from '../../../core/providers/types';
import type TyporAiPlugin from '../../../main';
import { OpencodeAuxQueryRunner } from '../runtime/OpencodeAuxQueryRunner';

export class OpencodeInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: TyporAiPlugin, options?: CreateProviderServiceOptions) {
    super(new OpencodeAuxQueryRunner(plugin, {
      agentProfile: 'passive',
      artifactPurpose: 'instructions',
    }, options?.processTransport, options?.fileStore, options?.pathService));
  }
}
