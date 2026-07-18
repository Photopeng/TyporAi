import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SessionRepository, type VersionedConversation } from './SessionRepository';

export class PersistentSessionRepository {
  private persistQueue: Promise<void> = Promise.resolve();
  private repository: SessionRepository;

  private constructor(private readonly filePath: string, repository: SessionRepository) { this.repository = repository; }

  static async open(filePath: string): Promise<PersistentSessionRepository> {
    try {
      const snapshot = JSON.parse(await readFile(filePath, 'utf8')) as VersionedConversation[];
      if (!Array.isArray(snapshot)) throw new Error('Invalid session snapshot.');
      return new PersistentSessionRepository(filePath, SessionRepository.fromSnapshot(snapshot));
    } catch { return new PersistentSessionRepository(filePath, new SessionRepository()); }
  }

  get store(): SessionRepository { return this.repository; }

  persist(): Promise<void> {
    const operation = this.persistQueue.then(() => this.writeSnapshot());
    this.persistQueue = operation.catch(() => undefined);
    return operation;
  }

  private async writeSnapshot(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(this.repository.snapshot()), 'utf8');
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
