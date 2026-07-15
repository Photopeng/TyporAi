import type { Unsubscribe } from './types';

export type EventMap = Record<string, unknown>;
export type EventHandler<TPayload> = (payload: TPayload) => void;

export class EventBus<TEvents extends EventMap = EventMap> {
  private listeners = new Map<keyof TEvents, Set<EventHandler<TEvents[keyof TEvents]>>>();

  on<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): Unsubscribe {
    const handlers = this.listeners.get(eventName) ?? new Set<EventHandler<TEvents[keyof TEvents]>>();
    handlers.add(handler as EventHandler<TEvents[keyof TEvents]>);
    this.listeners.set(eventName, handlers);

    return () => {
      handlers.delete(handler as EventHandler<TEvents[keyof TEvents]>);
      if (handlers.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;

    for (const handler of [...handlers]) {
      handler(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount(eventName?: keyof TEvents): number {
    if (eventName !== undefined) {
      return this.listeners.get(eventName)?.size ?? 0;
    }

    let count = 0;
    for (const handlers of this.listeners.values()) {
      count += handlers.size;
    }
    return count;
  }
}
