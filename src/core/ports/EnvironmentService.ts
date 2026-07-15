export interface EnvironmentService {
  get(name: string): string | null;
  homeDirectory(): string | null;
  findExecutable(name: string): Promise<string | null>;
}
