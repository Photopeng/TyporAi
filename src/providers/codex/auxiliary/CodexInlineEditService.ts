import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type { ProcessTransportFactory } from '../../../core/ports';
import type TyporAiPlugin from '../../../main';
import { CodexAuxQueryRunner } from '../runtime/CodexAuxQueryRunner';

export class CodexInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: TyporAiPlugin, processTransport?: ProcessTransportFactory) {
    super(new CodexAuxQueryRunner(plugin, processTransport));
  }
}
