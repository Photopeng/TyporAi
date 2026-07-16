# ADR-005: Security boundary and process execution

## Status

Accepted for the migration.

## Decision

The public renderer protocol does not expose arbitrary executable-plus-args
process launching. Provider runtimes start processes inside Sidecar. Approved
shell actions use a narrowly scoped `shell.executeApproved` design with
workspace grants, command policy, user approval, and audit records.

## Consequences

A temporary constrained process contract may exist solely for host-contract
testing. It is not a stable renderer capability. Protocol errors are stable
codes and logs, descriptors, and diagnostics never include tokens, API keys,
full environment values, prompts, or document contents.

Blob upload responses likewise expose only an opaque blob identifier, MIME type,
and byte count. The temporary file path is resolved only inside Sidecar when a
provider consumes the attachment, and is removed on abort or turn completion.
