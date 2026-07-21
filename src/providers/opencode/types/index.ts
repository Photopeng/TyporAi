import type { ForkSource } from '../../../core/types/chat';

export interface OpencodeProviderState {
  databasePath?: string;
  /** A local fork is hydrated into a new ACP session on its first turn. */
  forkSource?: ForkSource;
}

export function getOpencodeState(
  providerState?: Record<string, unknown>,
): OpencodeProviderState {
  return (providerState ?? {});
}
