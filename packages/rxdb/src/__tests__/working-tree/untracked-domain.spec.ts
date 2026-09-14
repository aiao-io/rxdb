/**
 * @fileoverview T051 红测试：版本化域的 tracked / untracked 判定（spec.md「版本化域」、conformance-suites.md §1.4）。
 *
 * @remarks
 * 这份清单是**唯一**的一份：raw 通道的 5 步判定（T050/T062）、批量写门禁（T049/T061）、捕获挂载点
 * （T058–T061）问的都是它。所以这里测的不是「某个实体是不是 tracked」，而是**这份清单怎么算出来、
 * 以及它对外暴露成什么形状**——形状一错，下游六个适配器各自补一份就成了必然。
 *
 * 为什么这些断言值得写：
 *
 * 1. **默认 tracked，不是默认 untracked。** 判据是「净变化能否由 HEAD + WorkingTreeEntry 重放」，
 *    一个没被登记过的新实体当然能重放，所以它进版本控制。反过来的默认值意味着任何人新加一个实体，
 *    它的改动都悄悄不进提交——而这种漏没有任何报错形态，只会表现为「我明明改了，commit 说没有变更」。
 * 2. **三类 untracked 各测一组，外加一条「第四类不存在」。** spec.md 把「新增第四类必须先改
 *    epic-006」写成了硬规则；规则要能被违反才有意义，所以用例里放一个不属于任何一类的实体，
 *    断言它是 tracked。少了这条，往判定里塞第四类分支不会让任何用例变红。
 * 3. **untracked 是静态属性，不看入口。** 同一个实体在 CRUD 上 tracked、在同步路径上 untracked，
 *    会让「工作树是否有未提交变更」取决于变更**怎么来的**——而 status 面向的用户不知道也不该知道
 *    这件事。判定函数因此不接收入口、意图或调用方参数：这条用它的**签名**来保证，用例只负责
 *    把这个约束写成可读的断言。
 * 4. **`origin='remote_sync'` 不是 untracked。** 它是 tracked 实体的一次净变化，只是作者不是本地
 *    用户。把它当豁免最省事（远端拉下来的东西不该算我的改动），但那样一次 pull 之后 HEAD 与工作树
 *    就永久对不上，且这个偏差不可见、不可恢复。
 * 5. **派生索引列按表登记。** 第三类是「插件在**业务表上**加装的派生索引列」，列名由插件静态声明。
 *    并成一个全域集合会让登记在 A 表上的列名在 B 表上一并豁免，而这个集合是插件可以往里写东西的。
 * 6. **混用事务在**检测到的那一刻**抛，不预知未来。** spec.md 场景 7 明确「不要求事务系统预知回调
 *    未来的操作」——所以守卫是流式的：第 5 次操作才暴露混用就在第 5 次抛，前 4 次必须正常返回。
 *    想要「事务一开始就知道会混用」只能要求调用方预先声明操作集，那是另一套 API。
 *    **整事务回滚**由适配器保证（throw ⇒ rollback），在真实后端上由 conformance 套件核验；
 *    这里只钉死守卫**抛不抛、什么时候抛**——这是判定自己的责任边界。
 * 7. **清单产出的视图就是 raw 判定消费的那个端口。** 用例直接把 `VersionedDomainView` 的两个成员
 *    拿来断言，于是「不得另建第二份」从一句规约变成一条类型约束：两边形状分叉时编译就红。
 */

import { describe, expect, it } from 'vitest';
import { SyncType } from '../../entity/sync-options.interface.js';
import {
  buildVersionedDomain,
  MixedVersionedCacheTransactionError,
  UNTRACKED_BOOKKEEPING_FIELDS,
  type VersionedDomain,
  type VersionedDomainEntityInput,
  type VersionedDomainView
} from '../../working-tree/versioned-domain.js';

const entity = (init: Partial<VersionedDomainEntityInput> & { entityName: string }): VersionedDomainEntityInput => ({
  namespace: 'public',
  tableName: init.entityName.toLowerCase(),
  syncType: SyncType.Full,
  ...init
});

/** 一份覆盖三类 untracked 的登记：两个普通实体、一个 QueryCache 实体、一列插件派生索引。 */
const DOMAIN_INPUT: readonly VersionedDomainEntityInput[] = [
  entity({ entityName: 'Post', derivedIndexColumns: ['title_norm'] }),
  entity({ entityName: 'Comment' }),
  entity({ entityName: 'Draft', syncType: SyncType.None }),
  entity({ entityName: 'ProductCache', syncType: SyncType.QueryCache })
];

const domain = (): VersionedDomain => buildVersionedDomain(DOMAIN_INPUT);

describe('第一类 untracked — QueryCache 同步类型的实体', () => {
  it('整个实体不进版本化域', () => {
    expect(domain().classifyEntity('ProductCache')).toBe('untracked');
  });

  it('它的表不出现在版本化表集合里', () => {
    // 这一条是 raw 判定第 5 步「QueryCache 实体表放行」的来源：判定不认识 QueryCache 这个概念，
    // 它只看表在不在集合里。集合算错，第 5 步就跟着错，而两处都不会报错。
    expect(domain().versionedTables.has('productcache')).toBe(false);
    expect(domain().versionedTables.has('post')).toBe(true);
  });

  it('缓存实体的任意列都不构成净变化', () => {
    expect(domain().isUntrackedField('ProductCache', 'payload')).toBe(true);
  });
});

describe('第二类 untracked — 实体行上的簿记字段', () => {
  it('remoteId / 同步水位 / 审计时间是 untracked', () => {
    const view = domain();
    for (const field of UNTRACKED_BOOKKEEPING_FIELDS) {
      expect(view.isUntrackedField('Post', field), field).toBe(true);
    }
  });

  it('簿记字段是全域的：每个实体上都豁免，登记过的和没登记的都算', () => {
    // 留在实体/字段这一个平面上断言。`untrackedFieldsOf()` 是同一条规则在表/列平面的投影，
    // 两个平面的拼写由 T056 的清单决定，用例不替它规定。
    const view = domain();
    for (const entityName of ['Post', 'Comment', 'Draft', 'Invoice']) {
      for (const field of UNTRACKED_BOOKKEEPING_FIELDS) {
        expect(view.isUntrackedField(entityName, field), `${entityName}.${field}`).toBe(true);
      }
    }
  });

  it('业务字段不因为同在一行就跟着豁免', () => {
    expect(domain().isUntrackedField('Post', 'title')).toBe(false);
  });

  it('带簿记字段的实体本身仍是 tracked', () => {
    // 豁免的粒度是**字段**。整实体跟着豁免的话，任何有 remoteId 的实体都退出版本控制——那是全部。
    expect(domain().classifyEntity('Post')).toBe('tracked');
  });
});

describe('第三类 untracked — 插件静态声明的派生索引列', () => {
  it('登记过的派生列在它自己的表上豁免', () => {
    expect(domain().isUntrackedField('Post', 'title_norm')).toBe(true);
  });

  it('不豁免别的表的同名列', () => {
    expect(domain().isUntrackedField('Comment', 'title_norm')).toBe(false);
    expect(domain().untrackedFieldsOf('comment').has('title_norm')).toBe(false);
  });

  it('没登记过的列不因为长得像派生列就豁免', () => {
    // 「静态声明并登记」是这一类的成立条件。按命名约定（`_norm` / `_idx` 后缀）推断的话，
    // 谁都可以给一个业务字段改个名字让它退出版本控制。
    expect(domain().isUntrackedField('Post', 'body_norm')).toBe(false);
  });
});

describe('没有第四类：清单外的实体默认 tracked', () => {
  it('未登记的实体是 tracked', () => {
    expect(domain().classifyEntity('Invoice')).toBe('tracked');
  });

  it('未登记实体的普通字段不豁免', () => {
    expect(domain().isUntrackedField('Invoice', 'amount')).toBe(false);
  });

  it('未登记实体的簿记字段照常豁免', () => {
    // 簿记字段的豁免依据是「这个列不表达用户意图」，与实体有没有被登记无关。
    expect(domain().isUntrackedField('Invoice', 'remoteId')).toBe(true);
  });

  it('三类之外的同步类型（Full / Filter / None）一律 tracked', () => {
    const view = buildVersionedDomain([
      entity({ entityName: 'A', syncType: SyncType.Full }),
      entity({ entityName: 'B', syncType: SyncType.Filter }),
      entity({ entityName: 'C', syncType: SyncType.None })
    ]);

    expect([view.classifyEntity('A'), view.classifyEntity('B'), view.classifyEntity('C')]).toEqual([
      'tracked',
      'tracked',
      'tracked'
    ]);
  });
});

describe('untracked 是静态属性', () => {
  it('同一实体的判定与调用次数、调用顺序无关', () => {
    const view = domain();
    const readings = [
      view.classifyEntity('ProductCache'),
      view.classifyEntity('Post'),
      view.classifyEntity('ProductCache')
    ];

    expect(readings).toEqual(['untracked', 'tracked', 'untracked']);
  });

  it('同一份输入构造两次，两份清单逐项相等', () => {
    const first = buildVersionedDomain(DOMAIN_INPUT);
    const second = buildVersionedDomain(DOMAIN_INPUT);

    expect([...first.versionedTables].sort()).toEqual([...second.versionedTables].sort());
    expect([...first.untrackedFieldsOf('post')].sort()).toEqual([...second.untrackedFieldsOf('post')].sort());
  });

  it('构造不改动传进来的登记数组', () => {
    const input = [...DOMAIN_INPUT];
    buildVersionedDomain(input);
    expect(input).toEqual([...DOMAIN_INPUT]);
  });
});

describe('origin=remote_sync 不是 untracked 的一种', () => {
  it('远端拉下来的实体仍然是 tracked 实体', () => {
    // 判定函数只收实体名，收不到 origin——这条断言与其说在测行为，不如说在把「判定看不见来源」
    // 这件事写成可读的形式。真出现「按 origin 豁免」的实现，它的签名先对不上。
    expect(domain().classifyEntity('Post')).toBe('tracked');
  });

  it('同步路径写的业务字段照样不是 untracked 字段', () => {
    expect(domain().isUntrackedField('Post', 'title')).toBe(false);
  });

  it('只有真正的簿记字段才豁免，哪怕同一次 pull 一起写下来', () => {
    const view = domain();
    expect([view.isUntrackedField('Post', 'remoteId'), view.isUntrackedField('Post', 'title')]).toEqual([true, false]);
  });
});

describe('tracked 与 untracked 混进同一事务', () => {
  it('检测到混用时抛 mixed_versioned_cache_transaction', () => {
    const guard = domain().createTransactionGuard();
    guard.record('Post');

    expect(() => guard.record('ProductCache')).toThrow(MixedVersionedCacheTransactionError);
  });

  it('反向顺序同样抛', () => {
    const guard = domain().createTransactionGuard();
    guard.record('ProductCache');

    expect(() => guard.record('Post')).toThrow(MixedVersionedCacheTransactionError);
  });

  it('抛在检测到的那一刻，不预知回调未来的操作', () => {
    // 前四次纯 tracked 的操作必须正常返回：要求守卫提前知道第五次会写缓存实体，就等于要求
    // 调用方预先声明整个事务的操作集（spec.md 场景 7 明确排除了这个前提）。
    const guard = domain().createTransactionGuard();
    const accepted: number[] = [];

    for (const step of [1, 2, 3, 4]) {
      guard.record('Post');
      accepted.push(step);
    }

    expect(accepted).toEqual([1, 2, 3, 4]);
    expect(() => guard.record('ProductCache')).toThrow(MixedVersionedCacheTransactionError);
  });

  it('同类事务一路放行：全 tracked', () => {
    const guard = domain().createTransactionGuard();
    expect(() => {
      guard.record('Post');
      guard.record('Comment');
      guard.record('Invoice');
    }).not.toThrow();
  });

  it('同类事务一路放行：全 untracked', () => {
    const guard = domain().createTransactionGuard();
    expect(() => {
      guard.record('ProductCache');
      guard.record('ProductCache');
    }).not.toThrow();
  });

  it('错误带得走两边的身份，定位得到是哪两个实体撞上的', () => {
    const guard = domain().createTransactionGuard();
    guard.record('Post');

    let caught: unknown;
    try {
      guard.record('ProductCache');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MixedVersionedCacheTransactionError);
    const error = caught as MixedVersionedCacheTransactionError;
    expect(error.code).toBe('mixed_versioned_cache_transaction');
    expect(error.trackedEntityName).toBe('Post');
    expect(error.untrackedEntityName).toBe('ProductCache');
  });

  it('两个守卫互不影响：一个事务的混用不污染另一个', () => {
    const view = domain();
    const first = view.createTransactionGuard();
    const second = view.createTransactionGuard();

    first.record('Post');

    expect(() => second.record('ProductCache')).not.toThrow();
  });
});

describe('清单产出的就是 raw 判定消费的那个端口', () => {
  it('VersionedDomain 可以直接当 VersionedDomainView 用', () => {
    // 这条断言的价值在编译期：`VersionedDomain` 与 `VersionedDomainView` 形状分叉时这一行先红，
    // 而不是等到有人在 raw 判定那边照着抄出第二份清单。
    const view: VersionedDomainView = domain();

    expect(view.versionedTables.has('post')).toBe(true);
    expect(view.untrackedFieldsOf('post').has('title')).toBe(false);
  });

  it('版本化表集合用的是表名，不是实体名', () => {
    // raw 判定拿到的是 SQL 里的表名。集合里放实体名的话，`UPDATE post` 永远命不中 `Post`，
    // 于是整条 raw 防线静默失效——没有任何用例会因此变红，除了这一条。
    const view = domain();
    expect(view.versionedTables.has('post')).toBe(true);
    expect(view.versionedTables.has('Post')).toBe(false);
  });
});
