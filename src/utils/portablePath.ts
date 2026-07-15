export function normalizePosixPath(value: string): string {
  const input = value.replace(/\\/g, '/');
  const absolute = input.startsWith('/');
  const parts: string[] = [];
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '..') parts.push(part);
  }
  const result = `${absolute ? '/' : ''}${parts.join('/')}`;
  return result || (absolute ? '/' : '.');
}

export function joinPosixPath(...parts: string[]): string {
  return normalizePosixPath(parts.filter(Boolean).join('/'));
}

export function normalizeWindowsPath(value: string): string {
  let input = value.replace(/\//g, '\\');
  if (input.startsWith('\\\\?\\UNC\\')) input = `\\\\${input.slice('\\\\?\\UNC\\'.length)}`;
  else if (input.startsWith('\\\\?\\')) input = input.slice('\\\\?\\'.length);
  const drive = input.match(/^[A-Za-z]:\\?/);
  const unc = input.startsWith('\\\\');
  const rooted = unc || input.startsWith('\\');
  const prefix = drive?.[0] ?? (unc ? '\\\\' : rooted ? '\\' : '');
  const body = input.slice(prefix.length);
  const parts: string[] = [];
  for (const part of body.split('\\')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '..') parts.push(part);
  }
  return `${prefix}${parts.join('\\')}` || '.';
}

export function joinWindowsPath(...parts: string[]): string {
  return normalizeWindowsPath(parts.filter(Boolean).join('\\'));
}

export function dirnamePosixPath(value: string): string {
  const normalized = normalizePosixPath(value);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? (normalized.startsWith('/') ? '/' : '.') : normalized.slice(0, index);
}

export function dirnameWindowsPath(value: string): string {
  const normalized = normalizeWindowsPath(value).replace(/\\$/, '');
  const index = normalized.lastIndexOf('\\');
  if (index < 0) return '.';
  if (index === 2 && /^[A-Za-z]:/.test(normalized)) return normalized.slice(0, 3);
  if (index === 1 && normalized.startsWith('\\\\')) return '\\\\';
  return normalized.slice(0, index) || '\\';
}

export function basenamePortable(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function dirnamePortable(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  if (/^[A-Za-z]:$/.test(normalized.slice(0, index))) return `${normalized.slice(0, index)}\\`;
  return normalized.slice(0, index);
}
