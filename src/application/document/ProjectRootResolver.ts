export type ProjectContext =
  | { readonly kind: 'mounted'; readonly root: string }
  | { readonly kind: 'document-directory'; readonly root: string }
  | { readonly kind: 'unavailable'; readonly reason: 'unsaved-document' | 'no-document' };

export interface ProjectRootInput {
  readonly mountedRoot: string | null;
  readonly documentPath: string | null;
  readonly dirname: (path: string) => string;
}

export function resolveProjectRoot(input: ProjectRootInput): ProjectContext {
  if (input.mountedRoot) return { kind: 'mounted', root: input.mountedRoot };
  if (input.documentPath) return { kind: 'document-directory', root: input.dirname(input.documentPath) };
  return { kind: 'unavailable', reason: 'unsaved-document' };
}
