/**
 * @fileoverview 一套业务表（US-314 可写检出位的库内影子表）。
 *
 * 可写检出位在同一个库里各有一套业务表；主检出位的那一套就是现有业务表。变更日志、分支与提交图全库只有一份，
 * 不分套。物理名怎么拼归各适配器的表名解析器（SQLite 系给表名加后缀，PGlite 换 schema），这里只给后缀与成员。
 */

import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import type { SwitchVersionActions } from '../sync-contract/VersionManager.interface.js';
import { ACTIVE_BRANCH_KEY } from './active-branch-guard.js';

/**
 * 建一套可写检出位的表时铺进去的数据（US-314 B1.5），见适配器的 `createWorktreeTableSet`。
 *
 * @remarks
 * 主表集的行原样复制过去，再叠上 {@link WorktreeTableSetSeed.actions}；最后成员表的变更触发器挂到 {@link WorktreeTableSetSeed.branchId}。
 */
export interface WorktreeTableSetSeed {
  /** 持有分支：此后这套表上的写记在它名下 */
  readonly branchId: string;
  /**
   * 主检出位所在分支走到持有分支的增量。
   *
   * @remarks
   * 补丁是变更日志里的存储形态，加密列是信封；只含这套表的成员实体，落在表集之外的键整笔拒绝。
   */
  readonly actions: SwitchVersionActions;
}

/**
 * 后缀形状：`wt_` 加 1～12 位小写字母或数字。
 *
 * @remarks
 * 只用现有物理名里本来就有的字符，没加引号的 SQL 位置也安全；`wt_` 开头让影子表一眼认得出，
 * 也不会与哪个实体的真名撞上。12 位上限给 PGlite 的 schema 名（命名空间 + `$` + 后缀）留足 63 字节的余量。
 */
const SUFFIX_BODY = 'wt_[a-z0-9]{1,12}';

const SUFFIX_PATTERN = new RegExp(`^${SUFFIX_BODY}$`);

/** 影子表集的持有键：`*worktree:<后缀>*`，见 {@link WorktreeTableSet.holderKey} */
const HOLDER_KEY_PATTERN = new RegExp(`^\\*worktree:(${SUFFIX_BODY})\\*$`);

/**
 * {@link WorktreeTableSet.heldBranchWhere} 的形状：只有一条规则的条件组
 *
 * @remarks
 * 写成具体的字面量形状，不写成分支表的规则组类型：它要同时交给系统表仓储（`RxDBBranchRuleGroup`）与通用仓储
 * （`RuleGroup<RxDBBranch>`），这两个类型互不可赋值，具体形状对两边都可赋值。
 */
export type WorktreeHeldBranchWhere =
  | { combinator: 'and'; rules: [{ field: 'activated'; operator: '='; value: true }] }
  | { combinator: 'and'; rules: [{ field: 'activeKey'; operator: '='; value: string }] };

/** 实体身份：命名空间 + 实体名。不用表名——两个命名空间下可以有同表名的实体。 */
const identityOf = (metadata: EntityMetadata): string => `${metadata.namespace}\u0000${metadata.name}`;

/**
 * 一套业务表。
 *
 * @remarks
 * - **主表集**（{@link WorktreeTableSet.MAIN}）就是现有业务表：没有后缀，也没有「副本」一说，
 *   {@link WorktreeTableSet.has} 对谁都答否，解析器据此给出与引入检出位之前逐字相同的物理名。
 * - **可写检出位的表集**（{@link WorktreeTableSet.of}）只给登记过的实体建副本：进版本化域的业务实体。
 *   其余实体（系统表、QueryCache、关掉变更日志的实体）无论挂在哪一套上都读写主表集。
 *
 * 实例只有这两种来路，构造器私有：主表集只有一个，解析器判主表集看的是 {@link WorktreeTableSet.isMain}。
 */
export class WorktreeTableSet {
  readonly #members: ReadonlySet<string>;

  /** 主检出位的那一套：现有业务表 */
  static readonly MAIN: WorktreeTableSet = new WorktreeTableSet(null, new Set());

  /** 物理名后缀；主表集为 `null` */
  readonly suffix: string | null;

  /** 是否主检出位的那一套 */
  get isMain(): boolean {
    return this.suffix === null;
  }

  /**
   * 这套表的检出位持有分支时写进 `rxdb_branch.activeKey` 的键
   *
   * @remarks
   * 主表集是主检出位：哨兵 {@link ACTIVE_BRANCH_KEY}；影子表集是 `*worktree:<后缀>*`（US-314 B1.3）。
   *
   * 由表集推出而不是另起一个 id：分支表这一行于是同时说清「谁持有」与「是哪一套表」。系统迁移跑在插件装好之前，
   * 不靠插件的检出位登记表也能找回每一套表该挂哪条分支；也没有第二份登记会与它漂移。`*` 是分支 id 的保留字符，
   * 持有键不会被认成分支名。
   */
  get holderKey(): string {
    return this.suffix === null ? ACTIVE_BRANCH_KEY : `*worktree:${this.suffix}*`;
  }

  /**
   * 这套表的检出位持有的那条分支怎么查：主表集是 `activated = true`，影子表集是 `activeKey = 持有键`
   *
   * @remarks
   * 「本实例的当前分支」就是本实例挂的那套表持有的分支（US-314 B1.4），核心与插件凡是要读当前分支的地方都用它，
   * 不再各写一份 `activated = true`。主表集照旧按 `activated` 查而不是按哨兵查：系统迁移补出 `activeKey` 之前的
   * 库也得读得到当前分支，迁移完成之后两者等价（`activated ⇔ activeKey = 哨兵`）。
   */
  get heldBranchWhere(): WorktreeHeldBranchWhere {
    return this.suffix === null ?
        { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] }
      : { combinator: 'and', rules: [{ field: 'activeKey', operator: '=', value: this.holderKey }] };
  }

  private constructor(suffix: string | null, members: ReadonlySet<string>) {
    this.suffix = suffix;
    this.#members = members;
  }

  /**
   * 可写检出位的一套表。
   *
   * @param suffix - 物理名后缀：`wt_` 加 1～12 位小写字母或数字
   * @param entities - 在这套表里有自己副本的实体
   * @returns 表集
   * @throws {@link RxDBError} 后缀不合形状时
   */
  static of(suffix: string, entities: Iterable<EntityType>): WorktreeTableSet {
    if (!SUFFIX_PATTERN.test(suffix)) {
      throw new RxDBError(`表集后缀 '${suffix}' 非法：只允许 wt_ 加 1～12 位小写字母或数字`);
    }
    const members = new Set<string>();
    for (const EntityType of entities) members.add(identityOf(getEntityMetadata(EntityType)));
    return new WorktreeTableSet(suffix, members);
  }

  /**
   * 从持有键读回影子表集的后缀。
   *
   * @param activeKey - `rxdb_branch.activeKey` 上的值
   * @returns 后缀；主检出位的哨兵、或不是 {@link WorktreeTableSet.holderKey} 形状的值返回 `null`
   */
  static suffixOfHolderKey(activeKey: string): string | null {
    return HOLDER_KEY_PATTERN.exec(activeKey)?.[1] ?? null;
  }

  /**
   * 该实体在这套表里有没有自己的副本。
   *
   * @param metadata - 实体元数据
   * @returns 有副本为 `true`；主表集恒为 `false`
   */
  has(metadata: EntityMetadata): boolean {
    return this.#members.has(identityOf(metadata));
  }
}
