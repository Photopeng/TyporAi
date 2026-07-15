export type HostRuntime = 'electron' | 'webkit';

export interface PlatformInfo {
  readonly runtime: HostRuntime;
  readonly operatingSystem: 'windows' | 'macos' | 'linux' | 'unknown';
  readonly appVersion: string | null;
}

export class CapabilityUnavailableError extends Error {
  constructor(capability: string) {
    super(`Capability unavailable: ${capability}`);
    this.name = 'CapabilityUnavailableError';
  }
}
