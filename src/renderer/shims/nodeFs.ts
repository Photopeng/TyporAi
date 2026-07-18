function unavailable(): never {
  const error = new Error('Synchronous filesystem access is unavailable in the Sidecar renderer.') as Error & { code?: string };
  error.code = 'ENOENT';
  throw error;
}

export function existsSync(): boolean { return false; }
export function readFileSync(): never { return unavailable(); }
export function readdirSync(): never[] { return []; }
export function statSync(): never { return unavailable(); }
export function openSync(): never { return unavailable(); }
export function readSync(): never { return unavailable(); }
export function closeSync(): void {}
export const realpathSync = Object.assign((_path: unknown): never => unavailable(), {
  native: (_path: unknown): never => unavailable(),
});

export const promises = Object.freeze({});

export default {
  closeSync,
  existsSync,
  openSync,
  promises,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
};
