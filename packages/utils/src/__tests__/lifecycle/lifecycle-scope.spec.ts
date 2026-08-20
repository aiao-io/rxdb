import { describe, expect, it } from 'vitest';

import type { AcquireResult, ScopeDisposer, ScopeEntry } from '../../lifecycle/index.js';
import { LifecycleScope, LifecycleScopeDisposedError } from '../../lifecycle/index.js';

/** 记录调用顺序的探针：每个 disposer 跑到时把自己的名字推进同一个数组。 */
const tracer = () => {
  const calls: string[] = [];
  const disposer =
    (name: string): ScopeDisposer =>
    () =>
      void calls.push(name);
  return { calls, disposer };
};

/** 让出若干个微任务，用于证明「串行」而不是「并发」。 */
const tick = async (times = 1): Promise<void> => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};

/**
 * 给可能自锁的 `dispose()` 加一条判定期限。
 *
 * 不加的话「永不结算」会被 vitest 报成整体超时——一条与被测语义无关的错误信息，
 * 而且要等到默认超时才落地。这里让它以明确的原因快速失败。
 */
const withDeadline = <T>(task: Promise<T>, ms = 200): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`未在 ${ms}ms 内结算：dispose() 自锁`)), ms);
  });
  return Promise.race([task, deadline]).finally(() => clearTimeout(timer));
};

describe('US-013 LifecycleScope 生命周期作用域原语', () => {
  describe('AC#1 逆序释放与三态推进', () => {
    it('按登记的反序执行，且首个 disposer 执行前状态已是 disposing', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();
      const seen: string[] = [];

      scope.acquire(() => () => void seen.push(scope.state), 'A');
      scope.acquire(() => disposer('B'), 'B');
      scope.acquire(() => disposer('C'), 'C');
      scope.acquire(() => {
        seen.push(scope.state);
        return disposer('D');
      }, 'D');

      expect(scope.state).toBe('active');
      const task = scope.dispose();
      expect(scope.state).toBe('disposing');

      await task;
      expect(calls).toEqual(['D', 'C', 'B']);
      expect(seen).toEqual(['active', 'disposing']);
      expect(scope.state).toBe('disposed');
    });
  });

  describe('AC#2 异步 disposer 串行等待', () => {
    it('后登记的那个 settle 之后，先登记的才开始', async () => {
      const scope = new LifecycleScope();
      const timeline: string[] = [];
      let releaseB: (() => void) | undefined;

      scope.acquire(() => async () => void timeline.push('A:start'), 'A');
      scope.acquire(
        () => () => {
          timeline.push('B:start');
          return new Promise<void>(resolve => {
            releaseB = () => {
              timeline.push('B:end');
              resolve();
            };
          });
        },
        'B'
      );

      const task = scope.dispose();
      await tick(2);
      expect(timeline).toEqual(['B:start']);

      releaseB?.();
      await task;
      expect(timeline).toEqual(['B:start', 'B:end', 'A:start']);
    });

    it('dispose() 的 Promise 在全部 settle 之后才 resolve', async () => {
      const scope = new LifecycleScope();
      let finished = false;

      scope.acquire(
        () => async () => {
          await tick(3);
          finished = true;
        },
        'slow'
      );

      await scope.dispose();
      expect(finished).toBe(true);
    });
  });

  describe('AC#3 手动 disposer 幂等且摘除条目', () => {
    it('重复调用只清理一次，随后的 dispose() 不再碰它', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();

      const release = scope.acquire(() => disposer('A'), 'A');
      release();
      release();
      expect(calls).toEqual(['A']);

      await scope.dispose();
      expect(calls).toEqual(['A']);
    });
  });

  describe('AC#4 / AC#4b 释放结果被缓存，成功与失败一视同仁', () => {
    it('首次成功后重复释放返回同一个 Promise 实例，清理次数不变', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();
      scope.acquire(() => disposer('A'), 'A');

      const first = scope.dispose();
      const concurrent = scope.dispose();
      await Promise.all([first, concurrent]);
      const after = scope.dispose();

      expect(concurrent).toBe(first);
      expect(after).toBe(first);
      await expect(after).resolves.toBeUndefined();
      expect(calls).toEqual(['A']);
    });

    it('首次 reject 后重复释放返回同一个已 reject 的 Promise，不重试不新增错误', async () => {
      const boom = new Error('boom');
      const bang = new Error('bang');
      let runs = 0;
      const scope = new LifecycleScope();

      scope.acquire(
        () => () => {
          runs++;
          throw boom;
        },
        'A'
      );
      scope.acquire(
        () => () => {
          runs++;
          throw bang;
        },
        'B'
      );

      const first = scope.dispose();
      const firstError = await first.catch((error: unknown) => error);
      const second = scope.dispose();
      const secondError = await second.catch((error: unknown) => error);

      expect(second).toBe(first);
      expect(secondError).toBe(firstError);
      expect(firstError).toBeInstanceOf(AggregateError);
      expect((firstError as AggregateError).errors).toEqual([bang, boom]);
      expect(runs).toBe(2);
    });
  });

  describe('AC#5 / AC#5b 非 active 时拒绝登记', () => {
    it('acquire() 同步抛专用错误，setup 不被执行，消息含两个 label', async () => {
      const scope = new LifecycleScope('epoch');
      await scope.dispose();

      let executed = false;
      const setup = (): AcquireResult => {
        executed = true;
        return undefined;
      };

      expect(() => scope.acquire(setup, 'late-entry')).toThrow(LifecycleScopeDisposedError);
      expect(executed).toBe(false);

      const error = (() => {
        try {
          scope.acquire(setup, 'late-entry');
        } catch (caught: unknown) {
          return caught as Error;
        }
        throw new Error('预期抛错但没有');
      })();

      expect(error.message).toContain('epoch');
      expect(error.message).toContain('late-entry');
    });

    it('child() 同规则：抛同一个错误且不返回任何作用域实例', async () => {
      const scope = new LifecycleScope('epoch');
      await scope.dispose();

      expect(() => scope.child('late-child')).toThrow(LifecycleScopeDisposedError);
    });

    it('disposing 期间 child() 同样被拒', async () => {
      const scope = new LifecycleScope('epoch');
      let rejected: unknown;

      scope.acquire(
        () => () => {
          try {
            scope.child('mid-dispose');
          } catch (error: unknown) {
            rejected = error;
          }
        },
        'A'
      );

      await scope.dispose();
      expect(rejected).toBeInstanceOf(LifecycleScopeDisposedError);
    });
  });

  describe('AC#6 disposer 内部再登记', () => {
    it('抛专用错误，其余 disposer 照常跑完', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();
      let caught: unknown;

      scope.acquire(() => disposer('A'), 'A');
      scope.acquire(
        () => () => {
          try {
            scope.acquire(() => disposer('never'), 'never');
          } catch (error: unknown) {
            caught = error;
          }
        },
        'B'
      );
      scope.acquire(() => disposer('C'), 'C');

      await scope.dispose();
      expect(caught).toBeInstanceOf(LifecycleScopeDisposedError);
      expect(calls).toEqual(['C', 'A']);
    });

    it('未自行捕获时走与其它 disposer 相同的出口（不被特殊对待）', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();

      scope.acquire(() => disposer('A'), 'A');
      scope.acquire(() => () => void scope.acquire(() => undefined, 'never'), 'B');

      await expect(scope.dispose()).rejects.toBeInstanceOf(LifecycleScopeDisposedError);
      expect(calls).toEqual(['A']);
    });
  });

  describe('AC#6b disposer 内部释放本作用域', () => {
    it('多条登记时不自锁：后跑的自释放条目立即得到一个已结算的 Promise', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope('multi');

      // 先登记 → 后执行：它跑到时 #disposeTask 已经指向本轮 in-flight 的那个 Promise
      scope.acquire(() => () => scope.dispose(), 'self');
      scope.acquire(() => disposer('later'), 'later');

      await expect(withDeadline(scope.dispose())).resolves.toBeUndefined();
      expect(scope.state).toBe('disposed');
      // 重入的那次没有再起一轮：清单只跑了一遍
      expect(calls).toEqual(['later']);
    });

    it('单条登记时行为一致（重入发生在赋值之前，同样不重复执行清单）', async () => {
      const calls: string[] = [];
      const scope = new LifecycleScope('single');

      scope.acquire(
        () => () => {
          calls.push('self');
          return scope.dispose();
        },
        'self'
      );

      await expect(withDeadline(scope.dispose())).resolves.toBeUndefined();
      expect(scope.state).toBe('disposed');
      expect(calls).toEqual(['self']);
    });

    it('子作用域在场时同样不自锁', async () => {
      const scope = new LifecycleScope('parent');

      scope.acquire(() => () => scope.dispose(), 'self');
      const child = scope.child('child');

      await expect(withDeadline(scope.dispose())).resolves.toBeUndefined();
      expect(scope.state).toBe('disposed');
      expect(child.state).toBe('disposed');
    });

    it('重入判定只圈住 disposer 的同步调用帧，不影响外部并发调用拿到同一个 Promise', async () => {
      const scope = new LifecycleScope('concurrent');
      let releaseSlow: (() => void) | undefined;

      scope.acquire(
        () => () =>
          new Promise<void>(resolve => {
            releaseSlow = resolve;
          }),
        'slow'
      );

      const first = scope.dispose();
      await tick();
      // 此刻 #runDispose 正挂在 slow 的 await 上——标志必须已经关掉，
      // 否则外部这次调用会被误判成重入而拿到一个新的 no-op Promise（AC#4 失效）
      const concurrent = scope.dispose();
      expect(concurrent).toBe(first);

      releaseSlow?.();
      await first;
    });

    it('disposer 抛错后标志复位，后续条目的重入判定不受影响', async () => {
      const scope = new LifecycleScope('after-throw');
      const seen: Array<Promise<void>> = [];

      scope.acquire(() => () => void seen.push(scope.dispose()), 'self');
      scope.acquire(
        () => () => {
          throw new Error('boom');
        },
        'boom'
      );

      await expect(withDeadline(scope.dispose())).rejects.toThrow('boom');
      expect(scope.state).toBe('disposed');
      await expect(withDeadline(seen[0]!)).resolves.toBeUndefined();
    });
  });

  describe('AC#7 / AC#8 错误隔离与聚合口径', () => {
    it('多错：全部被调用不短路，AggregateError 按执行顺序排列，仍进入 disposed', async () => {
      const { calls, disposer } = tracer();
      const first = new Error('first');
      const second = new Error('second');
      const scope = new LifecycleScope();

      scope.acquire(() => disposer('A'), 'A');
      scope.acquire(
        () => () => {
          throw first;
        },
        'B'
      );
      scope.acquire(
        () => () => {
          throw second;
        },
        'C'
      );

      const error = await scope.dispose().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([second, first]);
      expect(calls).toEqual(['A']);
      expect(scope.state).toBe('disposed');
    });

    it('恰好一个错：原样重抛，不包 AggregateError', async () => {
      const only = new Error('only');
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();

      scope.acquire(() => disposer('A'), 'A');
      scope.acquire(
        () => () => {
          throw only;
        },
        'B'
      );

      await expect(scope.dispose()).rejects.toBe(only);
      expect(calls).toEqual(['A']);
    });

    it('异步 disposer 的 reject 与同步抛错走同一条出口', async () => {
      const async_error = new Error('async');
      const scope = new LifecycleScope();
      scope.acquire(() => () => Promise.reject(async_error), 'A');

      await expect(scope.dispose()).rejects.toBe(async_error);
    });
  });

  describe('AC#9 / AC#9b 嵌套：按创建位置释放，释放前可读出结构', () => {
    it('子作用域在它被创建的那个位置整体释放', async () => {
      const { calls, disposer } = tracer();
      const parent = new LifecycleScope('parent');

      parent.acquire(() => disposer('A'), 'A');
      const child = parent.child('S');
      child.acquire(() => disposer('s1'), 's1');
      child.acquire(() => disposer('s2'), 's2');
      parent.acquire(() => disposer('B'), 'B');

      await parent.dispose();

      expect(calls).toEqual(['B', 's2', 's1', 'A']);
      expect(child.state).toBe('disposed');
    });

    it('getEntries() 返回登记顺序的树形快照，未传 label 记为 anonymous', () => {
      const parent = new LifecycleScope('parent');

      parent.acquire(() => undefined, 'A');
      const child = parent.child('S');
      child.acquire(() => undefined, 's1');
      child.acquire(() => undefined);
      parent.acquire(() => undefined, 'B');

      const expected: ScopeEntry[] = [
        { label: 'A', children: [] },
        {
          label: 'S',
          children: [
            { label: 's1', children: [] },
            { label: 'anonymous', children: [] }
          ]
        },
        { label: 'B', children: [] }
      ];

      expect(parent.getEntries()).toEqual(expected);
      expect(parent.getEntries()).toEqual(expected);
      expect(parent.state).toBe('active');
    });

    it('返回的是快照而非活引用：改动返回值不影响作用域', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();
      scope.acquire(() => disposer('A'), 'A');

      const entries = scope.getEntries();
      entries.length = 0;

      await scope.dispose();
      expect(calls).toEqual(['A']);
    });

    it('释放中与已释放的作用域读出为空且不抛错', async () => {
      const scope = new LifecycleScope();
      let during: ScopeEntry[] | undefined;

      scope.acquire(() => () => void (during = scope.getEntries()), 'A');
      await scope.dispose();

      expect(during).toEqual([]);
      expect(scope.getEntries()).toEqual([]);
    });
  });

  describe('AC#10 / AC#14 子作用域独立释放后从父清单摘除', () => {
    it('父释放时不二次调用它，其余条目正常释放', async () => {
      const { calls, disposer } = tracer();
      const parent = new LifecycleScope('parent');

      parent.acquire(() => disposer('A'), 'A');
      const child = parent.child('S');
      child.acquire(() => disposer('s1'), 's1');

      await child.dispose();
      expect(calls).toEqual(['s1']);

      await parent.dispose();
      expect(calls).toEqual(['s1', 'A']);
    });

    it('子作用域独立释放时内部抛错，仍进入 disposed 并已摘除', async () => {
      const { calls, disposer } = tracer();
      const boom = new Error('boom');
      const parent = new LifecycleScope('parent');

      parent.acquire(() => disposer('A'), 'A');
      const child = parent.child('S');
      child.acquire(
        () => () => {
          throw boom;
        },
        's1'
      );

      await expect(child.dispose()).rejects.toBe(boom);
      expect(child.state).toBe('disposed');
      expect(parent.getEntries()).toEqual([{ label: 'A', children: [] }]);

      await expect(parent.dispose()).resolves.toBeUndefined();
      expect(calls).toEqual(['A']);
    });
  });

  describe('AC#11 setup 返回 undefined', () => {
    it('不抛错、不调用任何东西，返回的 disposer 是 no-op', async () => {
      const scope = new LifecycleScope();
      const release = scope.acquire(() => undefined, 'noop');

      expect(() => release()).not.toThrow();
      await expect(scope.dispose()).resolves.toBeUndefined();
    });
  });

  describe('AC#12 / AC#12b setup 抛错不污染清单', () => {
    it('错误原样抛出，该条目不进清单，作用域仍为 active', async () => {
      const boom = new Error('setup failed');
      const scope = new LifecycleScope();

      expect(() =>
        scope.acquire(() => {
          throw boom;
        }, 'A')
      ).toThrow(boom);

      expect(scope.state).toBe('active');
      expect(scope.getEntries()).toEqual([]);
      await expect(scope.dispose()).resolves.toBeUndefined();
    });

    it('先前成功登记的条目照常回滚（分次 acquire 的安全性）', async () => {
      const { calls, disposer } = tracer();
      const scope = new LifecycleScope();

      scope.acquire(() => disposer('A'), 'A');
      expect(() =>
        scope.acquire(() => {
          throw new Error('second failed');
        }, 'B')
      ).toThrow('second failed');

      expect(scope.state).toBe('active');
      await scope.dispose();
      expect(calls).toEqual(['A']);
    });
  });

  describe('AC#13 手动 disposer 失败不回滚不重试', () => {
    it('错误抛给手动调用方，dispose() 不再重试它', async () => {
      const boom = new Error('cleanup failed');
      const { calls, disposer } = tracer();
      let runs = 0;
      const scope = new LifecycleScope();

      scope.acquire(() => disposer('A'), 'A');
      const release = scope.acquire(
        () => () => {
          runs++;
          throw boom;
        },
        'B'
      );

      expect(() => release()).toThrow(boom);
      expect(runs).toBe(1);

      await expect(scope.dispose()).resolves.toBeUndefined();
      expect(runs).toBe(1);
      expect(calls).toEqual(['A']);
    });
  });

  describe('AC#15 公开表面', () => {
    it('label 只读且缺省为 anonymous', () => {
      expect(new LifecycleScope().label).toBe('anonymous');
      expect(new LifecycleScope('named').label).toBe('named');
    });

    it('LifecycleScopeDisposedError 是可判别的 Error 子类', async () => {
      const scope = new LifecycleScope();
      await scope.dispose();

      const error = (() => {
        try {
          scope.acquire(() => undefined);
        } catch (caught: unknown) {
          return caught as Error;
        }
        throw new Error('预期抛错但没有');
      })();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LifecycleScopeDisposedError);
      expect(error.name).toBe('LifecycleScopeDisposedError');
    });
  });
});
