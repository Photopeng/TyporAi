import type { HostServices } from '@/core/ports';

import { ProviderServiceContainer } from './ProviderServiceContainer';

export interface ApplicationRuntime {
  readonly host: HostServices;
  readonly providers: ProviderServiceContainer;
  dispose(): Promise<void>;
}

export function createApplicationRuntime(host: HostServices): ApplicationRuntime {
  const providers = new ProviderServiceContainer();
  let disposed = false;

  return {
    host,
    providers,
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      try { await providers.dispose(); } catch (error) { errors.push(error); }
      try { await host.documents.dispose?.(); } catch (error) { errors.push(error); }
      try { await host.processes.dispose?.(); } catch (error) { errors.push(error); }
      try { host.watches.dispose(); } catch (error) { errors.push(error); }
      try { host.scheduler.dispose(); } catch (error) { errors.push(error); }
      if (errors.length > 0) throw new AggregateError(errors, 'Application runtime disposal failed');
    },
  };
}
