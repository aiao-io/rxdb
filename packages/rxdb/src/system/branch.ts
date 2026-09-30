import { Observable } from 'rxjs';
import { Entity } from '../entity/entity.decorator.js';
import {
  ENTITY_STATIC_TYPES,
  RelationEntitiesObservable,
  RelationEntityObservable
} from '../entity/entity.interface.js';
import { PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { RxDBChange } from './change.js';
import type { RxDBSync } from './sync.js';
import { RxDBBranchOrderByField, RxDBBranchRuleGroup, RxDBBranchStaticTypes } from './types.js';

/**
 * 分支表
 *
 * 记录当前分支的信息，包括是否激活、是否本地分支、是否远程分支等
 *
 * @remarks
 * 下面的 `parent` / `children` 是自引用关系，**不是**树实体声明——分支刻意用 `@Entity`
 * 而非 `@TreeEntity`。`parentId` 列由 `parent` 这条 MANY_TO_ONE 产生，与树能力无关。
 *
 * 不用树查询是因为用了会错：递归 CTE 碰到断链、成环只会静默截断，返回一棵少了枝干的树
 * 而不是报错，也给不出有序路径和逐段的 `fromChangeId` 区间。分支的父链遍历一律手写
 * （`getPathToRoot` / `collectBranchChain` / `sync_branches` / `remove_branch`），
 * 各自带着坏数据检测。别把 `@TreeEntity` 装回来。
 *
 * **`activeKey` 是 `activated` 的第二份拷贝**（口径恒为 `activated ? '*active*' : null`），
 * 它存在的唯一理由是让「同时只有一条分支是激活的」成为一条**唯一约束**——布尔列上没法表达
 * 「只许一个 true」，而 `unique` + `nullable` 的哨兵列可以。代价是这个不变量由约十处生产写点
 * 手工共写（`RxDB.ts` 的建库初始行、`system-repositories.ts`、`active-branch-guard.ts`，
 * 以及 pglite / sqlite-core 两个适配器的 migrate 与 switch SQL 路径），每一处都带着
 * 「漏写一处就绕过唯一约束」的注释——也就是说不变量靠人守，不是机械保证的。
 *
 * 真正的修法是让约束由 schema 表达：`activeKey` 改成生成列（`GENERATED ALWAYS AS`），
 * 或者干脆去掉它、在 `activated` 上建**部分唯一索引**（`WHERE activated`）。两种都只需一处编码。
 * 没做是因为它要动六个适配器的 system schema 迁移、并给既有库写迁移步骤；只改写点不改 schema
 * 等于把十处手写换成十处调用，不变量仍然靠人守。顺延记录见 `requirements/roadmap.md`
 * 的「epic-006 评审顺延的架构项」。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBBranch',
  tableName: 'rxdb_branch',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true,
      unique: true
    },
    {
      name: 'activated',
      type: PropertyType.boolean,
      default: false
    },
    {
      name: 'activeKey',
      type: PropertyType.string,
      unique: true,
      nullable: true
    },
    {
      name: 'fromChangeId',
      type: PropertyType.number,
      nullable: true
    },
    {
      name: 'local',
      type: PropertyType.boolean,
      default: true
    },
    {
      name: 'remote',
      type: PropertyType.boolean,
      default: false
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    },
    {
      name: 'updatedAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    }
  ],
  relations: [
    {
      name: 'changes',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBChange',
      mappedProperty: 'branch'
    },
    {
      name: 'syncs',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBSync',
      mappedProperty: 'branch'
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'parent'
    },
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
export class RxDBBranch {
  static [ENTITY_STATIC_TYPES]: RxDBBranchStaticTypes;
  /**
   * id
   */
  id!: string;
  /**
   * 本地分支
   */
  local!: boolean;

  /**
   * 线上已有分支
   */
  remote!: boolean;

  /**
   * 是否激活
   */
  activated!: boolean;

  /**
   * active 哨兵键：本分支是 active 时为 `ACTIVE_BRANCH_KEY`，否则为 `null`
   *
   * @remarks
   * 唯一约束 + `NULL` 不参与唯一比较 = 全库至多一条 active 分支。这条约束只有 schema
   * 拦得住：运行期守卫再严，也只能在两行都写进去**之后**才发现，而那时「当前分支是谁」
   * 已经没有答案了。
   *
   * 它**不是**第二份 active 分支 id。真相仍然只有 `activated` 一列，本列存的是一个与任何
   * 分支 id 都不相同的常量哨兵——存 id 会让同一个事实有两份写法，二者漂移时无法判定谁对。
   *
   * 因此**每一处**写 `activated` 的地方都必须同时写本列，两列必须同进同出。
   */
  activeKey?: string | null;

  /**
   * 父分支 ID
   */
  parentId?: string | null;

  /**
   * 来源变更 ID
   */
  fromChangeId?: number | null;

  /**
   * 创建时间
   * @default new Date()
   */
  createdAt?: Date | null;

  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt?: Date | null;

  /**
   * 父分支
   */
  parent$!: RelationEntityObservable<typeof RxDBBranch>;

  /**
   * 变更
   */
  changes$!: RelationEntitiesObservable<typeof RxDBChange>;

  /**
   * syncs - 此分支的 Repository 同步记录
   */
  syncs$!: RelationEntitiesObservable<typeof RxDBSync>;

  /**
   * 子分支
   */
  children$!: RelationEntitiesObservable<typeof RxDBBranch>;

  /**
   * count 查询
   * @param options 查询选项
   */
  declare static count: (options: CountOptions<typeof RxDBBranch, RxDBBranchRuleGroup>) => Observable<number>;
  /**
   * find 查询
   * @param options 查询选项
   */
  declare static find: (
    options: FindOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * findAll 查询
   * @param options 查询选项
   */
  declare static findAll: (
    options: FindAllOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * findByCursor 查询
   * @param options 查询选项
   */
  declare static findByCursor: (
    options: FindByCursorOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * findOne 查询
   * @param options 查询选项
   */
  declare static findOne: (
    options: FindOneOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch | null>;
  /**
   * findOneOrFail 查询
   * @param options 查询选项
   */
  declare static findOneOrFail: (
    options: FindOneOrFailOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch>;
  /**
   * get 查询
   * @param options 查询选项
   */
  declare static get: (options: string) => Observable<RxDBBranch>;

  /**
   * 删除
   */
  declare remove: () => Promise<RxDBBranch>;
  /**
   * 重置数据
   */
  declare reset: () => void;
  /**
   * 保存
   */
  declare save: () => Promise<RxDBBranch>;
}
