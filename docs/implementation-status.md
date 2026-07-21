# Residue cleanup and settings unification status

## Completed in this branch

- API is text-only: no provider tool definitions, tool loops, workspace execution, approval callbacks, or mutation callbacks remain.
- API is opt-in on a new installation and is displayed as **API** while retaining the `typora` internal ID for existing settings.
- OpenCode exposes a persisted default mode and explains that runtime-discovered commands are read-only in TyporAi.
- MCP runtime capability is distinct from in-app MCP management capability.
- Settings and session metadata use schema version `1`; legacy `.claude/typorai-*` settings and session files are retained as read-only migration sources while new data writes under `.typorai`.
- Chinese provider and platform terminology has been corrected for API, WSL, Codex, Ubuntu, Sonnet, Opus, and OpenCode.
- The architecture audit prevents API tool-calling regressions.
- API settings provide explicit protocol selection, a document-free connection test, and credential redaction in returned errors.
- Claude, Codex, and OpenCode use one shared current-CLI selector that makes their mutual exclusion explicit.
- All ten locale catalogs use workspace/document terminology and are structurally verified against English.

## Still requiring implementation or real-environment evidence

- Shared CLI settings sections, diagnostics, runtime tests, and restart/save feedback are not yet fully unified across Claude, Codex, and OpenCode.
- CLI-native `.claude` paths and legal attribution are intentionally allowlisted during terminology checks.
- macOS Apple Silicon CLI discovery, architecture validation, Finder/Dock startup, TCC behavior, sleep/wake, and process cleanup require real macOS hardware validation.
- Provider diagnostic panels and comprehensive CLI parity coverage remain to be implemented.
- OpenCode provider-neutral fork behavior remains unimplemented: the currently integrated OpenCode protocol exposes session creation but no verified fork/branch endpoint, so the capability remains correctly disabled.
