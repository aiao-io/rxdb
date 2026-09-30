import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { keepLastGood } from './working-tree.keep-last-good';

/**
 * @fileoverview `keepLastGood` 的单测：查询状态的 `loading` 相位不携带旧值，
 * 这个保底要把上一份非 loading 状态留在 loading 期间当替身。
 */

/** 最小相位形状；真实状态是 `WorkingTreeQueryState<T>`，这里只关心判别位。 */
type Probe = { readonly phase: 'idle' | 'loading' | 'success' | 'empty' | 'error' };

describe('keepLastGood', () => {
  it('loading 相位回退到上一份已知值，非 loading 原样透传', () => {
    TestBed.runInInjectionContext(() => {
      const source = signal<Probe>({ phase: 'idle' });
      const display = keepLastGood(source);

      source.set({ phase: 'success' });
      TestBed.flushEffects();
      expect(display()).toEqual({ phase: 'success' });

      // loading 期间替身还停在上一份 success
      source.set({ phase: 'loading' });
      expect(display()).toEqual({ phase: 'success' });

      // 新结果落地后一次性替换
      source.set({ phase: 'empty' });
      expect(display()).toEqual({ phase: 'empty' });
    });
  });

  it('连续多次重读，替身始终是最近一次已知值', () => {
    TestBed.runInInjectionContext(() => {
      const source = signal<Probe>({ phase: 'idle' });
      const display = keepLastGood(source);

      source.set({ phase: 'success' });
      TestBed.flushEffects();
      source.set({ phase: 'loading' });
      expect(display()).toEqual({ phase: 'success' });

      source.set({ phase: 'empty' });
      TestBed.flushEffects();
      source.set({ phase: 'loading' });
      expect(display()).toEqual({ phase: 'empty' });
    });
  });

  it('从未有过已知值时 loading 原样透传', () => {
    TestBed.runInInjectionContext(() => {
      const source = signal<Probe>({ phase: 'loading' });
      const display = keepLastGood(source);
      TestBed.flushEffects();

      expect(display()).toEqual({ phase: 'loading' });
    });
  });

  it('非 loading 相位即时透传，不延迟一帧', () => {
    TestBed.runInInjectionContext(() => {
      const source = signal<Probe>({ phase: 'idle' });
      const display = keepLastGood(source);

      // 不 flush：非 loading 与替身无关，读到的就是当前值
      source.set({ phase: 'empty' });
      expect(display()).toEqual({ phase: 'empty' });

      source.set({ phase: 'error' });
      expect(display()).toEqual({ phase: 'error' });
    });
  });
});
