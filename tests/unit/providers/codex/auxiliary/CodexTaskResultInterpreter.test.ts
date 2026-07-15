import { CodexTaskResultInterpreter } from '@/providers/codex/auxiliary/CodexTaskResultInterpreter';

describe('CodexTaskResultInterpreter', () => {
  describe('resolveTerminalStatus', () => {
    it('returns "completed" when toolUseResult.status is "completed" even if fallback is "error"', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { status: 'completed', content: [{ type: 'text', text: 'done' }] },
        'error',
      )).toBe('completed');
    });

    it('returns "error" when toolUseResult.retrieval_status is "error" even if fallback is "completed"', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { retrieval_status: 'error', error: 'boom' },
        'completed',
      )).toBe('error');
    });

    it('falls back to fallbackStatus when toolUseResult has no status fields', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { foo: 'bar' },
        'error',
      )).toBe('error');
    });
  });

  describe('extractStructuredResult', () => {
    it('extracts the result string from a toolUseResult.result field', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        result: 'final answer',
      })).toBe('final answer');
    });

    it('extracts text content from a toolUseResult.content array', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        content: [
          { type: 'text', text: 'hello world' },
        ],
      })).toBe('hello world');
    });

    it('returns an error-prefixed message when retrieval_status is "error"', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        retrieval_status: 'error',
        error: 'agent failed',
      })).toBe('Error: agent failed');
    });
  });

  describe('extractAgentId', () => {
    it('returns agentId from toolUseResult.agentId field', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.extractAgentId({ agentId: 'agent-codex' })).toBe('agent-codex');
    });

    it('returns null when no agent identifier is present', () => {
      const interpreter = new CodexTaskResultInterpreter();

      expect(interpreter.extractAgentId({ content: [{ type: 'text', text: 'no id' }] })).toBeNull();
    });
  });
});
