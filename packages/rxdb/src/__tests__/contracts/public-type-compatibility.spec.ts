import { describe, expect, expectTypeOf, it } from 'vitest';
// 从**包根**导入，而不是相对路径——这一组断言检验的正是「用户能不能具名」，
// 绕过 index.ts 去读源文件就把要测的东西测没了。
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityStatus } from '../../entity/entity-status.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { createEntityProxy } from '../../entity/proxy.js';
import type {
  BulkSyncOptions,
  BulkSyncResult,
  DependencyGraph,
  EventListener,
  ITreeRepository,
  MergeQueryTaskOptions,
  EntityStatus as PublicEntityStatus,
  QueryManager,
  RepositorySyncStatus,
  RxDBConfig,
  VersionManager
} from '../../index.js';
import type { Rule, RuleGroup } from '../../repository/query.interface.js';
import type { RepositoryBase } from '../../repository/RepositoryBase.js';
import type {
  AdapterRepositoryConstructor,
  IRxDBAdapterOptions,
  RepositoryConstructor,
  RepositoryInstance,
  TransactionFun
} from '../../rxdb-adapter.js';
import { RxDBAdapterBase, RxDBAdapterLocalBase } from '../../rxdb-adapter.js';
import type { RxDB } from '../../RxDB.js';

class FirstEntity {}
class SecondEntity {}

class CoreRepository implements RepositoryInstance {
  constructor(
    readonly rxdb: RxDB,
    readonly EntityType: EntityType
  ) {}
}

abstract class CompatibleLocalAdapter extends RxDBAdapterLocalBase {
  abstract override transaction(fun: TransactionFun): Promise<unknown>;

  abstract override createTables(EntityTypes: EntityType[], entities?: InstanceType<EntityType>[]): Promise<boolean>;
}

class AdapterRepository implements RepositoryInstance {
  constructor(
    readonly adapter: CompatibleLocalAdapter,
    readonly EntityType: EntityType
  ) {}
}

interface ParentFilter {
  name: string;
  author: AuthorFilter | null;
  children: readonly ChildFilter[] | null | undefined;
}

interface AuthorFilter {
  name: string;
}

interface ChildFilter {
  active: boolean;
}

interface NamedAdapterOptions {
  endpoint: string;
  retries?: number;
}

const constructCoreRepository = (
  RepositoryClass: RepositoryConstructor<CoreRepository>,
  rxdb: RxDB,
  EntityType: EntityType
): CoreRepository => new RepositoryClass(rxdb, EntityType);

const constructAdapterRepository = (
  RepositoryClass: AdapterRepositoryConstructor<CompatibleLocalAdapter, AdapterRepository>,
  adapter: CompatibleLocalAdapter,
  EntityType: EntityType
): AdapterRepository => new RepositoryClass(adapter, EntityType);

const callTransaction = (adapter: Pick<RxDBAdapterLocalBase, 'transaction'>): Promise<number> =>
  adapter.transaction(async () => 42);

const callCreateTables = (
  adapter: Pick<RxDBAdapterLocalBase, 'createTables'>,
  EntityTypes: EntityType[],
  entities: InstanceType<EntityType>[]
): Promise<boolean> => adapter.createTables(EntityTypes, entities);

const nullableRelationExists = {
  field: 'author',
  operator: 'exists',
  where: {
    combinator: 'and',
    rules: [{ field: 'name', operator: '=', value: 'Jimmy' }]
  }
} satisfies Rule<ParentFilter>;

const dynamicNestedExists = {
  combinator: 'and',
  rules: [
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'active', operator: '=', value: true }]
      }
    }
  ]
} satisfies RuleGroup;

const typedRuleGroup = {
  combinator: 'and',
  rules: [
    { field: 'name', operator: '=', value: 'root' },
    {
      field: 'author',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'name', operator: '=', value: 'Jimmy' }]
      }
    },
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'active', operator: '=', value: true }]
      }
    }
  ]
} satisfies RuleGroup<ParentFilter>;

const erasedRuleGroup: RuleGroup = typedRuleGroup;
const namedOptions: NamedAdapterOptions = { endpoint: 'https://example.test', retries: 2 };
const publicOptions: IRxDBAdapterOptions = namedOptions;

/**
 * 判定一个类型是否为 `any`
 *
 * @remarks
 * `0 extends 1 & T` 只有 `T` 是 `any` 时才成立：`1 & any` 塌成 `any`，而任何类型都 extends `any`。
 * 不能用 `expectTypeOf().not.toBeAny()` 之外的普通相等断言代替——`any` 与任何类型都「相等」，
 * 相等断言对它一律报绿。
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

declare class ProxiedEntity {
  id: string;
  title: string;
}

describe('public type compatibility', () => {
  it('keeps core and adapter repository constructors callable with two arguments', () => {
    expectTypeOf(constructCoreRepository).returns.toEqualTypeOf<CoreRepository>();
    expectTypeOf(constructAdapterRepository).returns.toEqualTypeOf<AdapterRepository>();
    expect(RxDBAdapterBase).toBeDefined();
  });

  it('supports dynamic nested exists and typed RuleGroup erasure', () => {
    type NameEqualityRule = Extract<Rule<ParentFilter, 'name'>, { operator: '=' | '!=' }>;

    expectTypeOf<NameEqualityRule['field']>().toEqualTypeOf<'name'>();
    expectTypeOf<NameEqualityRule['value']>().toEqualTypeOf<string>();
    expectTypeOf(nullableRelationExists.where?.rules[0]).toMatchTypeOf<Rule<AuthorFilter> | undefined>();
    expectTypeOf(typedRuleGroup).toMatchTypeOf<RuleGroup<ParentFilter>>();
    expectTypeOf(erasedRuleGroup).toEqualTypeOf<RuleGroup>();
    expect(dynamicNestedExists.rules[0]?.where?.rules).toHaveLength(1);
  });

  it('never widens entity instances to any on the public surface', () => {
    // `EntityType` 的构造签名是 `new (...args: never[])`（有意为之，见其 TSDoc），
    // 而 `InstanceType<T>` 的约束是 `abstract new (...args: any) => any`——`any` 不可赋给 `never`，
    // 约束不满足，条件类型直接落到 `: any` 分支。于是**每一处** `InstanceType<EntityType>` 都是 `any`，
    // 而 `any` 不会报错、只会静默吞掉后续所有类型检查。这几条断言就是钉住这个塌陷不再复发。
    expectTypeOf<IsAny<ReturnType<RepositoryBase<typeof ProxiedEntity>['createEntityRef']>>>().toEqualTypeOf<false>();
    expectTypeOf<
      IsAny<ReturnType<EntityStatus<typeof ProxiedEntity>['getNeedRemoveEntities']>[number]>
    >().toEqualTypeOf<false>();

    // 代理包的是**实例**，返回类型却写成了构造器类型 `T`。这一条与 any 无关，是纯粹的错标注。
    expectTypeOf<ReturnType<typeof createEntityProxy<typeof ProxiedEntity>>>().toEqualTypeOf<ProxiedEntity>();

    // ⚠️ 已知残留，**故意**断言成 `true`：`EntityManager.createEntityRef` 至今仍返回 `any`。
    // `EntityManager` 不在 index.ts 的导出清单里，但 `RxDB.entityManager` 是 public 字段，
    // 所以 `rxdb.entityManager.createEntityRef(...)` 确实是一处公共泄漏。
    //
    // 不修的理由是实测出来的，不是懒：给它标上返回类型会顺着
    // `QueryManager.#serialize` → `QueryTask.serialize` 一路推到 `query/merge_create.ts`，
    // 在那里撞上 16 个错误，其中一半是 `Property 'id' does not exist`——
    // 因为 {@link EntityType} 的 `Instance` 形参默认是 `object`，泛型位上根本不保证有 `id`。
    // 把默认收窄成 `IEntity` 试过：普通类不满足新约束，反弹成 195 个错（69 个 TS2344）。
    // 这是 `EntityType` 本身的形状问题，得单开一轮改。
    //
    // 什么时候这条会变红：有人真把上面那条链修通了。那时**把它翻成 `false`**，别删——
    // 翻过去就等于把这处泄漏永久钉死。
    expectTypeOf<IsAny<ReturnType<EntityManager['createEntityRef']>>>().toEqualTypeOf<true>();
  });

  it('exposes every type reachable from a public signature', () => {
    // 这些类型都出现在用户拿得到的签名上（`RxDB.versionManager`、`Repository.queryManager`、
    // `getEntityStatus()` 的返回值、`addEventListener` 的形参……），却没进 index.ts 的桶。
    // 后果是用户接得到值、写不出类型：想声明一个变量去存它就没有名字可用，
    // 只能退回 `any` 或者自己抄一份结构。补导出是**加法**，不动任何既有符号。
    //
    // 断言写成「不是 never」而不是逐个比结构：这里要钉的是**可具名性**，
    // 类型自身的形状由各自模块的测试负责。类型没导出时 `import type` 直接编译失败，
    // 这个 it 连带整个文件一起红——这就是它的红态。
    expectTypeOf<EventListener<string>>().not.toBeNever();
    expectTypeOf<RxDBConfig>().not.toBeNever();
    expectTypeOf<MergeQueryTaskOptions>().not.toBeNever();
    expectTypeOf<QueryManager<typeof ProxiedEntity>>().not.toBeNever();
    expectTypeOf<PublicEntityStatus<typeof ProxiedEntity>>().not.toBeNever();
    expectTypeOf<BulkSyncOptions>().not.toBeNever();
    expectTypeOf<BulkSyncResult>().not.toBeNever();
    expectTypeOf<RepositorySyncStatus>().not.toBeNever();
    expectTypeOf<DependencyGraph>().not.toBeNever();
    expectTypeOf<VersionManager>().not.toBeNever();

    // `TreeRepository` 类**不补**：评审把它与 `VersionManager` 并列，但用户经
    // `ITreeRepository`（已在桶里）就能具名，拿不到类本身不构成缺口。
    expectTypeOf<ITreeRepository<typeof ProxiedEntity>>().not.toBeNever();
  });

  it('accepts named options and legacy local adapter overrides', () => {
    expectTypeOf(publicOptions).toEqualTypeOf<IRxDBAdapterOptions>();
    expectTypeOf<CompatibleLocalAdapter['transaction']>().toMatchTypeOf<RxDBAdapterLocalBase['transaction']>();
    expectTypeOf(callTransaction).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(callCreateTables).returns.toEqualTypeOf<Promise<boolean>>();
    expect(callCreateTables).toBeTypeOf('function');
    expect([new FirstEntity(), new SecondEntity()]).toHaveLength(2);
  });
});
