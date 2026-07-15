import { ApplicationActivityScheduler } from '@/application/activity/ApplicationActivityScheduler';

describe('ApplicationActivityScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cancels pending tasks when disposed', () => {
    const scheduler = new ApplicationActivityScheduler();
    const task = jest.fn();
    scheduler.schedule(100, task);
    scheduler.dispose();
    jest.advanceTimersByTime(100);
    expect(task).not.toHaveBeenCalled();
  });
});
