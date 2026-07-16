export interface ShutdownParticipant {
  close(): void | Promise<void>;
}

/** Ensures repeated OS signals share one orderly Sidecar shutdown sequence. */
export class ShutdownCoordinator {
  private shutdownPromise: Promise<void> | null = null;

  constructor(private readonly participant: ShutdownParticipant) {}

  shutdown(): Promise<void> {
    this.shutdownPromise ??= Promise.resolve(this.participant.close());
    return this.shutdownPromise;
  }
}
