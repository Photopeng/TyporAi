# Provider capability matrix

TyporAi shares chat input, streaming, cancellation, retry, local history, current-document context, selected-text context, and confirmed inline edits across all providers.

| Capability | Claude | Codex | OpenCode | API |
| --- | --- | --- | --- | --- |
| Native CLI runtime/history | Yes | Yes | Yes | No |
| Images | Provider-dependent | Yes | Yes | No |
| Plan mode | Yes | Yes | Yes | No |
| Commands / skills / subagents | Yes | Skills / subagents | Commands / subagents | No |
| MCP runtime / in-app management | Yes / Yes | No / No | No / No | No / No |
| Rewind / fork / turn steer | Yes / Yes / No | No / Yes / Yes | No / planned / No | No / local / No |
| File or workspace tools | Provider-native | Provider-native | Provider-native | **Never** |

## API text-mode contract

The API provider only sends text messages and optional text context from the current document or selection. It must never send `tools`, `tool_choice`, Anthropic tool definitions, OpenAI function definitions, or tool results. It must never execute workspace operations, request approval, manage MCP, commands, skills, subagents, plan mode, or permission modes.
