# TyporAi

TyporAi is a Typora-only AI assistant plugin for document editing, citations, quick questions, and multi-step writing workflows.

## Features

- Embedded right-side chat panel inside Typora.
- Independent quote preview above the chat input.
- Provider support for Claude, Codex, OpenCode, and Typora API workflows.
- Local settings and session storage under TyporAi-owned paths.

## Development

```bash
npm install
npm run typecheck:typora
npm run build:typora
```

## Deploy To Typora

Close Typora before deploying, then run:

```bash
npm run deploy:typora
npm run verify:typora
```

The plugin is installed to:

```text
%APPDATA%\Typora\plugins\typorai
```

The Typora loader is injected into:

```text
C:\Program Files\Typora\resources\window.html
```

## Project Notes

This project is a clean TyporAi plugin. It does not migrate or read legacy data from earlier plugin names or storage namespaces.
