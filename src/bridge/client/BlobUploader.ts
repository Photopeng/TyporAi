export interface BlobRpcClient {
  request<TResult>(method: string, params?: unknown, signal?: AbortSignal): Promise<TResult>;
}

export interface UploadedBlob {
  readonly blobId: string;
  readonly mimeType: string;
  readonly size: number;
}

/** Bounded browser File uploader; raw file bytes never enter renderer persistence. */
export class BlobUploader {
  constructor(private readonly rpc: BlobRpcClient) {}

  async upload(file: Blob, signal?: AbortSignal): Promise<UploadedBlob> {
    const started = await this.rpc.request<{ blobId: string; maxChunkBytes: number }>('blob.begin', { bytes: file.size, mimeType: file.type || 'application/octet-stream' }, signal);
    try {
      for (let offset = 0; offset < file.size; offset += started.maxChunkBytes) {
        const bytes = new Uint8Array(await file.slice(offset, offset + started.maxChunkBytes).arrayBuffer());
        await this.rpc.request('blob.chunk', { blobId: started.blobId, data: toBase64(bytes) }, signal);
      }
      const committed = await this.rpc.request<{ mimeType: string; size: number }>('blob.commit', { blobId: started.blobId }, signal);
      return { blobId: started.blobId, mimeType: committed.mimeType, size: committed.size };
    } catch (error) {
      void this.rpc.request('blob.abort', { blobId: started.blobId });
      throw error;
    }
  }
}

function toBase64(value: Uint8Array): string {
  let text = '';
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text);
}
