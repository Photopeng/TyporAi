import { SIDECAR_RUNTIME_DEVICE_KEY } from '@/core/providers/sidecarRuntimeSettings';

interface CliPathSettings {
  readonly cliPath: string;
  readonly cliPathsByHost: Readonly<Record<string, string>>;
}

/**
 * Sidecar runs in Node and cannot read the renderer's localStorage-backed
 * device key. The renderer includes that key in its sync patch so the Sidecar
 * can honor the CLI path selected for this Typora installation.
 */
export function resolveSidecarCliPath(
  settings: Record<string, unknown>,
  provider: CliPathSettings,
): string | null {
  const deviceKey = typeof settings[SIDECAR_RUNTIME_DEVICE_KEY] === 'string'
    ? settings[SIDECAR_RUNTIME_DEVICE_KEY].trim()
    : '';
  const devicePath = deviceKey ? provider.cliPathsByHost[deviceKey]?.trim() : '';
  if (devicePath) return devicePath;

  const legacyPath = provider.cliPath.trim();
  if (legacyPath) return legacyPath;

  const configuredPaths = [...new Set(Object.values(provider.cliPathsByHost).map(value => value.trim()).filter(Boolean))];
  return configuredPaths.length === 1 ? configuredPaths[0] : null;
}
