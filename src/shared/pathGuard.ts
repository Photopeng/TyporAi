import * as fs from 'node:fs';
import * as path from 'node:path';

function normalizeForCompare(value: string): string {
  const normalized = path.resolve(value).replace(/\\/g, '/').replace(/\/+$/g, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function realpathNearestExisting(target: string): Promise<string> {
  const absolute = path.resolve(target);
  const suffix: string[] = [];
  let current = absolute;

  for (;;) {
    try {
      const resolved = await fs.promises.realpath(current);
      return suffix.length > 0 ? path.join(resolved, ...suffix.reverse()) : resolved;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return absolute;
      }
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

function assertRelativePath(relativePath: string): void {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed inside workspace operations: ${relativePath}`);
  }
}

async function resolve(root: string, relativePath = '.'): Promise<string> {
  if (!root || typeof root !== 'string') {
    throw new Error('Workspace root is required.');
  }

  const requestedPath = relativePath || '.';
  assertRelativePath(requestedPath);

  const rootReal = await realpathNearestExisting(root);
  const target = path.resolve(rootReal, requestedPath);
  const targetReal = await realpathNearestExisting(target);

  const rootComparable = normalizeForCompare(rootReal);
  const targetComparable = normalizeForCompare(targetReal);

  if (targetComparable !== rootComparable && !targetComparable.startsWith(`${rootComparable}/`)) {
    throw new Error(`Path escapes workspace root: ${relativePath}`);
  }

  return targetReal;
}

export const pathGuard = {
  resolve,
};

export { resolve };
