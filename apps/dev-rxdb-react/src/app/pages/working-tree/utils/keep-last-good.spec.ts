import { describe, expect, it } from 'vitest';
import { keepLastGood } from './keep-last-good';

/**
 * @fileoverview `keepLastGood` 纯函数的单测（Angular 参考实现同名 spec 的移植）：
 * 查询状态的 `loading` 相位不携带旧值，这个保底要把上一份非 loading 状态
 * 留在 loading 期间当替身。
 *
 * @remarks
 * Angular 版用 signal + flushEffects 驱动；React 版把「记住上一份已知值」拆成
 * hook（useKeepLastGood，render 调整模式），纯函数只锁「loading 该显示什么」的
 * 判定，四个用例逐条对齐。
 */

/** 最小相位形状；真实状态是 `WorkingTreeQueryState<T>`，这里只关心判别位。 */
type Probe = { readonly phase: 'idle' | 'loading' | 'success' | 'empty' | 'error' };

const SUCCESS: Probe = { phase: 'success' };
const EMPTY: Probe = { phase: 'empty' };
const LOADING: Probe = { phase: 'loading' };

describe('keepLastGood', () => {
  it('loading 相位回退到上一份已知值，非 loading 原样透传', () => {
    expect(keepLastGood(SUCCESS, null)).toEqual({ phase: 'success' });
    // loading 期间替身还停在上一份 success
    expect(keepLastGood(LOADING, SUCCESS)).toEqual({ phase: 'success' });
    // 新结果落地后一次性替换
    expect(keepLastGood(EMPTY, SUCCESS)).toEqual({ phase: 'empty' });
  });

  it('连续多次重读，替身始终是最近一次已知值', () => {
    expect(keepLastGood(LOADING, SUCCESS)).toEqual({ phase: 'success' });
    expect(keepLastGood(LOADING, EMPTY)).toEqual({ phase: 'empty' });
  });

  it('从未有过已知值时 loading 原样透传', () => {
    expect(keepLastGood(LOADING, null)).toEqual({ phase: 'loading' });
  });

  it('非 loading 相位即时透传，不延迟一帧', () => {
    // 非 loading 与替身无关，读到的就是当前值
    expect(keepLastGood(EMPTY, null)).toEqual({ phase: 'empty' });
    expect(keepLastGood({ phase: 'error' }, SUCCESS)).toEqual({ phase: 'error' });
  });
});
