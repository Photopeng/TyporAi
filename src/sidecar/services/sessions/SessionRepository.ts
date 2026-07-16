import type { Conversation } from '@/core/types';

export interface VersionedConversation {
  readonly revision: number;
  readonly conversation: Conversation;
}

export class SessionNotFoundError extends Error {
  constructor(id: string) { super(`Session not found: ${id}`); }
}

export class SessionRevisionConflictError extends Error {
  constructor(id: string) { super(`Session revision conflict: ${id}`); }
}

export class SessionRepository {
  private readonly sessions = new Map<string, VersionedConversation>();
  private readonly idempotentResults = new Map<string, VersionedConversation>();
  private readonly idempotentDeletes = new Set<string>();

  list(): readonly VersionedConversation[] { return [...this.sessions.values()].map(clone); }
  snapshot(): readonly VersionedConversation[] { return this.list(); }

  static fromSnapshot(snapshot: readonly VersionedConversation[]): SessionRepository {
    const repository = new SessionRepository();
    for (const entry of snapshot) repository.sessions.set(entry.conversation.id, clone(entry));
    return repository;
  }
  get(id: string): VersionedConversation { return clone(this.require(id)); }

  create(conversation: Conversation, idempotencyKey: string): VersionedConversation {
    const existing = this.idempotentResults.get(idempotencyKey);
    if (existing) return clone(existing);
    if (this.sessions.has(conversation.id)) throw new Error(`Session already exists: ${conversation.id}`);
    const created = { revision: 1, conversation: structuredClone(conversation) };
    this.sessions.set(conversation.id, created);
    this.idempotentResults.set(idempotencyKey, created);
    return clone(created);
  }

  applyPatch(id: string, patch: Partial<Conversation>, expectedRevision: number, idempotencyKey: string): VersionedConversation {
    const existing = this.idempotentResults.get(idempotencyKey);
    if (existing) return clone(existing);
    const current = this.require(id);
    if (current.revision !== expectedRevision) throw new SessionRevisionConflictError(id);
    const updated = { revision: current.revision + 1, conversation: { ...structuredClone(current.conversation), ...structuredClone(patch), id } };
    this.sessions.set(id, updated);
    this.idempotentResults.set(idempotencyKey, updated);
    return clone(updated);
  }

  fork(sourceId: string, fork: Conversation, expectedSourceRevision: number, idempotencyKey: string): VersionedConversation {
    const existing = this.idempotentResults.get(idempotencyKey);
    if (existing) return clone(existing);
    const source = this.require(sourceId);
    if (source.revision !== expectedSourceRevision) throw new SessionRevisionConflictError(sourceId);
    if (this.sessions.has(fork.id)) throw new Error(`Session already exists: ${fork.id}`);
    const conversation = { ...structuredClone(source.conversation), ...structuredClone(fork), id: fork.id };
    const created = { revision: 1, conversation };
    this.sessions.set(conversation.id, created);
    this.idempotentResults.set(idempotencyKey, created);
    return clone(created);
  }

  delete(id: string, expectedRevision: number, idempotencyKey?: string): void {
    if (idempotencyKey && this.idempotentDeletes.has(idempotencyKey)) return;
    const current = this.require(id);
    if (current.revision !== expectedRevision) throw new SessionRevisionConflictError(id);
    this.sessions.delete(id);
    if (idempotencyKey) this.idempotentDeletes.add(idempotencyKey);
  }

  private require(id: string): VersionedConversation {
    const session = this.sessions.get(id);
    if (!session) throw new SessionNotFoundError(id);
    return session;
  }
}

function clone(value: VersionedConversation): VersionedConversation { return structuredClone(value); }
