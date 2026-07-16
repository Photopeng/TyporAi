import { readFile } from 'node:fs/promises';

const bundle = await readFile('typora-typorai.renderer.js', 'utf8');
const forbidden = [
  /\bwindow\.(?:reqnode|require)\b/,
  /\brequire\s*\(/,
  /node:(?:fs|path|child_process|os|net|http)/,
  /\belectron\b/i,
  /CodexChatRuntime|ClaudeChatRuntime|OpencodeChatRuntime/,
  /claude-agent-sdk|codex app-server|@openai\/codex-sdk/,
];
const matches = forbidden.filter(pattern => pattern.test(bundle)).map(pattern => pattern.toString());
if (matches.length > 0) throw new Error(`Browser renderer contains forbidden runtime references: ${matches.join(', ')}`);
console.log('Browser renderer audit passed.');
