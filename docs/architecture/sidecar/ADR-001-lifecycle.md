# ADR-001: Sidecar lifecycle

## Status

Accepted for the migration.

## Decision

TyporAi Sidecar is an operating-system-managed, per-user service: a
LaunchAgent on macOS and a per-user startup task or resident agent on Windows.
It does not require administrator rights by default. Provider runtimes, PTYs,
temporary CLIs, and helpers are owned and reaped by Sidecar.

## Consequences

Closing Typora may leave only the installed Sidecar service running. It must
not leave unmanaged provider or helper children. A product decision to exit
with Typora is a separate lease/idle-shutdown design and is not implemented in
parallel.
