/**
 * @fileoverview 单批写入基准（SC-007：中位数 < 100 ms；research D12）。
 *
 * @remarks
 * 只在 `REPLAY_BENCH=1` 时跑：机器抖动会让耗时门禁变随机，默认 CI 不跑。
 * 200 条 ~200 B 事件一批，预热 3 批后连写 30 批，取中位数；实测数记进 tasks.md T038。
 */

import type { eventWithTime } from '@rrweb/types';
import { afterEach, describe, expect, it } from 'vitest';
import { eventBytes } from '../markers.js';
import { ReplayStore } from '../store.js';
import { createRecordingDbFactory } from './fixtures/dbs.js';

const BATCH_SIZE = 200;
const WARMUP_BATCHES = 3;
const MEASURED_BATCHES = 30;
const MIB = 1024 * 1024;

// IncrementalSnapshot（3）/ Mutation（0）：一次属性变更，靠属性值把体积撑到 ~200 B
const event = (seq: number): eventWithTime => ({
  type: 3,
  data: {
    source: 0,
    texts: [],
    attributes: [{ id: 1, attributes: { 'data-pad': 'x'.repeat(120) } }],
    removes: [],
    adds: []
  },
  timestamp: 1000 + seq
});

const batch = (from: number) =>
  Array.from({ length: BATCH_SIZE }, (_, i) => ({ seq: from + i, event: event(from + i) }));

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

let store: ReplayStore | undefined;

afterEach(async () => {
  await store?.destroy();
  store = undefined;
});

describe('ReplayStore 写入基准', () => {
  it.runIf(process.env['REPLAY_BENCH'] === '1')('单批 200 条 ~200 B 事件，中位数 < 100 ms', async () => {
    store = new ReplayStore({
      createRecordingDb: createRecordingDbFactory().factory,
      limits: { sessionBytes: 16 * MIB, storeBytes: 128 * MIB }
    });
    const id = await store.createSession(new Date());
    let seq = 0;
    for (let i = 0; i < WARMUP_BATCHES; i++, seq += BATCH_SIZE) await store.appendBatch(id, batch(seq));

    const durations: number[] = [];
    for (let i = 0; i < MEASURED_BATCHES; i++, seq += BATCH_SIZE) {
      const started = performance.now();
      await store.appendBatch(id, batch(seq));
      durations.push(performance.now() - started);
    }

    const result = median(durations);
    console.info(
      `[replay bench] event ${eventBytes(event(0))} B × ${BATCH_SIZE}，${MEASURED_BATCHES} 批中位数 ${result.toFixed(1)} ms` +
        `（min ${Math.min(...durations).toFixed(1)} / max ${Math.max(...durations).toFixed(1)}）`
    );
    expect(result).toBeLessThan(100);
  });
});
