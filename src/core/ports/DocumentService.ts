export interface DocumentSnapshot {
  readonly path: string | null;
  readonly revision: string | null;
  readonly text: string;
}

export interface DocumentService {
  getActiveDocument(): Promise<DocumentSnapshot | null>;
  subscribe(listener: (document: DocumentSnapshot | null) => void): () => void;
  dispose?(): Promise<void> | void;
}
