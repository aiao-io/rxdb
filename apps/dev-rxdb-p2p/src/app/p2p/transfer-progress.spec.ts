// @vitest-environment node
import { createP2PFileManifest, type P2PChunkSource, type P2PFileManifest } from '@aiao/rxdb-plugin-p2p';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SERVER_SOURCE, TransferProgress } from './transfer-progress';

const BYTES = Uint8Array.from({ length: 10 }, (_, index) => index);
let manifest: P2PFileManifest;

const sourceOf = (id: string, corrupt = false): P2PChunkSource => ({
  id,
  requestChunk: async request => {
    const bytes = BYTES.slice(request.offset, request.offset + request.size);
    if (corrupt) bytes[0] = 255;
    return bytes;
  }
});

const request = (index: number) => ({
  contentHash: manifest.contentHash,
  offset: index * manifest.chunkSize,
  size: Math.min(manifest.chunkSize, manifest.size - index * manifest.chunkSize)
});

beforeAll(async () => {
  manifest = await createP2PFileManifest({
    fileName: 'ten.bin',
    size: BYTES.byteLength,
    chunkSize: 4,
    readChunk: async (offset, size) => BYTES.slice(offset, offset + size)
  });
});

describe('TransferProgress', () => {
  it('starts with every chunk pending', () => {
    const progress = new TransferProgress('t-1', manifest, ['alice'], () => 100, vi.fn());

    expect(progress.view()).toMatchObject({
      id: 't-1',
      fileName: 'ten.bin',
      state: 'running',
      route: 'p2p',
      bytes: 0,
      chunks: [null, null, null],
      rejected: 0,
      sources: ['alice'],
      startedAt: 100,
      finishedAt: null
    });
  });

  it('colours each written chunk by the source that delivered it', async () => {
    const changed = vi.fn();
    const progress = new TransferProgress('t-1', manifest, ['alice', 'bob'], () => 100, changed);
    const alice = progress.attribute(sourceOf('alice'));
    const bob = progress.attribute(sourceOf('bob'));
    const signal = new AbortController().signal;

    await alice.requestChunk(request(0), signal);
    await bob.requestChunk(request(1), signal);
    progress.written(0, 4);
    progress.written(1, 4);

    expect(progress.view()).toMatchObject({ chunks: ['alice', 'bob', null], bytes: 8 });
    expect(changed).toHaveBeenCalled();
  });

  it('counts a delivery that fails verification and keeps the chunk pending', async () => {
    const progress = new TransferProgress('t-1', manifest, ['mallory'], () => 100, vi.fn());

    await progress.attribute(sourceOf('mallory', true)).requestChunk(request(2), new AbortController().signal);

    expect(progress.view()).toMatchObject({ chunks: [null, null, null], rejected: 1 });
  });

  it('marks chunks streamed from the server fallback', () => {
    const progress = new TransferProgress('t-1', manifest, [], () => 100, vi.fn());

    progress.switchRoute('server');
    progress.written(2, 2);

    expect(progress.view()).toMatchObject({ route: 'server', chunks: [null, null, SERVER_SOURCE], bytes: 2 });
  });

  it('records how the transfer ended', () => {
    let now = 100;
    const progress = new TransferProgress('t-1', manifest, [], () => now, vi.fn());

    now = 250;
    progress.finish('failed', 'peer peer-1 request timed out');

    expect(progress.view()).toMatchObject({ state: 'failed', error: 'peer peer-1 request timed out', finishedAt: 250 });
  });
});
