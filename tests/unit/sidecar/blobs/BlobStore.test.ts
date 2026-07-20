import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { BlobCapacityExceededError,BlobPayloadTooLargeError,BlobStore } from '@/sidecar/services/blobs/BlobStore';

describe('BlobStore', () => {
  let directory: string;

  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-blobs-')); });
  afterEach(async () => { await rm(directory, { force: true, recursive: true }); });

  it('commits a bounded browser upload to a Sidecar-owned temporary file', async () => {
    const store = new BlobStore(directory, 16, 8);
    const { blobId, maxChunkBytes } = store.begin(5, 'text/plain');
    expect(maxChunkBytes).toBe(8);
    store.chunk(blobId, Buffer.from('hello').toString('base64'));
    const committed = await store.commit(blobId);
    expect(committed).toMatchObject({ mimeType: 'text/plain', size: 5 });
    await expect(readFile(committed.path, 'utf8')).resolves.toBe('hello');
  });

  it('rejects chunks that exceed their declared upload capacity', () => {
    const store = new BlobStore(directory, 4, 4);
    const { blobId } = store.begin(4, 'text/plain');
    expect(() => store.chunk(blobId, Buffer.from('hello').toString('base64'))).toThrow(BlobPayloadTooLargeError);
  });

  it('cleans committed artifacts when an owning turn completes', async () => {
    const store = new BlobStore(directory);
    const { blobId } = store.begin(1, 'text/plain');
    store.chunk(blobId, Buffer.from('x').toString('base64'));
    const committed = await store.commit(blobId);
    await store.abort(blobId);
    await expect(readFile(committed.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('bounds both blob count and total declared storage', () => {
    const store = new BlobStore(directory, 8, 8, 1, 8);
    store.begin(8, 'text/plain');
    expect(() => store.begin(1, 'text/plain')).toThrow(BlobCapacityExceededError);
  });
});
