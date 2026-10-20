import { Observable } from 'rxjs';
import { SYSTEM_ENTITY_PERMISSIONS } from '../entity/entity-permissions.js';
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
 * **`activeKey` 记的是「这条分支被哪个检出位持有」**：`NULL` 是没人持有，哨兵 `'*active*'` 是主检出位
 * （与 `activated` 同进同出，口径 `activated ⇔ activeKey = '*active*'`），其余是可写检出位的持有键
 * （US-314 B1.2）。它存在的理由是让持有关系成为一条**唯一约束**——布尔列上没法表达「只许一个 true」，
 * 而 `unique` + `nullable` 的列可以：一格只放得下一个值，所以一条分支至多一个持有者；同一个键至多
 * 出现一次，所以主检出位至多停在一条分支上、每个可写检出位至多持有一条分支。
 *
 * 代价是这些不变量由 17 处生产写点手工维护：核心 `RxDB.ts` 的建库初始行、`system-repositories.ts`
 * 与 `active-branch-guard.ts` 点亮 `main` 的各两处，历史插件 `create-branch.ts` 与同步插件
 * `sync-branches.ts` 建分支行，以及 pglite / sqlite-core 两个适配器的 switch（熄灭、点亮）与
 * migrate（清旧哨兵、回填、零 active 点亮）SQL。每一处都带着「漏写一处就绕过唯一约束」的注释，
 * 主检出位要持有一条分支的那几处还得先过 `WorktreeBranchHeldError.throwIfHeld`——不变量靠人守，
 * 不是机械保证的。
 *
 * 真正的修法是让 `activated` 那一半由 schema 表达：`activated` 改成由 `activeKey` 推出的生成列
 * （`GENERATED ALWAYS AS (activeKey = '*active*')`），写点只剩 `activeKey` 一列。B1.2 之前的两种
 * 方向（`activeKey` 改生成列、或去掉它改在 `activated` 上建部分唯一索引）装不下持有键，已经不成立。
 * 没做是因为它要动六个适配器的 system schema 迁移、并给既有库写迁移步骤；只改写点不改 schema
 * 等于把手写换成同样多的调用，不变量仍然靠人守。顺延记录见 `requirements/roadmap.md`
 * 的「epic-006 评审顺延的架构项」。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBBranch',
  tableName: 'rxdb_branch',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
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
   * 持有键：主检出位停在本分支时为 `ACTIVE_BRANCH_KEY`，被可写检出位持有时为那个检出位的持有键，
   * 没人持有时为 `null`
   *
   * @remarks
   * 唯一约束 + `NULL` 不参与唯一比较 = 全库至多一条 active 分支、每个可写检出位至多持有一条分支。
   * 这条约束只有 schema 拦得住：运行期守卫再严，也只能在两行都写进去**之后**才发现，而那时
   * 「当前分支是谁」已经没有答案了。
   *
   * 它**不是**第二份 active 分支 id。主检出位那一半的真相仍然只有 `activated` 一列，本列存的是
   * 一个与任何分支 id 都不相同的常量哨兵——存 id 会让同一个事实有两份写法，二者漂移时无法判定谁对。
   * 因此**每一处**写 `activated` 的地方都必须同时写本列，`activated` 与哨兵必须同进同出。
   *
   * 持有键是 US-314 B1.2 加的第三种值，对应的那一行 `activated` 为假。主检出位要持有一条分支之前
   * 先过 `WorktreeBranchHeldError.throwIfHeld`：点亮写的是哨兵，正好把持有键覆盖掉，唯一约束撞不上。
   * 清旧哨兵也只能按值清，按「非空」清会连持有键一起抹掉。
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
  declare parent$: RelationEntityObservable<typeof RxDBBranch>;

  /**
   * 变更
   */
  declare changes$: RelationEntitiesObservable<typeof RxDBChange>;

  /**
   * syncs - 此分支的 Repository 同步记录
   */
  declare syncs$: RelationEntitiesObservable<typeof RxDBSync>;

  /**
   * 子分支
   */
  declare children$: RelationEntitiesObservable<typeof RxDBBranch>;

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
