import { EventReplayBuffer } from '@/sidecar/server/EventReplayBuffer';

describe('EventReplayBuffer', () => {
  it('assigns monotonic sequences and replays unconsumed events', () => {
    const replay = new EventReplayBuffer('connection-1', 'turn-1');
    replay.append('chat.chunk', { text: 'a' });
    const second = replay.append('chat.chunk', { text: 'b' });
    expect(second.seq).toBe(2);
    expect(replay.replayAfter(1)).toEqual([second]);
  });

  it('requests resync when the requested position falls outside its bounded history', () => {
    const replay = new EventReplayBuffer('connection-1', 'turn-1', 1);
    replay.append('chat.chunk', { text: 'a' });
    replay.append('chat.chunk', { text: 'b' });
    expect(replay.replayAfter(0)).toBeNull();
  });
});
