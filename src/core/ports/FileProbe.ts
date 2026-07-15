/** Synchronous, read-only file capability for UI validation and CLI discovery. */
export interface FileProbe {
  exists(path: string): boolean;
  isFile(path: string): boolean;
  readText(path: string): string;
  list(path: string): readonly { name: string; isFile: boolean }[];
  remove?(path: string): Promise<void>;
}
