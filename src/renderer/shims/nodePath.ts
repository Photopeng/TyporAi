function slash(value: string): string { return value.replace(/\\/g, '/'); }
function hasDrive(value: string): boolean { return /^[A-Za-z]:\//.test(slash(value)); }

export function normalize(value: string): string {
  if (!value) return '.';
  const input = slash(value);
  const drive = hasDrive(input) ? input.slice(0, 2) : '';
  const absolute = input.startsWith('/') || Boolean(drive);
  const rest = drive ? input.slice(2) : input;
  const output: string[] = [];
  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (output.length > 0 && output[output.length - 1] !== '..') output.pop();
      else if (!absolute) output.push(part);
    } else output.push(part);
  }
  const prefix = drive ? `${drive}/` : absolute ? '/' : '';
  return `${prefix}${output.join('/')}` || (absolute ? prefix : '.');
}

export function join(...parts: string[]): string { return normalize(parts.filter(Boolean).join('/')); }
export function isAbsolute(value: string): boolean {
  const normalized = slash(value);
  return normalized.startsWith('/') || hasDrive(normalized) || normalized.startsWith('//');
}
export function resolve(...parts: string[]): string {
  let resolved = '';
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;
    resolved = resolved ? `${part}/${resolved}` : part;
    if (isAbsolute(part)) break;
  }
  return normalize(isAbsolute(resolved) ? resolved : `/${resolved}`);
}
export function dirname(value: string): string {
  const normalized = normalize(value);
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}
export function basename(value: string, suffix?: string): string {
  const normalized = slash(value).replace(/\/+$/, '');
  let result = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (suffix && result.endsWith(suffix)) result = result.slice(0, -suffix.length);
  return result;
}
export function extname(value: string): string {
  const name = basename(value);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '';
}
export function parse(value: string): { root: string; dir: string; base: string; ext: string; name: string } {
  const normalized = normalize(value);
  const root = isAbsolute(normalized) ? (hasDrive(normalized) ? normalized.slice(0, 3) : '/') : '';
  const dir = dirname(normalized);
  const base = basename(normalized);
  const ext = extname(base);
  return { root, dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
}
export function relative(from: string, to: string): string {
  const left = normalize(from).split('/').filter(Boolean);
  const right = normalize(to).split('/').filter(Boolean);
  let shared = 0;
  while (shared < left.length && shared < right.length && left[shared].toLowerCase() === right[shared].toLowerCase()) shared += 1;
  return [...left.slice(shared).map(() => '..'), ...right.slice(shared)].join('/');
}

export const sep = '/';
export const delimiter = ':';
export const win32 = { basename, delimiter: ';', dirname, extname, isAbsolute, join, normalize, parse, relative, resolve, sep: '\\' };
export const posix = { basename, delimiter, dirname, extname, isAbsolute, join, normalize, parse, relative, resolve, sep };

export default { basename, delimiter, dirname, extname, isAbsolute, join, normalize, parse, posix, relative, resolve, sep, win32 };
