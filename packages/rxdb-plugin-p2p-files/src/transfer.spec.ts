import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest, type P2PFileManifest } from './chunking';
import { transferP2PFile, type P2PChunkSource } from './transfer';

const makeFixture = async (): Promise<{
  manifest: P2PFileManifest;
  chunks: readonly Uint8Array[];
}> => {
  const chunks = [new Uint8Array(1024).fill(1), new Uint8Array(1024).fill(2)];
  const source = new Uint8Array(chunks[0].byteLength + chunks[1].byteLength);
  source.set(chunks[0]);
  source.set(chunks[1], chunks[0].byteLength);
  const manifest = await createP2PFileManifest({
    fileName: 'fixture.bin',
    size: source.byteLength,
    chunkSize: 1024,
    readChunk: async (offset, size) => source.slice(offset, offset + size)
  });
  return { manifest, chunks };
};

describe('P2P 传输选路与取消', () => {
  it('可以从多个 peer 按块取数', async () => {
    const { manifest, chunks } = await makeFixture();
    const requests: string[] = [];
    const first: P2PChunkSource = {
      id: 'peer-a',
      requestChunk: async (_hash, index) => {
        requests.push(`a:${index}`);
        if (index !== 0) throw new Error('peer-a does not have this chunk');
        return chunks[index];
      }
    };
    const second: P2PChunkSource = {
      id: 'peer-b',
      requestChunk: async (_hash, index) => {
        requests.push(`b:${index}`);
        if (index !== 1) throw new Error('peer-b does not have this chunk');
        return chunks[index];
      }
    };
    const result = await transferP2PFile({
      manifest,
      sources: [first, second],
      concurrency: 1,
      maxAttemptsPerChunk: 3,
      writeChunk: async () => undefined
    });

    expect(result.completedChunks).toBe(2);
    expect(result.sourcesUsed).toEqual(expect.arrayContaining(['peer-a', 'peer-b']));
    expect(requests).toEqual(['a:0', 'a:1', 'b:1']);
  });

  it('坏 peer 达到阈值后会退避，不再污染后续块', async () => {
    const { manifest, chunks } = await makeFixture();
    let badCalls = 0;
    const bad: P2PChunkSource = {
      id: 'bad',
      requestChunk: async () => {
        badCalls += 1;
        return new Uint8Array(1024);
      }
    };
    const good: P2PChunkSource = {
      id: 'good',
      requestChunk: async (_hash, index) => chunks[index]
    };
    await transferP2PFile({
      manifest,
      sources: [bad, good],
      concurrency: 1,
      maxAttemptsPerChunk: 4,
      maxPeerFailures: 1,
      writeChunk: async () => undefined
    });

    expect(badCalls).toBe(1);
  });

  it('在开始传输前尊重已取消的信号', async () => {
    const { manifest } = await makeFixture();
    const controller = new AbortController();
    controller.abort(new Error('cancelled by caller'));
    const requestChunk = vi.fn();

    await expect(
      transferP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk }],
        signal: controller.signal,
        writeChunk: async () => undefined
      })
    ).rejects.toThrow('cancelled by caller');
    expect(requestChunk).not.toHaveBeenCalled();
  });

  it('传输中的取消会原样透传调用方原因', async () => {
    const { manifest } = await makeFixture();
    const controller = new AbortController();
    const requestChunk = async (_hash: string, _index: number, signal: AbortSignal): Promise<Uint8Array> =>
      new Promise<Uint8Array>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const task = transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk }],
      signal: controller.signal,
      writeChunk: async () => undefined
    });
    controller.abort(new Error('cancelled during transfer'));
    await expect(task).rejects.toThrow('cancelled during transfer');
  });
});
