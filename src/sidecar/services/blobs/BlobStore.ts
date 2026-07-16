import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class BlobNotFoundError extends Error {}
export class BlobPayloadTooLargeError extends Error {}

interface PendingBlob {
  readonly bytes: number;
  readonly chunks: Buffer[];
  readonly mimeType: string;
  readonly temporaryPath: string;
}

/** Sidecar-owned bounded upload staging for browser File and clipboard data. */
export class BlobStore {
  private readonly pending = new Map<string, PendingBlob>();
  private readonly committed = new Map<string, string>();

  constructor(private readonly directory: string, private readonly maxBlobBytes = 20 * 1024 * 1024, private readonly maxChunkBytes = 1024 * 1024) {}

  begin(bytes: number, mimeType: string): { readonly blobId: string; readonly maxChunkBytes: number } {
    if (!Number.isInteger(bytes) || bytes < 0 || bytes > this.maxBlobBytes || !mimeType) throw new BlobPayloadTooLargeError('Blob exceeds the Sidecar upload limit.');
    const blobId = randomUUID();
    this.pending.set(blobId, { bytes, chunks: [], mimeType, temporaryPath: path.join(this.directory, `${blobId}.upload`) });
    return { blobId, maxChunkBytes: this.maxChunkBytes };
  }

  chunk(blobId: string, base64: string): void {
    const blob = this.requirePending(blobId);
    const chunk = Buffer.from(base64, 'base64');
    if (chunk.byteLength > this.maxChunkBytes || this.sizeOf(blob) + chunk.byteLength > blob.bytes) throw new BlobPayloadTooLargeError('Blob chunk exceeds its declared size.');
    blob.chunks.push(chunk);
  }

  async commit(blobId: string): Promise<{ readonly mimeType: string; readonly path: string; readonly size: number }> {
    const blob = this.requirePending(blobId);
    const content = Buffer.concat(blob.chunks);
    if (content.byteLength !== blob.bytes) throw new BlobPayloadTooLargeError('Blob size does not match its declared size.');
    await mkdir(this.directory, { recursive: true });
    const finalPath = path.join(this.directory, `${blobId}.blob`);
    await writeFile(blob.temporaryPath, content);
    await rename(blob.temporaryPath, finalPath);
    this.pending.delete(blobId);
    this.committed.set(blobId, finalPath);
    return { mimeType: blob.mimeType, path: finalPath, size: content.byteLength };
  }

  async abort(blobId: string): Promise<void> {
    const pending = this.pending.get(blobId);
    this.pending.delete(blobId);
    const committedPath = this.committed.get(blobId);
    this.committed.delete(blobId);
    await Promise.all([pending?.temporaryPath, committedPath].filter((value): value is string => Boolean(value)).map(target => rm(target, { force: true })));
  }

  async cleanupAll(): Promise<void> {
    const ids = [...new Set([...this.pending.keys(), ...this.committed.keys()])];
    await Promise.all(ids.map(blobId => this.abort(blobId)));
  }

  async getCommittedPath(blobId: string): Promise<string> {
    const target = this.committed.get(blobId);
    if (!target) throw new BlobNotFoundError('Blob is not committed.');
    await stat(target);
    return target;
  }

  private requirePending(blobId: string): PendingBlob {
    const blob = this.pending.get(blobId);
    if (!blob) throw new BlobNotFoundError('Blob upload not found.');
    return blob;
  }

  private sizeOf(blob: PendingBlob): number { return blob.chunks.reduce((size, chunk) => size + chunk.byteLength, 0); }
}
