# Sidecar migration completion audit

This audit separates repository evidence from platform evidence. It is not a
claim that the migration is complete.

| Plan area | Repository evidence | Status |
|---|---|---|
| D0 baseline and ADRs | Feature matrix, ADR-001 through ADR-005, fixtures and automated suites | Code evidence present; platform matrix not run |
| D1 protocol | Protocol v1 schemas, authentication, negotiation and contract tests | Implemented and tested |
| D2-D7 Sidecar/bridge/state/process/providers | Sidecar server, bridge client, state stores, process transport and provider runtimes | Implemented in repository; provider real-device behavior not accepted |
| D8 MCP, skills and agents | Persistent MCP store/test, workspace discovery and agent RPC | Implemented and tested |
| D9 files, images and inline edit | Hash-protected file service, backups/restore, blob upload and private attachment context | Files and blob boundary implemented; Codex maps staged attachments to native `localImage` inputs; Claude/OpenCode semantics and full inline-edit acceptance remain open |
| D10 delivery and diagnostics | Platform packages, checksums, release workflow, deploy/repair/uninstall and redacted diagnostics | Implemented and tested in repository; install/upgrade/rollback hardware evidence open |
| D11 switching/retirement | Explicit Windows legacy rollback, legacy package artifact and default-switch gate | Gate intentionally open; no retirement or default-switch claim |

## Required before final completion

- Complete the remaining D9 provider image and inline-edit acceptance paths.
- Execute the Windows legacy/Sidecar, macOS Intel and macOS Apple Silicon feature matrices.
- Verify clean install, upgrade, repair, rollback, uninstall, provider compatibility, process cleanup and soak requirements on the documented hardware.
- Maintain Windows legacy until every row in `default-switch-gate.md` has direct passing evidence and a stable release cycle has elapsed.

Automated checks are evidence for code behavior only. They do not close a platform matrix cell or authorize ElectronHost retirement.
