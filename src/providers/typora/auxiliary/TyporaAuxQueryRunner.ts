import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import { createAgentEngine } from '../../../core/engine-factory';
import type { IAgentEngine } from '../../../core/types/agent-engine';
import type TyporAiPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { getTyporaProviderSettings } from '../settings';

export class TyporaAuxQueryRunner implements AuxQueryRunner {
  private engine: IAgentEngine | null = null;

  constructor(private readonly plugin: TyporAiPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    if (config.abortController?.signal.aborted) {
      throw new Error('Query cancelled.');
    }

    const engine = this.ensureEngine(config.model);
    const workspacePath = getVaultPath(this.plugin.app) ?? process.cwd();
    let accumulated = '';
    const abortHandler = () => this.reset();
    config.abortController?.signal.addEventListener('abort', abortHandler, { once: true });

    try {
      const message = await engine.chat({
        prompt: `${config.systemPrompt}\n\n${prompt}`,
        workspacePath,
        currentFilePath: null,
      }, {
        onToken: (token) => {
          accumulated += token;
          config.onTextChunk?.(accumulated);
        },
        onError: (error) => {
          throw error;
        },
      });

      return accumulated || message.content;
    } finally {
      if (config.abortController) {
        config.abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  reset(): void {
    this.engine?.abort();
    this.engine = null;
  }

  private ensureEngine(modelOverride?: string): IAgentEngine {
    if (!this.engine) {
      const settings = getTyporaProviderSettings(this.plugin.settings as Record<string, unknown>);
      const settingsBag = this.plugin.settings as Record<string, unknown>;
      this.engine = createAgentEngine({
        ...settings,
        apiModel: modelOverride?.trim() || settings.apiModel,
        effortLevel: typeof settingsBag.effortLevel === 'string' ? settingsBag.effortLevel : undefined,
      });
    }
    return this.engine;
  }
}
