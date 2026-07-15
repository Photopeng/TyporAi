export interface PathService {
  join(...parts: readonly string[]): string;
  dirname(path: string): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  relative?(from: string, to: string): string;
}
