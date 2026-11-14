import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { firstQueryError, type FailableQuery } from '../../services/lazy-query';

/**
 * `firstQueryError` 是 [#21](../../../../../requirements/known-defects.md) 的修法核心：
 * 把 `useFindAll` 返回的 `error` 信号读出来。此前本仓 **13 处调用点无一读过它**，
 * 于是活查询 error（订阅就此终止、列表永远冻住）是完全静默的。
 */

const query = (error?: Error): FailableQuery => ({ error: signal(error) });

describe('firstQueryError', () => {
  it('全部正常时为 null', () => {
    expect(firstQueryError([query(), query()])()).toBeNull();
  });

  it('空集合为 null —— 没有查询就没有失败', () => {
    expect(firstQueryError([])()).toBeNull();
  });

  it('带上原始 message，不做转写', () => {
    expect(firstQueryError([query(new Error('changestream closed'))])()).toBe('Live query failed: changestream closed');
  });

  it('多条出错时取第一条 —— 后面的多半是同一次故障的回声', () => {
    expect(firstQueryError([query(), query(new Error('first')), query(new Error('second'))])()).toBe(
      'Live query failed: first'
    );
  });

  it('随 error 信号变化重算 —— 它必须是活的，不是快照', () => {
    const failing = signal<Error | undefined>(undefined);
    const message = firstQueryError([{ error: failing }]);

    expect(message()).toBeNull();

    failing.set(new Error('stream died'));
    expect(message()).toBe('Live query failed: stream died');
  });
});
