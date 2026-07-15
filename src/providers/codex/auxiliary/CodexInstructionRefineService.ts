import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type { ProcessTransportFactory } from '../../../core/ports';
import type TyporAiPlugin from '../../../main';
import { CodexAuxQueryRunner } from '../runtime/CodexAuxQueryRunner';

export class CodexInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: TyporAiPlugin, processTransport?: ProcessTransportFactory) {
    super(new CodexAuxQueryRunner(plugin, processTransport));
  }
}
