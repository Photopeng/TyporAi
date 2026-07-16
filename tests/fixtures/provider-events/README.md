# Sanitized provider-event fixtures

These JSONL fixtures freeze representative wire events used by migration tests.
They contain no credentials, home paths, customer content, or real workspace
paths. `metadata.json` records the source adapter and the scenarios represented.
They are deliberately provider-native rather than a new shared event format;
the Sidecar adapter is responsible for normalizing them.

Before changing a fixture, capture the event from the real provider/runtime,
redact sensitive values, then update its metadata and the associated test.
