# Settings inventory

All provider settings are stored below `providerConfigs`; the internal API provider ID remains `typora` for compatibility while its user-visible name is **API**.

| Provider | Settings source | Scope |
| --- | --- | --- |
| Claude | `providerConfigs.claude` and Claude-native `.claude` files | CLI path, model, permissions, Claude commands/skills/agents/MCP/plugins/environment |
| Codex | `providerConfigs.codex` and `.codex` files | execution target, CLI path, model, sandbox, skills/subagents/environment |
| OpenCode | `providerConfigs.opencode` | CLI path, discovered models/modes, commands, subagents/environment |
| API | `providerConfigs.typora` | enabled flag, API key, base URL, model, reasoning effort; text-only |

Runtime-affecting settings must recycle the affected runtime after they are saved. CLI provider selection is mutually exclusive and is coordinated through `setSingleEnabledCliProvider`.
