import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ShutdownCoordinator } from './lifecycle/ShutdownCoordinator';
import { createBootstrapToken } from './server/Authentication';
import { SidecarServer } from './server/SidecarServer';

const dataDirectory = process.env.TYPORAI_SIDECAR_DATA_DIR ?? defaultDataDirectory();
const tokenPath = process.env.TYPORAI_SIDECAR_TOKEN_FILE ?? path.join(dataDirectory, 'auth-token');
const token = process.env.TYPORAI_SIDECAR_TOKEN ?? readOrCreateToken(tokenPath);
const server = new SidecarServer({
  dataDirectory,
  descriptorPath: process.env.TYPORAI_SIDECAR_DESCRIPTOR ?? path.join(dataDirectory, 'connection.json'),
  lockPath: path.join(dataDirectory, 'sidecar.lock'),
  sidecarVersion: process.env.TYPORAI_VERSION ?? 'development',
  token,
});

const shutdown = new ShutdownCoordinator(server);
void server.start().catch(error => {
  process.stderr.write(`TyporAi Sidecar failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
process.once('SIGINT', () => { void shutdown.shutdown(); });
process.once('SIGTERM', () => { void shutdown.shutdown(); });

function defaultDataDirectory(): string {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'TyporAi', 'sidecar');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'TyporAi', 'sidecar');
  return path.join(os.homedir(), '.typorai', 'sidecar');
}

function readOrCreateToken(target: string): string {
  if (existsSync(target)) return readFileSync(target, 'utf8').trim();
  mkdirSync(path.dirname(target), { recursive: true });
  const value = createBootstrapToken();
  writeFileSync(target, value, { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(target, 0o600); } catch { /* Windows does not expose POSIX file modes. */ }
  return value;
}
