import * as path from './nodePath';

interface WorkspacePathOwner { vault: { adapter?: { basePath?: unknown } } }

function rendererHome(): string {
  const value = (globalThis as { __TYPORAI_HOME_DIRECTORY__?: unknown }).__TYPORAI_HOME_DIRECTORY__;
  return typeof value === 'string' ? value : '';
}

export function getVaultPath(app: WorkspacePathOwner): string | null {
  const basePath = app.vault.adapter?.basePath;
  return typeof basePath === 'string' ? basePath : null;
}
export function expandHomePath(value: string): string {
  const home = rendererHome();
  if (value === '~') return home || value;
  if (/^~[\\/]/.test(value)) return home ? path.join(home, value.slice(2)) : value;
  return value;
}
export function parsePathEntries(value?: string): string[] {
  if (!value) return [];
  const delimiter = value.includes(';') ? ';' : ':';
  return value.split(delimiter).map(part => part.trim().replace(/^(?:"(.*)"|'(.*)')$/, '$1$2')).filter(Boolean);
}
export function resolveNvmDefaultBin(): string | null { return null; }
export function translateMsysPath(value: string): string {
  const match = value.match(/^\/([A-Za-z])(\/.*)?$/);
  return match ? `${match[1].toUpperCase()}:${(match[2] ?? '').replace(/\//g, '\\')}` : value;
}
export function normalizePathForFilesystem(value: string): string { return value ? path.normalize(expandHomePath(value)) : ''; }
export function normalizePathForComparison(value: string): string {
  const normalized = normalizePathForFilesystem(value).replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}
export function isPathWithinDirectory(candidatePath: string, directoryPath: string, relativeBasePath = directoryPath): boolean {
  const directory = normalizePathForComparison(path.resolve(directoryPath));
  const candidate = normalizePathForFilesystem(candidatePath);
  const absolute = normalizePathForComparison(path.isAbsolute(candidate) ? candidate : path.resolve(relativeBasePath, candidate));
  return absolute === directory || absolute.startsWith(`${directory}/`);
}
export function isPathWithinVault(candidatePath: string, vaultPath: string): boolean { return isPathWithinDirectory(candidatePath, vaultPath, vaultPath); }
export function normalizePathForVault(rawPath: string | null | undefined, vaultPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  const normalized = normalizePathForFilesystem(rawPath);
  if (vaultPath && isPathWithinVault(normalized, vaultPath)) {
    const absolute = path.isAbsolute(normalized) ? normalized : path.resolve(vaultPath, normalized);
    return path.relative(vaultPath, absolute).replace(/\\/g, '/') || null;
  }
  return normalized.replace(/\\/g, '/');
}
