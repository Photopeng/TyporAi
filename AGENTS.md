# TyporAi contributor guide

TyporAi is a Typora sidebar plugin with four providers: Claude, Codex, OpenCode, and API. The shared chat feature owns presentation and provider-neutral contracts; each provider owns runtime protocol, settings reconciliation, history, and provider-specific workspace services.

## Provider boundaries

- Claude, Codex, and OpenCode are CLI providers. Their native capabilities must be declared in `ProviderCapabilities` and gated in the UI.
- API is text-only. It may receive text from the active document and selection, but it must not expose or execute tools, MCP, commands, skills, subagents, plan mode, or filesystem operations.
- Use `provider-capability-matrix.md` as the contract before changing provider behavior.

## Terminology and storage

Use **workspace** and **document** in new user-facing and core code. Compatibility aliases may remain only while callers migrate. New TyporAi data writes to `.typorai`; `.claude` remains valid for Claude CLI-native configuration and read-only migration.

## Settings and testing

Provider settings must provide clear save/error/restart semantics and preserve the mutual exclusion of CLI providers. Tests mirror `src/` below `tests/`. Before submitting changes run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

The detailed inventories and allowlist live in `docs/`.
