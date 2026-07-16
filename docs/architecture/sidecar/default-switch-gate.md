# Sidecar default-switch and legacy retirement gate

## Current policy

No default-switch or ElectronHost-retirement condition is satisfied by source-level checks alone. macOS Sidecar deployment is available for controlled validation. Windows Sidecar remains a rollout candidate and the Windows legacy/ElectronHost bundle remains a required rollback artifact. No change in this repository may delete that bundle, its build, or its rollback documentation before this gate is explicitly closed.

## Required evidence before enabling Windows Sidecar by default

| Gate | Required evidence | Current state |
|---|---|---|
| Automated quality suite | Typecheck, lint, full test suite, build, architecture/renderer/Sidecar audits | Code CI coverage exists; release-run evidence pending |
| Windows legacy matrix | Supported Windows and Typora combinations, including one-click legacy rollback | Not run |
| Windows Sidecar matrix | Clean install, upgrade, repair, uninstall, process cleanup and provider matrix | Not run |
| macOS Intel matrix | Clean install, repair, upgrade and provider matrix | Not run |
| macOS Apple Silicon matrix | Clean install, repair, upgrade, architecture/PATH cases and provider matrix | Not run |
| Provider compatibility | Claude, Codex, OpenCode and Typora/API supported-version probes | Not run |
| Soak and process safety | Stable release cycle with no P0/P1 data, permission or process-leak incident | Not run |

## Rollout order

1. Validate macOS Sidecar internally.
2. Enable Windows Sidecar only through an explicit opt-in release configuration while preserving legacy rollback.
3. Make Sidecar the Windows default only after every row above has linked, passing evidence.
4. Retain legacy for at least one stable release cycle after the default change.
5. Retire ElectronHost only in a separate PR after usage, migration, rollback, and release-package gates are closed.

The feature matrix is the authoritative location for platform execution evidence. A successful build, deployment-file check, or CI artifact is not a substitute for a matrix result.

For a controlled Windows rollback, reinstall with `TYPORAI_RENDERER_MODE=legacy` in the environment. This selects the packaged legacy bundle; it is not available on macOS and does not alter the default Sidecar path.
