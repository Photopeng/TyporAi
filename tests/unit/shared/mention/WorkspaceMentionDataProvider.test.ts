import { WorkspaceMentionDataProvider } from '@/shared/mention/WorkspaceMentionDataProvider';
import { TyporaFile, TyporaFolder } from '@/typora/platform';

describe('WorkspaceMentionDataProvider', () => {
  it('returns cached workspace files and folders', () => {
    const note = new TyporaFile();
    note.name = 'note.md';
    note.path = 'notes/note.md';

    const folder = new TyporaFolder();
    folder.name = 'notes';
    folder.path = 'notes';

    const app = {
      vault: {
        getFiles: jest.fn(() => [note]),
        getAllLoadedFiles: jest.fn(() => [folder]),
      },
    } as any;

    const provider = new WorkspaceMentionDataProvider(app);

    expect(provider.getCachedWorkspaceFiles()).toEqual([{
      name: 'note.md',
      path: 'notes/note.md',
      mtime: 0,
    }]);
    expect(provider.getCachedWorkspaceFolders()).toEqual([{ name: 'notes', path: 'notes' }]);
  });

});
