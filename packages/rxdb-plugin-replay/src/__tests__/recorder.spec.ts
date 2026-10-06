/**
 * @fileoverview 录制器的缓冲与冲刷（`git show 2e820521:specs/005-us-909-session-replay/research.md` D5）。
 *
 * @remarks
 * 用假 `record` 驱动 `emit`、假落库端控制每笔冲刷何时结算，假时钟推 `intervalMs`。
 * 真 rrweb 与真录制库分别在浏览器用例与 `store.spec.ts` 里覆盖，这里只看节奏与状态。
 */

import type { eventWithTime } from '@rrweb/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_MARKER_TAGS } from '../markers.js';
import { ReplayRecorder, type ReplayRecordFn, type ReplayRecorderEnd, type ReplayRecorderSink } from '../recorder.js';
import type { ReplayAppendResult, ReplayEventEntry } from '../store.js';

const FLUSH = { intervalMs: 1000, maxEvents: 3 };

const event = (i: number): eventWithTime =>
  ({
    type: 3,
    data: { source: 0, texts: [], attributes: [], removes: [], adds: [], i },
    timestamp: 1000 + i
  }) as unknown as eventWithTime;

interface PendingWrite {
  readonly sessionId: string;
  readonly entries: readonly ReplayEventEntry[];
  resolve(result: ReplayAppendResult): void;
  reject(error: unknown): void;
}

/** 落库端：每笔 `appendBatch` 挂起，由用例决定何时、以何结果结算。 */
const createSink = () => {
  const writes: PendingWrite[] = [];
  const markStopped = vi.fn<(sessionId: string) => Promise<void>>(async () => undefined);
  const sink: ReplayRecorderSink = {
    appendBatch: (sessionId, entries) =>
      new Promise<ReplayAppendResult>((resolve, reject) => writes.push({ sessionId, entries, resolve, reject })),
    markStopped
  };
  const written = (index: number) => writes[index]?.entries.map(entry => entry.seq);
  return { sink, writes, written, markStopped };
};

/** 假 rrweb `record`：记下选项，把 `emit` 交给用例。 */
const createRecord = () => {
  const stopRecording = vi.fn();
  let emit: ((event: eventWithTime) => void) | undefined;
  const record = Object.assign(
    vi.fn((options: Parameters<ReplayRecordFn>[0]): ReturnType<ReplayRecordFn> => {
      emit = options.emit;
      return stopRecording;
    }),
    { addCustomEvent: vi.fn() }
  ) as unknown as ReplayRecordFn & { addCustomEvent: ReturnType<typeof vi.fn> };
  const emitEvents = (from: number, count: number) => {
    for (let i = from; i < from + count; i++) emit?.(event(i));
  };
  return { record, stopRecording, emitEvents };
};

const setup = (nextSeq = 0) => {
  const sink = createSink();
  const rrweb = createRecord();
  const ends: ReplayRecorderEnd[] = [];
  const recorder = new ReplayRecorder({
    sink: sink.sink,
    record: rrweb.record,
    sessionId: 's1',
    nextSeq,
    flush: FLUSH,
    recordOptions: { maskAllInputs: true, blockSelector: '[data-rxdb-replay-block]' },
    onEnd: end => ends.push(end)
  });
  recorder.start();
  return { ...sink, ...rrweb, recorder, ends };
};

/** 让挂起的 promise 链跑完（假时钟下 `await` 仍是微任务）。 */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReplayRecorder：启动', () => {
  it('把脱敏选项与自己的 emit 交给 record()', () => {
    const { record } = setup();

    expect(record).toHaveBeenCalledWith({
      maskAllInputs: true,
      blockSelector: '[data-rxdb-replay-block]',
      emit: expect.any(Function)
    });
  });

  it('record() 没有返回停止句柄（rrweb 内部启动失败）→ start() 抛', () => {
    const recorder = new ReplayRecorder({
      sink: createSink().sink,
      record: Object.assign(() => undefined, { addCustomEvent: vi.fn() }),
      sessionId: 's1',
      nextSeq: 0,
      flush: FLUSH,
      recordOptions: {},
      onEnd: vi.fn()
    });

    expect(() => recorder.start()).toThrow(/did not start/);
  });
});

describe('ReplayRecorder：缓冲与冲刷', () => {
  it('emit 时从 nextSeq 起分配 seq；攒满 maxEvents 立刻冲刷', () => {
    const { emitEvents, written, writes } = setup(7);

    emitEvents(0, 2);
    expect(writes).toHaveLength(0);
    emitEvents(2, 1);

    expect(written(0)).toEqual([7, 8, 9]);
    expect(writes[0]?.sessionId).toBe('s1');
    expect(writes[0]?.entries[0]?.event).toEqual(event(0));
  });

  it('不满 maxEvents 时等到 intervalMs 再冲刷', async () => {
    const { emitEvents, written, writes } = setup();

    emitEvents(0, 1);
    await vi.advanceTimersByTimeAsync(FLUSH.intervalMs - 1);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(written(0)).toEqual([0]);
  });

  it('同一时刻至多一笔在途；在途期间的事件结算后再冲', async () => {
    const { emitEvents, written, writes } = setup();
    emitEvents(0, 3);
    emitEvents(3, 3);
    await vi.advanceTimersByTimeAsync(FLUSH.intervalMs * 2);
    expect(writes).toHaveLength(1);

    writes[0]?.resolve({ kind: 'written', nextSeq: 3 });
    await settle();

    expect(written(1)).toEqual([3, 4, 5]);
  });

  it('pending() = 在途批 + 缓冲，nextSeq 是下一个要分配的 seq', () => {
    const { emitEvents, recorder } = setup();
    emitEvents(0, 4);

    expect(recorder.pending().map(entry => entry.seq)).toEqual([0, 1, 2, 3]);
    expect(recorder.nextSeq).toBe(4);
  });

  it('addCommitMarker 经 record.addCustomEvent 写 commit 标记', () => {
    const { recorder, record } = setup();

    recorder.addCommitMarker({ commitId: 'c1', branchId: 'main' });

    expect(record.addCustomEvent).toHaveBeenCalledWith(REPLAY_MARKER_TAGS.commit, { commitId: 'c1', branchId: 'main' });
  });
});

describe('ReplayRecorder：stop()', () => {
  it('停 rrweb → 等在途 → 冲刷剩余 → markStopped；之后的 emit 不再收', async () => {
    const { emitEvents, recorder, stopRecording, writes, written, markStopped } = setup();
    emitEvents(0, 4);

    const stopping = recorder.stop();
    expect(stopRecording).toHaveBeenCalledOnce();
    emitEvents(4, 1);
    writes[0]?.resolve({ kind: 'written', nextSeq: 3 });
    await settle();
    expect(written(1)).toEqual([3]);
    expect(markStopped).not.toHaveBeenCalled();
    writes[1]?.resolve({ kind: 'written', nextSeq: 4 });

    await stopping;
    expect(markStopped).toHaveBeenCalledWith('s1');
    expect(writes).toHaveLength(2);
  });

  it('stop() 中冲刷失败：抛原错误、报 error 结局、不改会话行', async () => {
    const boom = new Error('disk gone');
    const { emitEvents, recorder, writes, ends, markStopped } = setup();
    emitEvents(0, 1);

    const stopping = recorder.stop();
    writes[0]?.reject(boom);

    await expect(stopping).rejects.toBe(boom);
    expect(ends).toEqual([{ kind: 'error', error: boom }]);
    expect(markStopped).not.toHaveBeenCalled();
  });

  it('markStopped 失败：抛原错误、报 error 结局', async () => {
    const boom = new Error('readonly');
    const { recorder, markStopped, ends } = setup();
    markStopped.mockRejectedValueOnce(boom);

    await expect(recorder.stop()).rejects.toBe(boom);
    expect(ends).toEqual([{ kind: 'error', error: boom }]);
  });
});

describe('ReplayRecorder：提前结局', () => {
  it('后台冲刷失败 → 停 rrweb、报 error 结局，之后的 emit 被丢弃', async () => {
    const boom = new Error('quota');
    const { emitEvents, writes, ends, stopRecording } = setup();
    emitEvents(0, 3);

    writes[0]?.reject(boom);
    await settle();
    emitEvents(3, 3);
    await vi.advanceTimersByTimeAsync(FLUSH.intervalMs);

    expect(ends).toEqual([{ kind: 'error', error: boom }]);
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(1);
  });

  it('冲刷超限 → 停 rrweb、丢掉缓冲、报 truncated 结局；随后 stop() 不再 markStopped', async () => {
    const { emitEvents, writes, ends, stopRecording, recorder, markStopped } = setup();
    emitEvents(0, 4);

    writes[0]?.resolve({ kind: 'truncated', code: 'session_limit', limitBytes: 10 });
    await settle();

    expect(ends).toEqual([{ kind: 'truncated', code: 'session_limit' }]);
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(recorder.pending()).toEqual([]);
    await recorder.stop();
    expect(markStopped).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });
});
