# Sidecar remediation status

This file records repository-backed remediation evidence for v2.0.30. It is
not a Stable-release approval: real Typora and platform evidence is required
before that label can be used.

## Implemented and covered by automated tests

- Safe default permission mode and a shared Sidecar permission-policy model.
- Connection leases with a reconnect grace period, per-window ownership, and
  connection-scoped cleanup.
- Runtime, turn, approval, watch, and stream ownership isolation.
- Atomic queued persistence for settings, tab layout, MCP, and workspace grant.
- Reconnect, descriptor endpoint refresh, lease resume, and bounded stream replay.
- Stable RPC errors for invalid parameters, revision conflicts, blobs, and
  idempotency-key reuse.
- Bounded Blob staging, approval queues, replay buffers, and file-operation
  idempotency cache.
- Installation state, repair verification, Windows task/service cleanup, and
  release/PR quality-gate workflow coverage.

## Still required before Stable

- Windows Sidecar and macOS Apple Silicon real-Typora matrix
  evidence for install, repair, upgrade, uninstall, rollback, approvals,
  multi-window operation, and crash recovery.
- Provider P0 feature-matrix evidence against real Claude, Codex, OpenCode,
  and Typora/API executables.
- A 24-hour soak run demonstrating stable Runtime, process, watch, blob,
  approval, and memory counts.
- Human Stable-gate review and linked release evidence.

## Current platform evidence

- Windows x64 (2026-07-19): Repair and Verify completed against the local
  Typora installation. The deployed Sidecar reported healthy persistence and
  process management over localhost with descriptor version `2.0.30`.
- Windows persistent startup is not yet evidenced: the current non-elevated
  session was denied permission to create the `TyporAi Sidecar` scheduled
  task. Loader-driven/on-demand Sidecar startup remains available.
- macOS Apple Silicon evidence remains user-operated and pending.

## Interpretation

Passing repository checks prove the covered unit, contract, and integration
behaviour only. They do not prove OS service registration, Typora compatibility,
or Provider CLI behaviour on a user machine.
