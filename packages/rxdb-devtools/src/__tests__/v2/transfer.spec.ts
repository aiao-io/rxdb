import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../../testing/fake-clock.js';
import { encodeCanonicalBase64 } from '../../v2/base64.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from '../../v2/constants.js';
import type { DevToolsTransferOutcome, DevToolsTransferTable } from '../../v2/transfer.js';
import { createDevToolsTransferTable } from '../../v2/transfer.js';

const TRANSFER_ID = 'tx-1';
const REQUEST_ID = 'req-1';

interface Settlement {
  readonly transferId: string;
  readonly outcome: DevToolsTransferOutcome;
}

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index + seed) % 256);
}

/** 跳过一整轮宏任务，让所有已排上的落盘续体跑完。 */
function macrotask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

/** 一道能被测试按住的闸；用来把一次「写入」停在半空。 */
function gate(): Gate {
  let open = (): void => undefined;
  const promise = new Promise<void>(resolve => {
    open = (): void => resolve();
  });
  return { promise, open };
}

function setup(
  negotiatedLimit = 1_024,
  /** 落盘的替身；resolve 前这一块不算落地，throw 即写失败。 */
  onWrite?: (data: Uint8Array) => Promise<void>
): {
  clock: ReturnType<typeof createFakeClock>;
  chunks: Uint8Array[];
  settled: Settlement[];
  table: DevToolsTransferTable;
} {
  const clock = createFakeClock();
  const chunks: Uint8Array[] = [];
  const settled: Settlement[] = [];
  const table = createDevToolsTransferTable({
    clock,
    negotiatedLimit,
    onChunk: async (_transferId, data) => {
      await onWrite?.(data);
      chunks.push(data);
    },
    onSettled: async (transferId, outcome) => {
      settled.push({ transferId, outcome });
    }
  });
  return { clock, chunks, settled, table };
}

function start(table: DevToolsTransferTable, totalBytes: number): ReturnType<DevToolsTransferTable['start']> {
  return table.start({ transferId: TRANSFER_ID, requestId: REQUEST_ID, totalBytes });
}

function chunk(
  table: DevToolsTransferTable,
  chunkIndex: number,
  offset: number,
  dataBase64: string
): ReturnType<DevToolsTransferTable['chunk']> {
  return table.chunk({ transferId: TRANSFER_ID, chunkIndex, offset, dataBase64 });
}

describe('transfer state machine', () => {
  it('MUST run a well-formed transfer from START to COMPLETE', async () => {
    const { chunks, settled, table } = setup();
    const first = bytes(8);
    const second = bytes(4, 100);

    expect(start(table, 12)).toEqual({ outcome: 'accepted' });
    expect(await chunk(table, 0, 0, encodeCanonicalBase64(first))).toEqual({ outcome: 'accepted' });
    expect(await chunk(table, 1, 8, encodeCanonicalBase64(second))).toEqual({ outcome: 'accepted' });
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });

    expect(chunks).toEqual([first, second]);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'completed' }]);
    // 终态后不得留下孤儿 metadata。
    expect(table.size).toBe(0);
  });

  it('MUST hand every chunk to the sink as it arrives, never at COMPLETE', async () => {
    // 「不得整文件驻留内存」在本包结构上唯一可断言的形态：每块在**它自己那一帧内**就已下沉，
    // 而 COMPLETE 不携带任何字节——状态机因此没有可拼接的东西。
    const { chunks, table } = setup(3 * DEVTOOLS_MAX_CHUNK_BYTES);
    start(table, 3 * DEVTOOLS_MAX_CHUNK_BYTES);

    for (let index = 0; index < 3; index++) {
      const data = bytes(DEVTOOLS_MAX_CHUNK_BYTES, index);
      expect(await chunk(table, index, index * DEVTOOLS_MAX_CHUNK_BYTES, encodeCanonicalBase64(data))).toEqual({
        outcome: 'accepted'
      });
      expect(chunks).toHaveLength(index + 1);
    }

    const beforeComplete = chunks.length;
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
    expect(chunks).toHaveLength(beforeComplete);
  });

  it('MUST answer transfer_closed for an unknown or already terminal transfer', async () => {
    const { table } = setup();
    const closed = { outcome: 'rejected', error: { code: 'transfer_closed', retryable: false } };

    expect(await chunk(table, 0, 0, encodeCanonicalBase64(bytes(1)))).toEqual(closed);
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual(closed);
    expect(await table.cancel({ transferId: TRANSFER_ID })).toEqual(closed);

    start(table, 0);
    await table.complete({ transferId: TRANSFER_ID });
    // 已终结的 transfer 与从未存在的 transfer 得到同一个答案。
    expect(await table.cancel({ transferId: TRANSFER_ID })).toEqual(closed);
  });

  it('MUST reject a declared size above the negotiated limit', () => {
    const { settled, table } = setup(64);

    expect(start(table, 65)).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_size_exceeded', retryable: false }
    });
    expect(table.size).toBe(0);
    expect(settled).toEqual([]);
  });

  it('MUST reject a second START on an id it is already tracking', () => {
    const { table } = setup();
    start(table, 8);

    expect(start(table, 8)).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_sequence_invalid', retryable: false }
    });
    expect(table.size).toBe(1);
  });

  it('MUST require strictly sequential chunkIndex and matching offset', async () => {
    const { table } = setup();
    const data = encodeCanonicalBase64(bytes(4));
    const sequenceInvalid = { outcome: 'rejected', error: { code: 'transfer_sequence_invalid', retryable: false } };
    start(table, 8);

    expect(await chunk(table, 1, 0, data)).toEqual(sequenceInvalid); // 跳号
    expect(await chunk(table, 0, 4, data)).toEqual(sequenceInvalid); // offset 与已收字节不符
    expect(await chunk(table, 0, 0, data)).toEqual({ outcome: 'accepted' });
    expect(await chunk(table, 0, 4, data)).toEqual(sequenceInvalid); // 重放已用过的下标
    expect(await chunk(table, 1, 4, data)).toEqual({ outcome: 'accepted' });
  });

  it('MUST reject an empty chunk as a sequence violation', async () => {
    // 空 chunk 消耗一个 chunkIndex 却不推进 offset，直接破坏 index↔offset 的一一对应。
    const { table } = setup();
    start(table, 4);

    expect(await chunk(table, 0, 0, '')).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_sequence_invalid', retryable: false }
    });
  });

  it('MUST reject non-canonical base64 as an encoding error', async () => {
    const { table } = setup();
    start(table, 8);
    const encodingInvalid = { outcome: 'rejected', error: { code: 'payload_encoding_invalid', retryable: false } };

    for (const data of ['SGk', 'SG k=', 'SGl=', 'SGk==', '-_8=', 'SGk!']) {
      expect(await chunk(table, 0, 0, data), data).toEqual(encodingInvalid);
    }
    // 一次都没被接受：计数器仍在原点。
    expect(await chunk(table, 0, 0, 'SGk=')).toEqual({ outcome: 'accepted' });
  });

  it('MUST reject an oversized chunk without decoding it first', async () => {
    const { table } = setup(DEVTOOLS_MAX_CHUNK_BYTES * 4);
    start(table, DEVTOOLS_MAX_CHUNK_BYTES * 4);
    const tooLarge = { outcome: 'rejected', error: { code: 'payload_too_large', retryable: false } };

    // 恰好超出 256 KiB 一个字节。
    expect(await chunk(table, 0, 0, encodeCanonicalBase64(bytes(DEVTOOLS_MAX_CHUNK_BYTES + 1)))).toEqual(tooLarge);
    // 长到「不可能解码后仍在限内」的串必须在分配任何缓冲之前就被挡掉。
    expect(await chunk(table, 0, 0, 'A'.repeat(4_000_000))).toEqual(tooLarge);
    // 恰好 256 KiB 仍然合法。
    expect(await chunk(table, 0, 0, encodeCanonicalBase64(bytes(DEVTOOLS_MAX_CHUNK_BYTES)))).toEqual({
      outcome: 'accepted'
    });
  });

  it('MUST reject cumulative bytes beyond the declared total', async () => {
    const { table } = setup();
    start(table, 6);
    await chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)));

    expect(await chunk(table, 1, 4, encodeCanonicalBase64(bytes(3)))).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_size_exceeded', retryable: false }
    });
    expect(await chunk(table, 1, 4, encodeCanonicalBase64(bytes(2)))).toEqual({ outcome: 'accepted' });
  });

  it('MUST answer transfer_incomplete when COMPLETE arrives short of the declared total', async () => {
    const { settled, table } = setup();
    start(table, 8);
    await chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)));

    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_incomplete', retryable: false }
    });
    // 被拒的 COMPLETE 不是终态：发送方仍可补齐剩余字节。
    expect(settled).toEqual([]);
    expect(await chunk(table, 1, 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
  });

  it('MUST settle a cancelled transfer and release its resources', async () => {
    const { clock, settled, table } = setup();
    start(table, 8);

    expect(await table.cancel({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'cancelled' });
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'cancelled' }]);
    expect(table.size).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST settle a transfer as failed when a chunk never lands', async () => {
    // 同步 sink 时代这条根本无从表达：write 返回 void，写失败在协议上完全不可见，
    // 状态机照常推进 offset，最后 commit 出一个缺块的文件。
    const { chunks, settled, table } = setup(1_024, () => Promise.reject(new Error('disk full')));
    start(table, 8);

    expect(await chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)))).toEqual({
      outcome: 'rejected',
      error: { code: 'operation_failed', retryable: false }
    });
    expect(chunks).toEqual([]);
    // 归因是 failed 而不是 cancelled：对端没取消，是本端写不下去。
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'failed' }]);
    expect(table.size).toBe(0);

    // 写崩之后既不能再收字节，也不能收尾——留在表里等 COMPLETE 就是拿短文件去 commit。
    const closed = { outcome: 'rejected', error: { code: 'transfer_closed', retryable: false } };
    expect(await chunk(table, 1, 4, encodeCanonicalBase64(bytes(4)))).toEqual(closed);
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual(closed);
  });

  it('MUST queue a chunk behind an unfinished write instead of failing its sequence check', async () => {
    // 背压：磁盘慢的时候后续帧排队等，而不是拿尚未推进的 nextChunkIndex 去撞 transfer_sequence_invalid。
    const slow = gate();
    let writes = 0;
    const { chunks, table } = setup(1_024, async () => {
      writes += 1;
      if (writes === 1) await slow.promise;
    });
    const first = bytes(4);
    const second = bytes(4, 9);
    start(table, 8);

    const firstFrame = chunk(table, 0, 0, encodeCanonicalBase64(first));
    const secondFrame = chunk(table, 1, 4, encodeCanonicalBase64(second));
    await macrotask();
    expect(chunks).toEqual([]);

    slow.open();
    expect(await firstFrame).toEqual({ outcome: 'accepted' });
    expect(await secondFrame).toEqual({ outcome: 'accepted' });
    // 排队还必须保序：sink 拿到的顺序就是帧到达的顺序。
    expect(chunks).toEqual([first, second]);
  });

  it('MUST NOT settle COMPLETE while a chunk write is still in flight', async () => {
    const slow = gate();
    const { settled, table } = setup(1_024, () => slow.promise);
    start(table, 4);

    const pending = chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)));
    const completion = table.complete({ transferId: TRANSFER_ID });
    await macrotask();
    // 还有块在飞就 commit，提交的是个短文件。
    expect(settled).toEqual([]);

    slow.open();
    expect(await pending).toEqual({ outcome: 'accepted' });
    expect(await completion).toEqual({ outcome: 'settled', reason: 'completed' });
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'completed' }]);
  });

  it('MUST refresh the idle deadline only on frames that pass every guard', async () => {
    // 被拒帧刷新计时器，等于让攻击者用非法帧无限续命。
    const { clock, settled, table } = setup();
    start(table, 8);

    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
    await chunk(table, 5, 0, encodeCanonicalBase64(bytes(1))); // transfer_sequence_invalid
    await chunk(table, 0, 0, 'SGk'); // payload_encoding_invalid
    await chunk(table, 0, 0, encodeCanonicalBase64(bytes(9))); // transfer_size_exceeded

    clock.advance(1);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'idle-timeout' }]);
    expect(table.size).toBe(0);
  });

  it('MUST extend the idle deadline on every accepted chunk', async () => {
    const { clock, settled, table } = setup();
    start(table, 12);

    for (let index = 0; index < 3; index++) {
      clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
      expect(await chunk(table, index, index * 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
    }
    expect(settled).toEqual([]);

    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'idle-timeout' }]);
  });

  it('MUST cap the total duration no matter how often the idle timer is refreshed', async () => {
    const { clock, settled, table } = setup(DEVTOOLS_MAX_CHUNK_BYTES * 64);
    start(table, DEVTOOLS_MAX_CHUNK_BYTES * 64);

    let index = 0;
    let offset = 0;
    while (clock.now() < DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS && settled.length === 0) {
      clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
      await chunk(table, index, offset, encodeCanonicalBase64(bytes(64, index)));
      index += 1;
      offset += 64;
    }

    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'total-timeout' }]);
    expect(table.size).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST measure the total deadline from START, not from the first chunk', async () => {
    const { clock, settled, table } = setup();
    start(table, 256);

    // 先空转到 idle 边界再开始喂数据：若总时限以首块为锚，它会晚 14,999 ms 才到期，
    // 于是下面那一毫秒推不出终态。（空转到底不行——idle 闸会在第 15 秒先把它收走。）
    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);

    let index = 0;
    while (clock.now() < DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1) {
      expect(await chunk(table, index, index * 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
      index += 1;
      clock.advance(
        Math.min(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1, DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1 - clock.now())
      );
    }

    expect(clock.now()).toBe(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1);
    expect(settled).toEqual([]);

    clock.advance(1);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'total-timeout' }]);
  });

  it('MUST keep concurrent transfers independent', async () => {
    const { clock, settled, table } = setup();
    table.start({ transferId: 'tx-a', requestId: REQUEST_ID, totalBytes: 4 });
    clock.advance(10_000);
    table.start({ transferId: 'tx-b', requestId: 'req-2', totalBytes: 4 });

    expect(table.size).toBe(2);
    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 10_000);
    expect(settled).toEqual([{ transferId: 'tx-a', outcome: 'idle-timeout' }]);

    expect(
      await table.chunk({ transferId: 'tx-b', chunkIndex: 0, offset: 0, dataBase64: encodeCanonicalBase64(bytes(4)) })
    ).toEqual({ outcome: 'accepted' });
    expect(table.size).toBe(1);
  });

  it('MUST allow a zero-byte transfer to complete immediately', async () => {
    const { settled, table } = setup();
    expect(start(table, 0)).toEqual({ outcome: 'accepted' });
    expect(await table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'completed' }]);
  });

  it('MUST release every transfer on dispose without reporting settlements', async () => {
    const { clock, settled, table } = setup();
    start(table, 8);
    table.start({ transferId: 'tx-b', requestId: 'req-2', totalBytes: 8 });

    table.dispose();

    expect(table.size).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
    // dispose 是本端主动拆链路，对端不需要一条迟到的终态通知。
    expect(settled).toEqual([]);

    clock.advance(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS * 2);
    expect(settled).toEqual([]);
    expect(start(table, 8)).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_closed', retryable: false }
    });
  });
});
