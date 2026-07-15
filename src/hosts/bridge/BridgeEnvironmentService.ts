import type { EnvironmentService } from '@/core/ports';

import type { BridgeClient } from './BridgeClient';

export class BridgeEnvironmentService implements EnvironmentService {
  constructor(private readonly client: BridgeClient, private readonly home: string | null) {}

  get(_name: string): string | null { return null; }
  homeDirectory(): string | null { return this.home; }
  findExecutable(name: string): Promise<string | null> { return this.client.call('environment.findExecutable', { name }); }
}
