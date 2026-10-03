/**
 * @fileoverview 选项归一化（`specs/005-us-909-session-replay/contracts/replay-plugin.md` §2）。
 *
 * @remarks
 * 校验都在构造期同步抛：录制库工厂、上限与冲刷节奏任何一个配错，都应该在 `rxdb.use()` 那一行炸，
 * 而不是等到用户点了「开始录制」、录了一半才发现会话上限比总量还大。
 */

import { describe, expect, it } from 'vitest';
import { REPLAY_BLOCK_SELECTOR, resolveReplayOptions, type RxDBReplayOptions } from '../options.js';

const factory: RxDBReplayOptions['createRecordingDb'] = () => {
  throw new Error('测试里不会调用');
};

describe('resolveReplayOptions：默认值', () => {
  it('只给工厂 → 上限 16 MiB / 128 MiB、冲刷 1000 ms / 200 条、默认遮蔽全部输入', () => {
    const resolved = resolveReplayOptions({ createRecordingDb: factory });

    expect(resolved.createRecordingDb).toBe(factory);
    expect(resolved.limits).toEqual({ sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 });
    expect(resolved.flush).toEqual({ intervalMs: 1000, maxEvents: 200 });
    expect(resolved.record.maskAllInputs).toBe(true);
    expect(resolved.record.blockSelector).toBe(REPLAY_BLOCK_SELECTOR);
  });

  it('部分覆盖只换掉给出的那几项', () => {
    const resolved = resolveReplayOptions({
      createRecordingDb: factory,
      limits: { sessionBytes: 1024 },
      flush: { maxEvents: 5 }
    });

    expect(resolved.limits).toEqual({ sessionBytes: 1024, storeBytes: 128 * 1024 * 1024 });
    expect(resolved.flush).toEqual({ intervalMs: 1000, maxEvents: 5 });
  });

  it('record 子集原样透传，blockSelector 与内置选择器合并', () => {
    const resolved = resolveReplayOptions({
      createRecordingDb: factory,
      record: {
        maskAllInputs: false,
        maskInputOptions: { password: true },
        maskTextSelector: '.secret',
        maskTextClass: 'pii',
        blockSelector: '.ads',
        blockClass: 'no-record',
        ignoreSelector: '.noise'
      }
    });

    expect(resolved.record).toEqual({
      maskAllInputs: false,
      maskInputOptions: { password: true },
      maskTextSelector: '.secret',
      maskTextClass: 'pii',
      blockSelector: `.ads, ${REPLAY_BLOCK_SELECTOR}`,
      blockClass: 'no-record',
      ignoreSelector: '.noise'
    });
  });

  it('record 里子集以外的键不透传（emit / plugins / hooks 由插件自己掌控）', () => {
    const resolved = resolveReplayOptions({
      createRecordingDb: factory,
      record: { emit: () => undefined, plugins: [], hooks: {} } as unknown as RxDBReplayOptions['record']
    });

    expect(Object.keys(resolved.record).sort()).toEqual(['blockSelector', 'maskAllInputs']);
  });
});

describe('resolveReplayOptions：校验', () => {
  it('没给选项 → TypeError', () => {
    expect(() => resolveReplayOptions(undefined)).toThrow(TypeError);
  });

  it('createRecordingDb 不是函数 → TypeError', () => {
    expect(() => resolveReplayOptions({ createRecordingDb: 'idb' } as unknown as RxDBReplayOptions)).toThrow(TypeError);
  });

  it.each([
    ['limits.sessionBytes', { limits: { sessionBytes: 0 } }],
    ['limits.sessionBytes', { limits: { sessionBytes: 1.5 } }],
    ['limits.storeBytes', { limits: { storeBytes: -1 } }],
    ['limits.storeBytes', { limits: { storeBytes: Number.MAX_SAFE_INTEGER + 1 } }],
    ['flush.intervalMs', { flush: { intervalMs: Number.NaN } }],
    ['flush.intervalMs', { flush: { intervalMs: Number.POSITIVE_INFINITY } }],
    ['flush.maxEvents', { flush: { maxEvents: 0 } }],
    ['flush.maxEvents', { flush: { maxEvents: '10' as unknown as number } }]
  ])('%s 不是正的安全整数 → RangeError', (field, partial) => {
    expect(() => resolveReplayOptions({ createRecordingDb: factory, ...partial })).toThrow(
      expect.objectContaining({ name: 'RangeError', message: expect.stringContaining(field) })
    );
  });

  it('sessionBytes > storeBytes → RangeError', () => {
    expect(() =>
      resolveReplayOptions({ createRecordingDb: factory, limits: { sessionBytes: 2048, storeBytes: 1024 } })
    ).toThrow(RangeError);
  });

  it('sessionBytes === storeBytes 允许', () => {
    const resolved = resolveReplayOptions({
      createRecordingDb: factory,
      limits: { sessionBytes: 1024, storeBytes: 1024 }
    });

    expect(resolved.limits).toEqual({ sessionBytes: 1024, storeBytes: 1024 });
  });
});
