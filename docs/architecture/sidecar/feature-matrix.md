# Sidecar migration feature matrix

Status legend: `Pass` and `Fail` require linked execution evidence. `Not run` is
intentional baseline debt, not a claim of support. The legacy column is the
Windows release baseline; Sidecar columns remain `Not run` until their relevant
PR has passed the listed test and platform check.

| Feature | Current owner | Expected behavior | Automated test | Windows legacy | Windows sidecar | macOS Intel | macOS Apple Silicon | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Multiple tabs | `features/chat` | Create and retain independent conversations | `tests/unit/features/chat` | Not run | Not run | Not run | Not run | P0 | D0 manual test pending |
| Create, close, switch tab | `features/chat` | Tab lifecycle preserves active selection | `tests/unit/features/chat` | Not run | Not run | Not run | Not run | P0 | D0 manual test pending |
| History and restore | provider history stores | Restore provider-native conversation state | `tests/unit/providers/*/*History*.test.ts` | Not run | Not run | Not run | Not run | P0 | Provider history suites |
| Claude provider | `providers/claude` | Stream, approvals, history, tools | `tests/unit/providers/claude` | Not run | Not run | Not run | Not run | P0 | Claude suite |
| Codex provider | `providers/codex` | Stream, cancel, resume, history, plan | `tests/unit/providers/codex/runtime/CodexChatRuntime.test.ts` | Not run | Not run | Not run | Not run | P0 | Codex runtime suite |
| OpenCode provider | `providers/opencode` | Stream, approvals, modes, history | `tests/unit/providers/opencode/OpencodeChatRuntime.test.ts` | Not run | Not run | Not run | Not run | P0 | OpenCode runtime suite |
| Typora/API provider | provider registry | Provider remains selectable and functional | Provider capability tests | Not run | Not run | Not run | Not run | P1 | D0 manual test pending |
| Model selection | provider settings | Only supported model choices are shown and saved | provider settings tests | Not run | Not run | Not run | Not run | P1 | Settings suites |
| Reasoning / effort | provider runtime | Selected effort reaches the provider | Codex runtime tests | Not run | Not run | Not run | Not run | P1 | Codex suite |
| Permission modes | provider runtime | Approval policy is respected | Claude security / Codex router tests | Not run | Not run | Not run | Not run | P0 | Provider security suites |
| Plan | chat UI and providers | Plan is rendered and can be approved | Codex runtime tests | Not run | Not run | Not run | Not run | P1 | Provider fixtures |
| MCP | provider workspace services | Managed MCP configuration is available | MCP storage tests | Not run | Not run | Not run | Not run | P1 | Claude storage suite |
| Skills | provider command catalogs | `$` skills can be discovered and invoked | skill catalog tests | Not run | Not run | Not run | Not run | P1 | Claude/Codex skill tests |
| Subagents | provider agent services | Definitions and lifecycle events are available | agent tests | Not run | Not run | Not run | Not run | P1 | Provider agent suites |
| Commands, `#`, `$` | chat composer | Command and instruction modes preserve semantics | command/prompt tests | Not run | Not run | Not run | Not run | P1 | Provider command suites |
| File context | context utilities | Only selected and authorized files are provided | context utility tests | Not run | Not run | Not run | Not run | P0 | D0 manual test pending |
| Images | chat composer / providers | Attachments reach the selected provider | Codex runtime tests | Not run | Not run | Not run | Not run | P1 | Codex suite |
| Inline edit | `features/inline-edit` | Diff is shown before applying a change | inline-edit tests | Not run | Not run | Not run | Not run | P0 | D0 manual test pending |
| Diff | shared diff utilities | Changes are reviewable before apply | diff utility tests | Not run | Not run | Not run | Not run | P1 | D0 manual test pending |
| Approvals | chat UI / provider runtime | Dangerous actions await an explicit decision | provider approval tests | Not run | Not run | Not run | Not run | P0 | Provider fixtures |
| Keyboard shortcuts | chat UI | Shortcut bindings remain stable | UI tests | Not run | Not run | Not run | Not run | P1 | D0 manual test pending |
| Fork / rewind | provider runtime | Fork and rewind retain correct history | Codex session tests | Not run | Not run | Not run | Not run | P1 | Codex suite |
| Compact | provider runtime | Context compaction remains visible in history | Codex history tests | Not run | Not run | Not run | Not run | P1 | `codex-session-*.jsonl` |
| Cancel | provider runtime | Active work is interrupted without corrupting state | runtime tests | Not run | Not run | Not run | Not run | P0 | Provider runtime suites |
| Crash recovery | session stores | Restorable session metadata survives restart | session storage tests | Not run | Not run | Not run | Not run | P0 | Storage suite |
| Settings / environment | app and provider settings | Changes validate and persist correctly | settings reconciler tests | Not run | Not run | Not run | Not run | P0 | Settings suites |
| CLI probe | provider CLI resolvers | Availability and version are reported accurately | CLI resolver tests | Not run | Not run | Not run | Not run | P1 | Provider CLI suites |
| Install / repair / uninstall | deploy scripts | Installation is recoverable and fully removable | `npm run verify:typora` | Not run | Not run | Not run | Not run | P0 | Platform evidence pending |

## D0 evidence procedure

Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and
`npm run audit:architecture` before updating any result cell. Attach command
output or a platform-test record to the Evidence column; do not infer a Pass
from source inspection. Record Windows legacy results before enabling the
Sidecar path. macOS Intel and Apple Silicon require independent evidence.

## Rollback

Until the documented default-switch gate has passed, Windows must retain the
ElectronHost/legacy bundle as the rollback path. A Sidecar failure must be
recorded here and must not be papered over by deleting legacy behavior.

## Protocol baseline

Protocol v1 currently defines the JSON-RPC envelope, stable errors, complete
method namespace, server-event namespace, version negotiation, and the strict
`system.initialize` schema. All other method schemas are added with the owning
service migration; an unimplemented method must return `METHOD_NOT_SUPPORTED`.
Evidence: `tests/unit/protocol/protocol.test.ts`.
