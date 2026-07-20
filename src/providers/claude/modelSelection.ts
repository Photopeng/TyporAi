import {
  decodeProviderModelSelectionId,
  encodeProviderModelSelectionId,
  toProviderRuntimeModelId,
} from '../../core/providers/modelSelection';

export function encodeClaudeModelSelectionId(modelId: string): string {
  return encodeProviderModelSelectionId('claude', modelId);
}

export function toClaudeRuntimeModelId(modelId: string): string {
  if (decodeProviderModelSelectionId(modelId)?.providerId && decodeProviderModelSelectionId(modelId)?.providerId !== 'claude') return '';
  return toProviderRuntimeModelId('claude', modelId);
}
