/**
 * @fileoverview 一套业务表（US-314 可写检出位的库内影子表）。
 *
 * 可写检出位在同一个库里各有一套业务表；主检出位的那一套就是现有业务表。变更日志、分支与提交图全库只有一份，
 * 不分套。物理名怎么拼归各适配器的表名解析器（SQLite 系给表名加后缀，PGlite 换 schema），这里只给后缀与成员。
 */

import {
  FINGERPRINT_KEYS,
  fingerprintSchemaInput,
  pickSchemaFingerprintInput
} from '../backup/schema-fingerprint-encoding.js';
import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import type { EntityStorageOverride } from '../entity/storage-override.js';
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
 * 表集指纹在备份清单的键之外还看的实体级字段（US-314 B2.6）：约束与生成列决定影子表怎么建，`log` 决定实体进不进这套表。
 *
 * @remarks
 * 备份清单那份键不动：往里加键，已有备份的指纹就全对不上、恢复不了。
 *
 * 生成列取实体自己声明的 `generatedColumns` 数组（`generatedColumnMap` 是 Map，编码会丢掉）。没声明生成列的实体没有这个键，
 * 编码时丢掉，指纹与加这个键之前逐字相同，已开的检出位不会因此整套重建。备份清单的指纹不看生成列：恢复还原的是归档自带的表结构，
 * 生成列的值由引擎按归档里的定义算；与目标的声明对不上，由连接时的漂移检查拦下（用户迁移排在它之前，可以补齐）。
 */
const TABLE_SET_FINGERPRINT_KEYS = [...FINGERPRINT_KEYS, 'checks', 'exclusions', 'generatedColumns', 'log'];

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
   * 是不是表集后缀的形状（`wt_` 加 1～12 位小写字母或数字）。
   *
   * @param value - 从目录里的物理名、schema 名上截下来的那一段
   * @returns 合形状为 `true`
   *
   * @remarks
   * 适配器按目录列举现存的表集时用它认后缀（US-314 B2.6 的孤儿回收），与 {@link WorktreeTableSet.of} 同一条规则。
   */
  static isSuffix(value: string): boolean {
    return SUFFIX_PATTERN.test(value);
  }

  /**
   * 一套表的结构指纹（US-314 B2.6）：成员实体的结构，在备份清单的结构指纹之外还看约束（`checks` / `exclusions`）、生成列与 `log`，
   * 并上成员的实例级存储声明。
   *
   * @param entities - 这套表的成员
   * @param entityStorage - 实例级存储声明（`RxDBOptions.entityStorage`）；只看成员的那几条
   * @returns 64 位十六进制 SHA-256；与声明顺序无关
   *
   * @remarks
   * 可写检出位开的时候记下它（并上插件钩子的指纹，见 `RxDB.worktreeTableSetFingerprint`），挂上时不符就整套重建。
   *
   * 影子表与主表一样按实例生效的存储元数据建（`getEntityStorageMetadata`）：实例级声明的生成列、高级索引也在影子表上，
   * 只改它们同样要重建。这一项并在各成员的结构里，没有声明的成员值为 `undefined`、编码时丢掉，
   * 没有实例级存储声明时指纹与不看这一项时逐字相同，已开的检出位不会因此整套重建。
   */
  static schemaFingerprintOf(
    entities: readonly EntityType[],
    entityStorage: readonly EntityStorageOverride[] = []
  ): string {
    const declared = new Map(entityStorage.map(({ entity, ...declaration }) => [entity, declaration] as const));
    return fingerprintSchemaInput(
      pickSchemaFingerprintInput(entities, TABLE_SET_FINGERPRINT_KEYS, entity => ({
        entityStorage: declared.get(entity)
      }))
    );
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

  /**
   * 这套表上一个实体的写落在哪套表：有副本落在本套（返回后缀），没有副本落在主表集（返回 `undefined`）。
   *
   * @param metadata - 实体元数据
   * @returns 影子表集的后缀；落在主表集时为 `undefined`
   *
   * @remarks
   * 本地实体事件带上它（`tableSetSuffix`，US-314 B2.3）。变更行之外派事件的路径（切分支、撤销 / 重做、拉取回填、新建实体）
   * 按发起写的那一套表打标，与 {@link WorktreeTableSet.accepts} 判的是同一件事。
   */
  ownerSuffixOf(metadata: EntityMetadata): string | undefined {
    return this.has(metadata) ? (this.suffix ?? undefined) : undefined;
  }

  /**
   * 挂着这套表的实例收不收一条实体事件：事件那一行所在的表，是不是这套表上这个实体读的那张。
   *
   * @param metadata - 事件里实体的元数据；查不到元数据（不认得的实体）照收
   * @param eventSuffix - 事件的 `tableSetSuffix`：写落在哪套影子表上，缺省是主表集
   * @returns 收为 `true`
   *
   * @remarks
   * 没有副本的实体（系统表、QueryCache、关了变更日志的）无论挂哪套都读主表集，主表集上它们的事件对谁都照收；
   * 有副本的实体只收自己这套表上的。主检出位上的几个标签页按表集判、不按分支判：一个标签页切了分支，
   * 另一个标签页挂的还是同一套主表、读到的也是新分支的数据，按分支过滤会把这批事件挡在外面。
   */
  accepts(metadata: EntityMetadata | undefined, eventSuffix: string | undefined): boolean {
    if (!metadata) return true;
    return this.ownerSuffixOf(metadata) === eventSuffix;
  }

  /**
   * 这套表上一个实体的事件要带的表集标记，展开进事件数据：写落在影子表上带 `tableSetSuffix`，落在主表集什么都不带。
   *
   * @param metadata - 实体元数据
   * @returns `{ tableSetSuffix }` 或空对象
   *
   * @remarks
   * 落在主表集时不带一个值为 `undefined` 的键：没有检出位的库，事件形状与从前逐字相同。
   */
  eventTagOf(metadata: EntityMetadata): { readonly tableSetSuffix?: string } {
    const suffix = this.ownerSuffixOf(metadata);
    return suffix === undefined ? {} : { tableSetSuffix: suffix };
  }
}

/**
 * 要写的实体不是在本实例此刻挂的那套表上建出、读出的，写被拒（US-314 B2.4）。
 *
 * @remarks
 * 换挂（`mountWorktreeTableSet`）清掉了实体身份缓存，可调用方手里还可能攥着换挂之前的实体对象（表单、草稿缓存）。
 * 照存的话它会写进另一套表：主检出位上新建的实体存进检出位的影子表，主表上读出的行拿主表上的值改影子表里同 id 的那一行。
 * 在挂着的那套表上重新读出来（或重新建）再存；挂回建出它的那套表也能存。
 */
export class WorktreeTableSetMismatchError extends RxDBError {
  /** 稳定错误码，恒为 `'worktree_table_set_mismatch'` */
  readonly code = 'worktree_table_set_mismatch';

  constructor(
    /** 实体，`<namespace>.<name>` */
    readonly entity: string,
    /** 这个实体的写当初落在哪套表：影子表集的后缀，主表集为 `null` */
    readonly entityTableSet: string | null,
    /** 本实例此刻挂的那套表上它的写落在哪套表：影子表集的后缀，主表集为 `null` */
    readonly mountedTableSet: string | null
  ) {
    super(
      `Entity ${entity} was created or read on table set ${entityTableSet ?? 'main'}, but this instance is mounted on ` +
        `${mountedTableSet ?? 'main'}; read it again on the mounted worktree before writing it.`
    );
    this.name = 'WorktreeTableSetMismatchError';
    Object.setPrototypeOf(this, WorktreeTableSetMismatchError.prototype);
  }
}
