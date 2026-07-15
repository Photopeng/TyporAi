import type { DocumentService, DocumentSnapshot } from '@/core/ports';

export class DocumentContextService {
  private readonly subscriptions = new Set<(document: DocumentSnapshot | null) => void>();
  private readonly stop: () => void;

  constructor(private readonly documents: DocumentService) {
    this.stop = documents.subscribe(document => this.subscriptions.forEach(listener => listener(document)));
  }

  getCurrentDocument(): Promise<DocumentSnapshot | null> { return this.documents.getActiveDocument(); }
  onDocumentChanged(listener: (document: DocumentSnapshot | null) => void): () => void {
    this.subscriptions.add(listener);
    return () => this.subscriptions.delete(listener);
  }
  dispose(): void { this.stop(); this.subscriptions.clear(); }
}
