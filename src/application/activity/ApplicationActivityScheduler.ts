import type { ActivityScheduler, ScheduledTask } from '@/core/ports';

export class ApplicationActivityScheduler implements ActivityScheduler {
  private readonly tasks = new Set<ReturnType<typeof setTimeout>>();
  schedule(delayMs: number, task: () => void): ScheduledTask {
    const timer = setTimeout(() => { this.tasks.delete(timer); task(); }, delayMs);
    this.tasks.add(timer);
    return { dispose: () => { clearTimeout(timer); this.tasks.delete(timer); } };
  }
  dispose(): void { this.tasks.forEach(timer => clearTimeout(timer)); this.tasks.clear(); }
}
