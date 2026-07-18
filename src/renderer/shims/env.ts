const DEVICE_SETTINGS_STORAGE_KEY = 'typorai.deviceSettingsKey';
let cachedDeviceSettingsKey: string | null = null;

export function findNodeDirectory(): string | null { return null; }
export function findNodeExecutable(): string | null { return null; }
export function cliPathRequiresNode(cliPath: string): boolean { return /\.(?:c?m?js|tsx?)$/i.test(cliPath); }
export function getMissingNodeError(): string | null { return null; }
export function getEnhancedPath(additionalPaths = ''): string { return additionalPaths; }

export function parseEnvironmentVariables(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function getHostnameKey(): string {
  if (cachedDeviceSettingsKey) return cachedDeviceSettingsKey;
  const saved = storage()?.getItem(DEVICE_SETTINGS_STORAGE_KEY)?.trim();
  if (saved) return (cachedDeviceSettingsKey = saved);
  const generated = `device:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`}`;
  cachedDeviceSettingsKey = generated;
  try { storage()?.setItem(DEVICE_SETTINGS_STORAGE_KEY, generated); } catch {
    // Restricted Typora renderer profiles can disable local storage.
  }
  return generated;
}

export function getLegacyHostnameKey(): string { return ''; }
export function migrateLegacyHostnameKeyedMap<T extends string>(entries: Record<string, T>, currentKey: string, legacyKey: string): Record<string, T> {
  if (!currentKey || !legacyKey || currentKey === legacyKey || !Object.prototype.hasOwnProperty.call(entries, legacyKey)) return entries;
  const result = { ...entries };
  if (!Object.prototype.hasOwnProperty.call(result, currentKey)) result[currentKey] = result[legacyKey];
  delete result[legacyKey];
  return result;
}

export const MIN_CONTEXT_LIMIT = 1_000;
export const MAX_CONTEXT_LIMIT = 10_000_000;
export function parseContextLimit(input: string): number | null {
  const match = input.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]) * (match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1);
  const rounded = Math.round(value);
  return rounded >= MIN_CONTEXT_LIMIT && rounded <= MAX_CONTEXT_LIMIT ? rounded : null;
}
export function formatContextLimit(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) return `${tokens / 1_000_000}m`;
  if (tokens >= 1_000 && tokens % 1_000 === 0) return `${tokens / 1_000}k`;
  return tokens.toLocaleString();
}
