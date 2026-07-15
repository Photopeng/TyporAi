import { OpencodeTaskResultInterpreter } from '@/providers/opencode/auxiliary/OpencodeTaskResultInterpreter';

describe('OpencodeTaskResultInterpreter', () => {
  describe('resolveTerminalStatus', () => {
    it('returns "completed" when toolUseResult.status is "success" even if fallback is "error"', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { status: 'success', content: [{ type: 'text', text: 'done' }] },
        'error',
      )).toBe('completed');
    });

    it('returns "error" when toolUseResult.retrieval_status is "error" even if fallback is "completed"', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { retrieval_status: 'error', error: 'oops' },
        'completed',
      )).toBe('error');
    });

    it('falls back to fallbackStatus when toolUseResult has no status fields', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.resolveTerminalStatus(
        { bar: 'baz' },
        'completed',
      )).toBe('completed');
    });
  });

  describe('extractStructuredResult', () => {
    it('extracts the output string from a toolUseResult.output field', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        output: 'final output',
      })).toBe('final output');
    });

    it('extracts text content from a toolUseResult.content array', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        content: [
          { type: 'text', text: 'opencode hello' },
        ],
      })).toBe('opencode hello');
    });

    it('returns an error-prefixed message when retrieval_status is "error"', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.extractStructuredResult({
        retrieval_status: 'error',
        error: 'opencode error',
      })).toBe('Error: opencode error');
    });
  });

  describe('extractAgentId', () => {
    it('returns agent_id from toolUseResult.agent_id field', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.extractAgentId({ agent_id: 'agent-opencode' })).toBe('agent-opencode');
    });

    it('returns null when no agent identifier is present', () => {
      const interpreter = new OpencodeTaskResultInterpreter();

      expect(interpreter.extractAgentId({ content: [{ type: 'text', text: 'no id' }] })).toBeNull();
    });
  });
});
