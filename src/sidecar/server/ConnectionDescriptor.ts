import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ConnectionDescriptor {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly token: string;
  readonly pid: number;
  readonly sidecarVersion: string;
  readonly protocolMin: number;
  readonly protocolMax: number;
  readonly startedAt: number;
}

export async function writeConnectionDescriptor(filePath: string, descriptor: ConnectionDescriptor): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(descriptor), { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') await chmod(temporary, 0o600);
  await rename(temporary, filePath);
}
