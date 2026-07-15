import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type { CreateProviderServiceOptions } from '../../../core/providers/types';
import type TyporAiPlugin from '../../../main';
import { OpencodeAuxQueryRunner } from '../runtime/OpencodeAuxQueryRunner';

export class OpencodeInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: TyporAiPlugin, options?: CreateProviderServiceOptions) {
    super(new OpencodeAuxQueryRunner(plugin, {
      agentProfile: 'readonly',
      artifactPurpose: 'inline',
      allowReadTextFile: true,
    }, options?.processTransport, options?.fileStore, options?.pathService));
  }
}
