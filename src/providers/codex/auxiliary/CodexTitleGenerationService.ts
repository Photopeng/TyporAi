import { QueryBackedTitleGenerationService } from '../../../core/auxiliary/QueryBackedTitleGenerationService';
import type { ProcessTransportFactory } from '../../../core/ports';
import type TyporAiPlugin from '../../../main';
import { toCodexRuntimeModelId } from '../modelSelection';
import { CodexAuxQueryRunner } from '../runtime/CodexAuxQueryRunner';
import { codexChatUIConfig } from '../ui/CodexChatUIConfig';

export class CodexTitleGenerationService extends QueryBackedTitleGenerationService {
  constructor(plugin: TyporAiPlugin, processTransport?: ProcessTransportFactory) {
    super({
      createRunner: () => new CodexAuxQueryRunner(plugin, processTransport),
      resolveModel: () => {
        const settings = plugin.settings as unknown as Record<string, unknown>;
        const titleModel = typeof settings.titleGenerationModel === 'string'
          ? settings.titleGenerationModel
          : '';
        return codexChatUIConfig.ownsModel(titleModel, settings)
          ? toCodexRuntimeModelId(titleModel)
          : undefined;
      },
    });
  }
}
