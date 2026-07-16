# ADR-002: Dual bundles during migration

## Status

Accepted for the migration.

## Decision

Build a browser-only `typora-typorai.renderer.js` and a Windows-only rollback
`typora-typorai.legacy.js`. The browser bundle may not import Node builtins,
ElectronHost, `require`, or provider-native runtimes.

## Consequences

The bundles have separate entry points and static audits. ElectronHost remains
available until all default-switch and stability gates have passed; it is not
removed as part of Sidecar work.
