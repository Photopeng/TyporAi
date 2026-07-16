import type { WebSocketRpcClient } from '../client/WebSocketRpcClient';

export type InteractionKind = 'approval' | 'planApproval' | 'userInput';
export interface BridgeInteraction { readonly id: string; readonly kind: InteractionKind; readonly payload: Readonly<Record<string, unknown>>; }

/** Browser-side projection of Sidecar-owned approval and user-input gates. */
export class BridgeInteractionService {
  private readonly listeners = new Set<(interaction: BridgeInteraction) => void>();
  private readonly unsubscribe: Array<() => void>;

  constructor(private readonly rpc: WebSocketRpcClient) {
    this.unsubscribe = [
      rpc.onNotification('approval.request', params => this.publish('approval', params)),
      rpc.onNotification('planApproval.request', params => this.publish('planApproval', params)),
      rpc.onNotification('userInput.request', params => this.publish('userInput', params)),
    ];
  }

  onRequest(listener: (interaction: BridgeInteraction) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  resolve(interaction: BridgeInteraction, result: unknown): Promise<unknown> {
    const method = interaction.kind === 'approval' ? 'approval.resolve' : interaction.kind === 'planApproval' ? 'planApproval.resolve' : 'userInput.resolve';
    return this.rpc.request(method, { id: interaction.id, result });
  }
  dispose(): void { this.unsubscribe.forEach(unsubscribe => unsubscribe()); this.listeners.clear(); }

  private publish(kind: InteractionKind, params: unknown): void {
    if (!params || typeof params !== 'object') return;
    const value = params as Record<string, unknown>;
    if (typeof value.id !== 'string' || !value.payload || typeof value.payload !== 'object') return;
    this.listeners.forEach(listener => listener({ id: value.id as string, kind, payload: value.payload as Readonly<Record<string, unknown>> }));
  }
}
