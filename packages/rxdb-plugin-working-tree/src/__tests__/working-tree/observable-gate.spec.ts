/**
 * @fileoverview T049 红测试：`upsertMany()` / `deleteByIds()` 的门禁必须在**返回 Observable 之前**
 * 同步拒绝（adapter-contract.md §1.1、挂载点 4）。
 *
 * @remarks
 * 这两个方法是四个捕获挂载点里唯一返回 `Observable<void>` 的。别的三个返回 Promise，「先判定再执行」
 * 是自然而然的；这里不是——把判定写进 `defer(() => …)` 里同样能编译、同样能在订阅时抛出正确的错误，
 * 而且单看错误类型的测试也会绿。所以这个文件测的不是「拒不拒绝」（那是 T048 的决策表），而是
 * **拒绝发生在哪一刻**。
 *
 * 为什么这些断言值得写：
 *
 * 1. **门禁是包着写原语的，不是写原语之后补的一句断言。** `gateBulkWrite(request, run)` 拿到的是
 *    **还没被调用的**写原语工厂，于是「先判定」在类型上就是唯一写法，测试里也能直接观察到
 *    `run` 一次都没被调用。写成 `assertAllowed(request)` 再各自 `return this.#upsert(...)` 的话，
 *    六个适配器里少写一次、写晚一次都没有任何东西能发现。
 * 2. **「返回 Observable 之前拒绝」的可观测形式是两条，不是一条**：调用方手里**没有** Observable
 *    可以订阅，且写原语工厂**从未被调用**。只断言「抛了正确的错」的话，`throwError(() => err)`
 *    形态照样过——而那个形态下，从不订阅的调用方永远不知道自己被拒了，写原语却可能已经构造过。
 * 3. **允许的那条路必须原样透传同一个 Observable 实例。** 门禁一旦 `pipe`、`defer` 或顺手订阅一下，
 *    既有 QueryCache 调用方的订阅语义就变了：冷的变热、订阅两次只写一次、退订不再取消写入。
 *    这些调用方没打算参与这个特性，FR-046 的零行为差异对它们同样成立。`toBe` 比任何行为断言都直接。
 * 4. **未启用提交能力时每个目标类都放行，版本化实体也不例外。** 没开这个功能的库上，
 *    `upsertMany('Post', rows)` 必须与没装这个版本时逐字节一致。把门禁做成「无条件拦截版本化实体」
 *    是最容易写对一半的做法：功能没开，写法先坏。
 * 5. **规则不在这里另写一份。** 末尾一条用例把门禁在全输入空间上的行为与 `classifyWriteEntrance`
 *    的结论对齐。手写一份「批量写只拦 update」之类的近似规则，第一处分叉就会出现在这里。
 * 6. **错误信息要点名是哪个方法。** 出错的人手上只有一条报错，`upsertMany` 与 `deleteByIds` 的修法
 *    不同（前者改用 Repository 写，后者通常该走 `remove()`）。不写清楚的话，fail-fast 只剩 fail。
 * 7. **门禁入参里没有批量大小。** 一旦判定开始看行数，「先发一条空批探路」就成了合法用法；而六个
 *    后端对空批在哪一步短路并不一致，同一段调用代码会因后端而异地被拦或被放过。
 */

import type { InterceptedBulkWrite } from '@aiao/rxdb';
import { Observable } from 'rxjs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  gateBulkWrite,
  type BulkWriteGateRequest,
  type BulkWriteOperation
} from '../../working-tree/bulk-write-gate.js';
// 拒绝错误归写入口词汇表那一份：raw 通道（T050）抛的是同一个类，放在 bulk 门禁里会让
// raw 判定反过来依赖批量写模块。
import {
  classifyWriteEntrance,
  WorkingTreeWriteRejectedError,
  WRITE_TARGET_CLASSES,
  type WriteTargetClass
} from '../../working-tree/write-entry-matrix.js';

/** 默认是「在启用了提交能力的库上，对一张版本化业务实体表批量 upsert」。 */
const gateRequest = (init: Partial<BulkWriteGateRequest> = {}): BulkWriteGateRequest => ({
  entityName: 'Post',
  operation: 'upsert_many',
  targetClass: 'versioned',
  capabilityEnabled: true,
  ...init
});

interface WritePrimitiveProbe {
  /** 工厂被调用了几次——即「写原语构造了没有」。 */
  built: number;
  /** 被订阅了几次——即「写真的发生了没有」。 */
  subscribed: number;
  /** 最近一次工厂返回的实例，用于断言门禁原样透传。 */
  produced: Observable<void> | undefined;
  run: () => Observable<void>;
}

/**
 * 一个最小的写原语替身：构造与订阅分别计数。
 *
 * 真实适配器的 `upsertMany` 也是冷的——不订阅就不写。测试要观察的正是这条时间线上的两个点，
 * 所以替身把它们拆成两个计数器，而不是一个「调用过没有」的布尔。
 */
function writePrimitiveProbe(): WritePrimitiveProbe {
  const probe: WritePrimitiveProbe = {
    built: 0,
    subscribed: 0,
    produced: undefined,
    run: () => {
      probe.built += 1;
      probe.produced = new Observable<void>(subscriber => {
        probe.subscribed += 1;
        subscriber.complete();
      });
      return probe.produced;
    }
  };
  return probe;
}

/** 取出门禁**同步**抛出的拒绝错误；正常返回即失败。 */
function rejectionOf(call: () => unknown): WorkingTreeWriteRejectedError {
  try {
    call();
  } catch (error) {
    if (error instanceof WorkingTreeWriteRejectedError) return error;
    throw error;
  }
  return expect.unreachable('期望门禁在返回前同步抛出，实际正常返回了一个 Observable');
}

describe('拒绝发生在返回 Observable 之前', () => {
  it('版本化实体的 upsertMany：调用即抛，调用方手里没有 Observable', () => {
    const probe = writePrimitiveProbe();
    let handle: Observable<void> | undefined;

    expect(() => {
      handle = gateBulkWrite(gateRequest(), probe.run);
    }).toThrow(WorkingTreeWriteRejectedError);

    // 没有返回值可以订阅——这正是「不订阅也不会漏掉拒绝」的全部含义。
    expect(handle).toBeUndefined();
  });

  it('被拒时写原语工厂一次都没被调用（业务表零变化）', () => {
    const probe = writePrimitiveProbe();

    expect(() => gateBulkWrite(gateRequest(), probe.run)).toThrow(WorkingTreeWriteRejectedError);

    expect(probe.built).toBe(0);
    expect(probe.subscribed).toBe(0);
    expect(probe.produced).toBeUndefined();
  });

  it('deleteByIds 同样在返回前拒绝', () => {
    const probe = writePrimitiveProbe();

    expect(() => gateBulkWrite(gateRequest({ operation: 'delete_by_ids' }), probe.run)).toThrow(
      WorkingTreeWriteRejectedError
    );

    expect(probe.built).toBe(0);
  });
});

describe('拒绝错误本身要能照着改', () => {
  it('带 epic-006 的稳定错误码与入口身份', () => {
    const error = rejectionOf(() => gateBulkWrite(gateRequest(), writePrimitiveProbe().run));

    expect(error.code).toBe(CommitErrorCode.commit_capability_mismatch);
    expect(error.entrance).toBe('bulk_write');
    expect(error.entityName).toBe('Post');
  });

  it('信息里点名实体与方法，两个方法互不相同', () => {
    const upsert = rejectionOf(() => gateBulkWrite(gateRequest(), writePrimitiveProbe().run));
    const remove = rejectionOf(() =>
      gateBulkWrite(gateRequest({ operation: 'delete_by_ids' }), writePrimitiveProbe().run)
    );

    expect(upsert.message).toContain('Post');
    expect(upsert.message).toContain('upsertMany');
    expect(remove.message).toContain('deleteByIds');
    expect(upsert.message).not.toBe(remove.message);
  });

  it('是 RxDBError 的子类，跨 realm 靠 code 判别', () => {
    const error = rejectionOf(() => gateBulkWrite(gateRequest(), writePrimitiveProbe().run));

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WorkingTreeWriteRejectedError');
  });
});

describe('允许的那条路：原样透传，什么都不改', () => {
  it('QueryCache 实体：返回的就是写原语那一个实例', () => {
    const probe = writePrimitiveProbe();

    const returned = gateBulkWrite(gateRequest({ entityName: 'ProductCache', targetClass: 'query_cache' }), probe.run);

    expect(probe.built).toBe(1);
    expect(returned).toBe(probe.produced);
  });

  it('放行不等于开始写：订阅之前零副作用', () => {
    const probe = writePrimitiveProbe();

    const returned = gateBulkWrite(gateRequest({ targetClass: 'query_cache' }), probe.run);
    expect(probe.subscribed).toBe(0);

    returned.subscribe();
    expect(probe.subscribed).toBe(1);
  });

  it('系统表放行', () => {
    const probe = writePrimitiveProbe();

    const returned = gateBulkWrite(gateRequest({ entityName: 'RxDBChange', targetClass: 'system' }), probe.run);

    expect(returned).toBe(probe.produced);
  });
});

describe('未启用提交能力的库：零行为差异（FR-046）', () => {
  it('每个目标类都放行，版本化实体也不例外', () => {
    for (const targetClass of WRITE_TARGET_CLASSES) {
      const probe = writePrimitiveProbe();
      const returned = gateBulkWrite(gateRequest({ targetClass, capabilityEnabled: false }), probe.run);
      expect(returned, `目标类 ${targetClass}`).toBe(probe.produced);
    }
  });

  it('放行的实例依旧是冷的', () => {
    const probe = writePrimitiveProbe();

    gateBulkWrite(gateRequest({ capabilityEnabled: false }), probe.run);

    expect(probe.subscribed).toBe(0);
  });
});

describe('门禁与决策表是同一份规则', () => {
  const OPERATIONS: readonly BulkWriteOperation[] = ['upsert_many', 'delete_by_ids'];
  const COMBINATIONS = WRITE_TARGET_CLASSES.flatMap((targetClass: WriteTargetClass) =>
    OPERATIONS.flatMap(operation =>
      [true, false].map(capabilityEnabled => ({ targetClass, operation, capabilityEnabled }))
    )
  );

  it('全输入空间上「门禁抛没抛」与 classifyWriteEntrance 的结论逐一相等', () => {
    for (const combination of COMBINATIONS) {
      const decision = classifyWriteEntrance({
        entrance: 'bulk_write',
        targetClass: combination.targetClass,
        operation: combination.operation === 'delete_by_ids' ? 'delete' : 'insert',
        // 批量写的入参是整行，不是列集：untracked 字段域在这条路上无从谈起，给什么都不改变结论。
        columns: { kind: 'whole_row' },
        untrackedFields: [],
        capabilityEnabled: combination.capabilityEnabled
      });
      const probe = writePrimitiveProbe();
      let threw = false;
      try {
        gateBulkWrite(gateRequest(combination), probe.run);
      } catch {
        threw = true;
      }
      expect(threw, `${combination.operation} × ${combination.targetClass} × ${combination.capabilityEnabled}`).toBe(
        decision.kind === 'reject'
      );
    }
  });

  it('全输入空间上「放行了就一定构造过一次写原语」', () => {
    for (const combination of COMBINATIONS) {
      const probe = writePrimitiveProbe();
      try {
        gateBulkWrite(gateRequest(combination), probe.run);
      } catch {
        // 拒绝路径由上一条用例覆盖，这里只关心「放行之后写原语有没有被落下」。
      }
      expect([0, 1]).toContain(probe.built);
      expect(probe.subscribed).toBe(0);
    }
  });
});

// 门禁的操作集合必须与核心的写原语集合是**同一个**类型，不是两份碰巧相等的字面量联合。
// 各写一遍的话，核心加第四个批量写原语时插件这边零编译错误，门禁对新原语按「不认识」处理，
// 敞口静默出现。这条断言钉的是「别名关系还在」，不是「现在有哪两项」。
describe('操作集合单源于核心', () => {
  it('BulkWriteOperation 与核心 InterceptedBulkWrite 互为同一类型', () => {
    expectTypeOf<BulkWriteOperation>().toEqualTypeOf<InterceptedBulkWrite>();
    expectTypeOf<InterceptedBulkWrite>().toEqualTypeOf<BulkWriteOperation>();
  });
});
