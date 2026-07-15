import type { ApprovalCallback } from '../runtime/types';

export interface EngineToolEvent {
  id: string;
  name: string;
  input?: unknown;
  output?: unknown;
}

export interface EngineCallbacks {
  onToken?: (token: string) => void;
  onToolStart?: (event: EngineToolEvent) => void;
  onToolEnd?: (event: EngineToolEvent) => void;
  onError?: (error: Error) => void;
  onFinish?: (message: AgentMessage) => void;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentChatRequest {
  prompt: string;
  workspacePath: string;
  currentFilePath?: string | null;
  currentDocument?: string;
  selection?: string;
  history?: AgentMessage[];
  approvalCallback?: ApprovalCallback | null;
  replaceSelection?: (text: string) => boolean | void;
}

export interface AgentEngineConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  apiModel?: string;
  effortLevel?: string;
}

export interface IAgentEngine {
  init(): Promise<void>;
  chat(request: AgentChatRequest, callbacks: EngineCallbacks): Promise<AgentMessage>;
  abort(): void;
  getHistory(): AgentMessage[];
}
