export type Unsubscribe = () => void;

export type NoticeType = 'info' | 'success' | 'error';

export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  mtime: number;
  size: number;
}
