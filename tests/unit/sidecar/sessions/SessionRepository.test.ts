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
});
