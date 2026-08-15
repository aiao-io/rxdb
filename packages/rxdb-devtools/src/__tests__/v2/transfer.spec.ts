import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../../testing/fake-clock.js';
import { encodeCanonicalBase64 } from '../../v2/base64.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from '../../v2/constants.js';
import { createDevToolsTransferTable } from '../../v2/transfer.js';
import type { DevToolsTransferOutcome, DevToolsTransferTable } from '../../v2/transfer.js';

const TRANSFER_ID = 'tx-1';
const REQUEST_ID = 'req-1';

interface Settlement {
  readonly transferId: string;
  readonly outcome: DevToolsTransferOutcome;
}

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index + seed) % 256);
}

function setup(negotiatedLimit = 1_024): {
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
    onChunk: (_transferId, data) => chunks.push(data),
    onSettled: (transferId, outcome) => settled.push({ transferId, outcome })
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
  it('MUST run a well-formed transfer from START to COMPLETE', () => {
    const { chunks, settled, table } = setup();
    const first = bytes(8);
    const second = bytes(4, 100);

    expect(start(table, 12)).toEqual({ outcome: 'accepted' });
    expect(chunk(table, 0, 0, encodeCanonicalBase64(first))).toEqual({ outcome: 'accepted' });
    expect(chunk(table, 1, 8, encodeCanonicalBase64(second))).toEqual({ outcome: 'accepted' });
    expect(table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });

    expect(chunks).toEqual([first, second]);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'completed' }]);
    // 终态后不得留下孤儿 metadata。
    expect(table.size).toBe(0);
  });

  it('MUST hand every chunk to the sink as it arrives, never at COMPLETE', () => {
    // 「不得整文件驻留内存」在本包结构上唯一可断言的形态：每块在**它自己那一帧内**就已下沉，
    // 而 COMPLETE 不携带任何字节——状态机因此没有可拼接的东西。
    const { chunks, table } = setup(3 * DEVTOOLS_MAX_CHUNK_BYTES);
    start(table, 3 * DEVTOOLS_MAX_CHUNK_BYTES);

    for (let index = 0; index < 3; index++) {
      const data = bytes(DEVTOOLS_MAX_CHUNK_BYTES, index);
      expect(chunk(table, index, index * DEVTOOLS_MAX_CHUNK_BYTES, encodeCanonicalBase64(data))).toEqual({
        outcome: 'accepted'
      });
      expect(chunks).toHaveLength(index + 1);
    }

    const beforeComplete = chunks.length;
    expect(table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
    expect(chunks).toHaveLength(beforeComplete);
  });

  it('MUST answer transfer_closed for an unknown or already terminal transfer', () => {
    const { table } = setup();
    const closed = { outcome: 'rejected', error: { code: 'transfer_closed', retryable: false } };

    expect(chunk(table, 0, 0, encodeCanonicalBase64(bytes(1)))).toEqual(closed);
    expect(table.complete({ transferId: TRANSFER_ID })).toEqual(closed);
    expect(table.cancel({ transferId: TRANSFER_ID })).toEqual(closed);

    start(table, 0);
    table.complete({ transferId: TRANSFER_ID });
    // 已终结的 transfer 与从未存在的 transfer 得到同一个答案。
    expect(table.cancel({ transferId: TRANSFER_ID })).toEqual(closed);
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

  it('MUST require strictly sequential chunkIndex and matching offset', () => {
    const { table } = setup();
    const data = encodeCanonicalBase64(bytes(4));
    const sequenceInvalid = { outcome: 'rejected', error: { code: 'transfer_sequence_invalid', retryable: false } };
    start(table, 8);

    expect(chunk(table, 1, 0, data)).toEqual(sequenceInvalid); // 跳号
    expect(chunk(table, 0, 4, data)).toEqual(sequenceInvalid); // offset 与已收字节不符
    expect(chunk(table, 0, 0, data)).toEqual({ outcome: 'accepted' });
    expect(chunk(table, 0, 4, data)).toEqual(sequenceInvalid); // 重放已用过的下标
    expect(chunk(table, 1, 4, data)).toEqual({ outcome: 'accepted' });
  });

  it('MUST reject an empty chunk as a sequence violation', () => {
    // 空 chunk 消耗一个 chunkIndex 却不推进 offset，直接破坏 index↔offset 的一一对应。
    const { table } = setup();
    start(table, 4);

    expect(chunk(table, 0, 0, '')).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_sequence_invalid', retryable: false }
    });
  });

  it('MUST reject non-canonical base64 as an encoding error', () => {
    const { table } = setup();
    start(table, 8);
    const encodingInvalid = { outcome: 'rejected', error: { code: 'payload_encoding_invalid', retryable: false } };

    for (const data of ['SGk', 'SG k=', 'SGl=', 'SGk==', '-_8=', 'SGk!']) {
      expect(chunk(table, 0, 0, data), data).toEqual(encodingInvalid);
    }
    // 一次都没被接受：计数器仍在原点。
    expect(chunk(table, 0, 0, 'SGk=')).toEqual({ outcome: 'accepted' });
  });

  it('MUST reject an oversized chunk without decoding it first', () => {
    const { table } = setup(DEVTOOLS_MAX_CHUNK_BYTES * 4);
    start(table, DEVTOOLS_MAX_CHUNK_BYTES * 4);
    const tooLarge = { outcome: 'rejected', error: { code: 'payload_too_large', retryable: false } };

    // 恰好超出 256 KiB 一个字节。
    expect(chunk(table, 0, 0, encodeCanonicalBase64(bytes(DEVTOOLS_MAX_CHUNK_BYTES + 1)))).toEqual(tooLarge);
    // 长到「不可能解码后仍在限内」的串必须在分配任何缓冲之前就被挡掉。
    expect(chunk(table, 0, 0, 'A'.repeat(4_000_000))).toEqual(tooLarge);
    // 恰好 256 KiB 仍然合法。
    expect(chunk(table, 0, 0, encodeCanonicalBase64(bytes(DEVTOOLS_MAX_CHUNK_BYTES)))).toEqual({ outcome: 'accepted' });
  });

  it('MUST reject cumulative bytes beyond the declared total', () => {
    const { table } = setup();
    start(table, 6);
    chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)));

    expect(chunk(table, 1, 4, encodeCanonicalBase64(bytes(3)))).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_size_exceeded', retryable: false }
    });
    expect(chunk(table, 1, 4, encodeCanonicalBase64(bytes(2)))).toEqual({ outcome: 'accepted' });
  });

  it('MUST answer transfer_incomplete when COMPLETE arrives short of the declared total', () => {
    const { settled, table } = setup();
    start(table, 8);
    chunk(table, 0, 0, encodeCanonicalBase64(bytes(4)));

    expect(table.complete({ transferId: TRANSFER_ID })).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_incomplete', retryable: false }
    });
    // 被拒的 COMPLETE 不是终态：发送方仍可补齐剩余字节。
    expect(settled).toEqual([]);
    expect(chunk(table, 1, 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
    expect(table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
  });

  it('MUST settle a cancelled transfer and release its resources', () => {
    const { clock, settled, table } = setup();
    start(table, 8);

    expect(table.cancel({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'cancelled' });
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'cancelled' }]);
    expect(table.size).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST refresh the idle deadline only on frames that pass every guard', () => {
    // 被拒帧刷新计时器，等于让攻击者用非法帧无限续命。
    const { clock, settled, table } = setup();
    start(table, 8);

    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
    chunk(table, 5, 0, encodeCanonicalBase64(bytes(1))); // transfer_sequence_invalid
    chunk(table, 0, 0, 'SGk'); // payload_encoding_invalid
    chunk(table, 0, 0, encodeCanonicalBase64(bytes(9))); // transfer_size_exceeded

    clock.advance(1);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'idle-timeout' }]);
    expect(table.size).toBe(0);
  });

  it('MUST extend the idle deadline on every accepted chunk', () => {
    const { clock, settled, table } = setup();
    start(table, 12);

    for (let index = 0; index < 3; index++) {
      clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
      expect(chunk(table, index, index * 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
    }
    expect(settled).toEqual([]);

    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'idle-timeout' }]);
  });

  it('MUST cap the total duration no matter how often the idle timer is refreshed', () => {
    const { clock, settled, table } = setup(DEVTOOLS_MAX_CHUNK_BYTES * 64);
    start(table, DEVTOOLS_MAX_CHUNK_BYTES * 64);

    let index = 0;
    let offset = 0;
    while (clock.now() < DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS && settled.length === 0) {
      clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);
      chunk(table, index, offset, encodeCanonicalBase64(bytes(64, index)));
      index += 1;
      offset += 64;
    }

    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'total-timeout' }]);
    expect(table.size).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST measure the total deadline from START, not from the first chunk', () => {
    const { clock, settled, table } = setup();
    start(table, 256);

    // 先空转到 idle 边界再开始喂数据：若总时限以首块为锚，它会晚 14,999 ms 才到期，
    // 于是下面那一毫秒推不出终态。（空转到底不行——idle 闸会在第 15 秒先把它收走。）
    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1);

    let index = 0;
    while (clock.now() < DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1) {
      expect(chunk(table, index, index * 4, encodeCanonicalBase64(bytes(4)))).toEqual({ outcome: 'accepted' });
      index += 1;
      clock.advance(Math.min(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 1, DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1 - clock.now()));
    }

    expect(clock.now()).toBe(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS - 1);
    expect(settled).toEqual([]);

    clock.advance(1);
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'total-timeout' }]);
  });

  it('MUST keep concurrent transfers independent', () => {
    const { clock, settled, table } = setup();
    table.start({ transferId: 'tx-a', requestId: REQUEST_ID, totalBytes: 4 });
    clock.advance(10_000);
    table.start({ transferId: 'tx-b', requestId: 'req-2', totalBytes: 4 });

    expect(table.size).toBe(2);
    clock.advance(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS - 10_000);
    expect(settled).toEqual([{ transferId: 'tx-a', outcome: 'idle-timeout' }]);

    expect(table.chunk({ transferId: 'tx-b', chunkIndex: 0, offset: 0, dataBase64: encodeCanonicalBase64(bytes(4)) })).toEqual({
      outcome: 'accepted'
    });
    expect(table.size).toBe(1);
  });

  it('MUST allow a zero-byte transfer to complete immediately', () => {
    const { settled, table } = setup();
    expect(start(table, 0)).toEqual({ outcome: 'accepted' });
    expect(table.complete({ transferId: TRANSFER_ID })).toEqual({ outcome: 'settled', reason: 'completed' });
    expect(settled).toEqual([{ transferId: TRANSFER_ID, outcome: 'completed' }]);
  });

  it('MUST release every transfer on dispose without reporting settlements', () => {
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
