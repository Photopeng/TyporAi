import { QueryBackedTitleGenerationService } from '../../../core/auxiliary/QueryBackedTitleGenerationService';
import type { CreateProviderServiceOptions } from '../../../core/providers/types';
import type TyporAiPlugin from '../../../main';
import { decodeOpencodeModelId } from '../models';
import { OpencodeAuxQueryRunner } from '../runtime/OpencodeAuxQueryRunner';
import { opencodeChatUIConfig } from '../ui/OpencodeChatUIConfig';

export class OpencodeTitleGenerationService extends QueryBackedTitleGenerationService {
  constructor(plugin: TyporAiPlugin, options?: CreateProviderServiceOptions) {
    super({
      createRunner: () => new OpencodeAuxQueryRunner(plugin, {
        agentProfile: 'passive',
        artifactPurpose: 'title-gen',
      }, options?.processTransport, options?.fileStore, options?.pathService),
      resolveModel: () => {
        const settings = plugin.settings as unknown as Record<string, unknown>;
        const titleModel = typeof settings.titleGenerationModel === 'string'
          ? settings.titleGenerationModel
          : '';
        if (!opencodeChatUIConfig.ownsModel(titleModel, settings)) {
          return undefined;
        }

        return decodeOpencodeModelId(titleModel) ?? undefined;
      },
    });
  }
}
