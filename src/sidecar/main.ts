import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseSidecarPort } from './sidecarPort';
import { SidecarServer } from './SidecarServer';

const port = parseSidecarPort(process.env.TYPORAI_SIDECAR_PORT ?? '17328');
const token = process.env.TYPORAI_SIDECAR_TOKEN
  ?? (process.env.TYPORAI_SIDECAR_TOKEN_FILE ? readFileSync(process.env.TYPORAI_SIDECAR_TOKEN_FILE, 'utf8').trim() : undefined);
if (!token) throw new Error('TYPORAI_SIDECAR_TOKEN is required');

const dataDirectory = process.env.TYPORAI_SIDECAR_DATA_DIR
  ?? path.join(os.homedir(), 'Library', 'Application Support', 'TyporAi', 'sidecar');
const allowedRoots = (process.env.TYPORAI_ALLOWED_ROOTS ?? os.homedir()).split(path.delimiter).filter(Boolean);
const server = new SidecarServer({ allowedRoots, dataDirectory, port, token, version: process.env.TYPORAI_VERSION ?? 'development' });

void server.listen();
process.once('SIGINT', () => { void server.close(); });
process.once('SIGTERM', () => { void server.close(); });
