export interface ScheduledTask {
  dispose(): void;
}

export interface ActivityScheduler {
  schedule(delayMs: number, task: () => void): ScheduledTask;
  dispose(): void;
}
