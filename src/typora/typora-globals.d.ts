declare global {
  interface Window {
    reqnode?: (moduleName: string) => unknown;
    bridge?: {
      callHandler: (command: string, options: unknown, callback: (result: unknown) => void) => void;
      callSync: (command: string, options?: unknown) => unknown;
    };
  }
}

export {};
