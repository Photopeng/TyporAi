import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SessionRepository, type VersionedConversation } from './SessionRepository';

export class PersistentSessionRepository {
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

  async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(this.repository.snapshot()), 'utf8');
    await rename(temporary, this.filePath);
  }
}
