import { resolveProjectRoot } from '@/application/document/ProjectRootResolver';

describe('resolveProjectRoot', () => {
  const dirname = (path: string) => path.slice(0, path.lastIndexOf('/'));
  it('prefers the mounted root and never falls back to the user home', () => {
    expect(resolveProjectRoot({ mountedRoot: '/project', documentPath: '/other/note.md', dirname })).toEqual({ kind: 'mounted', root: '/project' });
    expect(resolveProjectRoot({ mountedRoot: null, documentPath: null, dirname })).toEqual({ kind: 'unavailable', reason: 'unsaved-document' });
  });
});
