import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Conversation } from '@/core/types';
import { PersistentSessionRepository } from '@/sidecar/services/sessions/PersistentSessionRepository';
import { SessionRepository, SessionRevisionConflictError } from '@/sidecar/services/sessions/SessionRepository';

const conversation: Conversation = { createdAt: 1, id: 'session-1', messages: [], providerId: 'claude', sessionId: null, title: 'Test', updatedAt: 1 };

describe('SessionRepository', () => {
  it('is the revision-checked, idempotent authority for session metadata', () => {
    const sessions = new SessionRepository();
    expect(sessions.create(conversation, 'create-1')).toMatchObject({ revision: 1, conversation: { id: 'session-1' } });
    expect(sessions.applyPatch('session-1', { title: 'Updated' }, 1, 'patch-1')).toMatchObject({ revision: 2, conversation: { title: 'Updated' } });
    expect(sessions.applyPatch('session-1', { title: 'Ignored' }, 1, 'patch-1')).toMatchObject({ revision: 2, conversation: { title: 'Updated' } });
    expect(() => sessions.applyPatch('session-1', { title: 'Stale' }, 1, 'patch-2')).toThrow(SessionRevisionConflictError);
  });

  it('persists session revisions across a Sidecar restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-sessions-'));
    const file = path.join(directory, 'sessions.json');
    const first = await PersistentSessionRepository.open(file);
    first.store.create(conversation, 'create-1');
    await first.persist();
    const second = await PersistentSessionRepository.open(file);
    expect(second.store.get('session-1')).toMatchObject({ revision: 1, conversation: { title: 'Test' } });
  });

  it('serializes concurrent persistence without temporary-file collisions or lost sessions', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-sessions-concurrent-'));
    const file = path.join(directory, 'sessions.json');
    const repository = await PersistentSessionRepository.open(file);
    const writes: Promise<void>[] = [];

    for (let index = 0; index < 24; index += 1) {
      repository.store.create({
        ...conversation,
        id: `session-${index}`,
        title: `Session ${index}`,
      }, `create-${index}`);
      writes.push(repository.persist());
    }

    await expect(Promise.all(writes)).resolves.toHaveLength(24);
    const reopened = await PersistentSessionRepository.open(file);
    expect(reopened.store.list()).toHaveLength(24);
  });

  it('forks a source session through a revision-guarded Sidecar write', () => {
    const sessions = new SessionRepository();
    sessions.create(conversation, 'create-source');
    const fork = sessions.fork('session-1', { ...conversation, id: 'session-fork', title: 'Forked conversation' }, 1, 'fork-1');
    expect(fork).toMatchObject({ revision: 1, conversation: { id: 'session-fork', title: 'Forked conversation' } });
    expect(sessions.get('session-1')).toMatchObject({ conversation: { id: 'session-1' } });
  });
});
