# ADR-003: Sidecar owns persistent business state

## Status

Accepted for the migration.

## Decision

Sidecar is the only writer for settings, workspace grants, session metadata,
provider state, native transcripts, and provider configuration. Renderers may
cache projections only. Persistent writes use revision checks and idempotency
keys through RPC. Sidecar caches the outcome of each file-operation method/key
pair so a transport retry does not repeat the write.

## Consequences

The renderer must not directly write `.typorai`, `.claude`, `.codex`, OpenCode
data, or user TyporAi configuration once its Sidecar path is enabled. Revision
conflicts are explicit protocol errors, never last-writer-wins behavior.

For external workspace-file edits, Sidecar stores a private backup before a
user-approved overwrite. Restore validates the requested revision when one is
provided and recreates a deleted target's parent directory; the Renderer never
writes the backup store directly.
