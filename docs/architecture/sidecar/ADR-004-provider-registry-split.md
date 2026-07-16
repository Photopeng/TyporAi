# ADR-004: Split provider registries

## Status

Accepted for the migration.

## Decision

RendererProviderRegistry contains static UI descriptors, icons, capabilities,
settings renderers, and BridgeChatRuntime factories. SidecarProviderRegistry
contains native runtimes, history, CLI detection, MCP, skills, agents, and
auxiliary services.

## Consequences

The browser bundle never imports SidecarProviderRegistry or a provider SDK.
Provider settings are represented as data and schema; Sidecar does not return
HTML or DOM instructions.
