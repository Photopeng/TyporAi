import { CapabilityUnavailableError } from '@/core/ports';

interface ElectronWindow {
  reqnode?: (moduleName: string) => unknown;
}

export function electronRequire(moduleName: string): unknown {
  const candidate = globalThis as typeof globalThis & { window?: ElectronWindow };
  const reqnode = candidate.window?.reqnode ?? (candidate as ElectronWindow).reqnode;
  if (typeof reqnode !== 'function') throw new CapabilityUnavailableError(`electron module ${moduleName}`);
  return reqnode(moduleName);
}
