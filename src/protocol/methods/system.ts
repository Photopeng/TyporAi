import type { ProtocolRange } from '../version';

export interface SystemInitializeParams {
  readonly token: string;
  readonly clientId: string;
  readonly rendererVersion: string;
  readonly protocol: ProtocolRange;
  readonly platform: 'windows' | 'macos';
  readonly lastConnectionId: string | null;
}

export interface SystemInitializeResult {
  readonly connectionId: string;
  readonly resumed?: boolean;
  readonly sidecarVersion: string;
  readonly protocolVersion: number;
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly providerStatus: Readonly<Record<string, unknown>>;
  readonly workspaceGrant: Readonly<Record<string, unknown>>;
  readonly serverTime: number;
}
