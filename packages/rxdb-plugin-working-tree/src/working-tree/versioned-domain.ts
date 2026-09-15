/**
 * @fileoverview 版本化域（tracked / untracked）的**唯一**一份清单（spec.md「版本化域」、FR-046）。
 *
 * @remarks
 * raw 通道的 5 步判定、批量写门禁、四个捕获挂载点问的都是这一份。散成两份的代价不是不一致
 * 的编译错误，而是某个实体在一条写入口上进版本控制、在另一条上不进——而 spec.md「版本化域」
 * 第二条硬规则恰恰禁止这件事。
 *
 * **默认 tracked。** 判据是「净变化能否由 HEAD + `WorkingTreeEntry` 重放」，一个没被登记过的
 * 新实体当然能重放。反过来的默认值会让任何人新加一个实体时，它的改动悄悄不进提交——这种漏
 * 没有报错形态，只表现为「我明明改了，commit 说没有变更」。
 *
 * **untracked 只有三类**（spec.md 把「新增第四类必须先改 epic-006 该节」写成了硬规则）：
 * QueryCache 实体、簿记字段、插件登记的派生索引列。三类各自的粒度不同——第一类是**整实体**，
 * 第二类是**全域字段**，第三类是**按表登记的字段**——所以它们不能压成一个集合。
 *
 * **判定看不见来源。** 两个判定函数都只收实体名（与字段名），收不到入口、意图或 `origin`。
 * `origin='remote_sync'` 因此**不是** untracked：它是 tracked 实体的一次净变化，只是作者不是
 * 本地用户。把它当豁免最省事，代价是一次 pull 之后 HEAD 与工作树永久对不上，且不可见、不可恢复。
 */

import { RxDBMixedVersionedCacheTransactionError, SyncType } from '@aiao/rxdb';

/**
 * 第二类 untracked：实体行上的簿记字段，**全域**豁免
 *
 * @remarks
 * 豁免依据是「这个列不表达用户意图」，与实体有没有被登记无关——所以它是一个全域集合，
 * 而不是按表登记的。回填它们是对实体行的 UPDATE，但不构成业务净变化。
 *
 * **为什么没有「同步水位」那一项**：spec.md 的三元组写作「`remoteId`、同步水位、审计时间」，
 * 但本仓库里同步水位存在 `rxdb_sync`（系统表，按目标类别就已经不进版本化域），**业务实体行上
 * 没有任何水位列**。给一个不存在的列名（`syncedAt` 之类）占位不是保守而是开洞：它今天豁免不了
 * 任何东西，却在有人把这个名字用作业务字段的那一天让该字段静默退出版本控制。真出现按行水位时，
 * 在这里补一项并补一条用例即可——那时它才有可豁免的对象。
 *
 * **为什么不含 `createdBy` / `updatedBy`**：spec.md 写的是审计**时间**。审计主体是谁写的，
 * 与「写了什么」同属一次真实的净变化；把它并进来等于让「换个人改同一个值」不进提交。
 *
 * **为什么不含 `id`**：主键是行的身份不是它的簿记。豁免它意味着改主键不算变化。
 */
export const UNTRACKED_BOOKKEEPING_FIELDS: readonly string[] = ['remoteId', 'createdAt', 'updatedAt'];

/** {@link UNTRACKED_BOOKKEEPING_FIELDS} 的查表形态，避免每次判定都线性扫一遍。 */
const BOOKKEEPING_FIELD_SET: ReadonlySet<string> = new Set(UNTRACKED_BOOKKEEPING_FIELDS);

/**
 * 实体在版本化域中的归类
 *
 * @remarks
 * 只有两个取值，因为「部分 tracked」表达不了：一个实体要么它的净变化能被重放，要么不能。
 * 字段粒度的豁免由 {@link VersionedDomain.isUntrackedField} 负责，不在这一层。
 */
export type VersionedEntityClass = 'tracked' | 'untracked';

/**
 * 构造版本化域所需的单个实体登记
 *
 * @remarks
 * 四个必填项分别对应判定的三个平面：`entityName` 是调用方在实体层问的名字，`namespace` 与
 * `tableName` 合起来是 raw 判定在 SQL 里看到的名字，`syncType` 决定第一类 untracked。
 * 少任何一个都会逼下游自己去元数据里再查一次，而那正是「第二份清单」的开始。
 */
export interface VersionedDomainEntityInput {
  /** 实体名（`@Entity({ name })`），大小写敏感 */
  readonly entityName: string;

  /**
   * 该实体的命名空间（`@Entity({ namespace })`）
   *
   * @remarks
   * 必填而不是省略时当 `'public'`：这一项决定 SQLite 家族上那个物理表名
   * （`public$post`）登不登记得上，而漏登记的后果是**静默放行**。留个默认值的话，
   * 下一个忘了传的调用方会拿到一个看起来正常、实际只保护 1/6 后端的域。
   */
  readonly namespace: string;

  /** 该实体的逻辑表名（`@Entity({ tableName })`）；构造时统一归一化成小写 */
  readonly tableName: string;

  /** 该实体的同步策略；{@link SyncType.QueryCache} 即第一类 untracked */
  readonly syncType: SyncType;

  /**
   * 插件在**这张业务表上**静态声明的派生索引列（第三类 untracked）
   *
   * @remarks
   * 按表登记而不是并进全域集合：压成一个集合会让登记在 A 表上的列名在 B 表上一并豁免，
   * 而这个集合是插件可以往里写东西的。
   */
  readonly derivedIndexColumns?: readonly string[];
}

/**
 * 版本化域在**表 / 列**平面上的投影，也就是 raw 写判定消费的那个端口
 *
 * @remarks
 * 成员刻意只有两个：raw 判定拿到的是一条 SQL，它认得的只有表名和列名，不认得实体名，
 * 更不认得「QueryCache」这个概念——它只看表在不在集合里。端口开宽了，判定就会开始按实体
 * 语义分支，于是同一件事在实体平面与表平面各有一套判据。
 */
export interface VersionedDomainView {
  /**
   * 全部 tracked 实体的**可寻址表名**集合，小写、无引号、无点号 schema 限定
   *
   * @remarks
   * 放实体名的话，`UPDATE post` 永远命不中 `Post`，整条 raw 防线静默失效。
   *
   * 每张表登记**两个**名字：逻辑表名（`post`）与 SQLite 家族的物理表名（`public$post`）。
   * 两个都要，因为 6 个 v1 后端分两种物理形态——PGlite 有真 schema，表引用是
   * `"public"."post"`，判定切掉点号限定之后回到 `post`；另外 5 个 SQLite 家族后端**没有**
   * schema，命名空间被折进名字本身，而那是它们**唯一**能用的表名。只登记逻辑名的话，
   * raw 门禁在 5/6 的后端上整条失效：用户用后端唯一可用的表名就能把版本化业务表写穿，
   * 捕获链一无所知，冷重放从此对不上。
   *
   * 登记别名而不是让判定按 `$` 切一刀：`_fts_public$post`（rxdb-plugin-search 的影子表，
   * spec.md 明列的域外目标）切完正好等于 `post`，于是一条本该放行的写开始报错。
   * 判定那一侧继续只做集合成员判定，多一种物理形态就在**这里**多登记一个名字。
   */
  readonly versionedTables: ReadonlySet<string>;

  /**
   * 取某张表上不构成业务净变化的列集合
   *
   * @param table - 表名；大小写不敏感
   * @returns 该表的全域簿记字段 ∪ 它自己登记的派生索引列
   */
  untrackedFieldsOf(table: string): ReadonlySet<string>;
}

/**
 * 一个事务单元内的 tracked / untracked 混用守卫
 *
 * @remarks
 * **流式的，不预知未来**：第 5 次操作才暴露混用就在第 5 次抛，前 4 次正常返回。
 * 要求守卫提前知道后面会写缓存实体，就等于要求调用方预先声明整个事务的操作集——
 * spec.md 场景 7 明确排除了这个前提。
 */
export interface VersionedTransactionGuard {
  /**
   * 登记本事务内的一次实体操作
   *
   * @param entityName - 被操作实体的名字
   * @throws {@link MixedVersionedCacheTransactionError} 本次登记使事务同时含 tracked 与 untracked 时
   */
  record(entityName: string): void;
}

/**
 * 版本化域的完整视图：表 / 列平面（继承自 {@link VersionedDomainView}）加上实体平面
 *
 * @remarks
 * 继承而不是并列两个接口：两者形状分叉时，把 {@link VersionedDomain} 当
 * {@link VersionedDomainView} 传的那一行先编译失败，而不是等到有人在 raw 判定那边照抄出第二份清单。
 */
export interface VersionedDomain extends VersionedDomainView {
  /**
   * 这个实体进不进版本控制
   *
   * @param entityName - 实体名
   * @returns 登记为 {@link SyncType.QueryCache} 时为 `'untracked'`，其余一律 `'tracked'`
   *
   * @remarks
   * 未登记的实体是 `'tracked'`——这是「没有第四类」的落地形态。
   */
  classifyEntity(entityName: string): VersionedEntityClass;

  /**
   * 这个字段的变化构不构成业务净变化
   *
   * @param entityName - 实体名
   * @param field - 实体属性名
   * @returns 命中三类 untracked 中任意一类时为 `true`
   */
  isUntrackedField(entityName: string, field: string): boolean;

  /**
   * 开一个事务级的混用守卫
   *
   * @returns 与其他守卫互不影响的新实例
   *
   * @remarks
   * 每次调用都给新实例：守卫持有的是**某一个事务**的已见类别，共享一个实例会让一个事务的
   * 混用污染下一个。
   */
  createTransactionGuard(): VersionedTransactionGuard;
}

/**
 * tracked 与 untracked 实体混进了同一个事务单元
 *
 * @remarks
 * 继承既有的 {@link RxDBMixedVersionedCacheTransactionError} 而不是另起一个类：spec.md 指定
 * 承载者就是它，既有的 `catch` 分支与 `instanceof` 判断因此继续命中，`cacheEntities` /
 * `versionedEntities` 两个数组照常可读。这里加的是**流式守卫才知道的东西**——撞上的是哪两个
 * 实体。父类的数组形态服务于「整批扫一遍再报」的批量路径，那条路径上没有「第几次操作撞的」
 * 这个概念。
 *
 * 抛出即回滚整个事务：两者写语义不可调和（版本化实体写本地并进 changelog，QueryCache 实体
 * 先写远端再落可丢弃缓存），同批只会得到「一半进了变更历史、一半没有」。回滚由适配器保证
 * （throw ⇒ rollback），不由本类负责。
 */
export class MixedVersionedCacheTransactionError extends RxDBMixedVersionedCacheTransactionError {
  constructor(
    /** 本事务内先后撞上的 tracked 实体名 */
    readonly trackedEntityName: string,
    /** 本事务内先后撞上的 untracked 实体名 */
    readonly untrackedEntityName: string
  ) {
    super([untrackedEntityName], [trackedEntityName]);
    this.name = 'MixedVersionedCacheTransactionError';
    Object.setPrototypeOf(this, MixedVersionedCacheTransactionError.prototype);
  }
}

/** 归一化表名：raw 判定对**语句**做词法归一，域这边只负责让自己的拼写唯一。 */
const normalizeTable = (table: string): string => table.toLowerCase();

/**
 * SQLite 家族把命名空间折进表名时的分隔符（`get_table_name()`，rxdb-adapter-sqlite-core）
 *
 * @remarks
 * 它不出现在任何**逻辑**表名里（逻辑表名来自 `@Entity({ tableName })`），所以拿它拼出来的
 * 别名不会和别的逻辑表撞名。
 */
const NAMESPACE_SEPARATOR = '$';

/**
 * 一张表在 SQL 里可能被写成的全部名字（已归一化、已去点号限定）
 *
 * @param namespace - 实体命名空间
 * @param tableName - 逻辑表名
 * @returns 逻辑名与 SQLite 家族物理名
 *
 * @remarks
 * PGlite 的 `"public"."post"` 不在这里登记：它带点号，raw 判定的 schema 限定剥离已经把它
 * 还原成逻辑名了。这里补的是**剥不掉**的那一种。
 */
function addressableTableNames(namespace: string, tableName: string): readonly string[] {
  const logical = normalizeTable(tableName);
  return [logical, `${normalizeTable(namespace)}${NAMESPACE_SEPARATOR}${logical}`];
}

/** 构造期算好的每实体信息，三个判定函数共用，避免在判定里重复查两张表。 */
interface EntityRecord {
  readonly entityClass: VersionedEntityClass;
  readonly tableNames: readonly string[];
  readonly derivedIndexColumns: ReadonlySet<string>;
}

/** 把一条登记折成 {@link EntityRecord}。 */
function toEntityRecord(input: VersionedDomainEntityInput): EntityRecord {
  return {
    entityClass: input.syncType === SyncType.QueryCache ? 'untracked' : 'tracked',
    tableNames: addressableTableNames(input.namespace, input.tableName),
    derivedIndexColumns: new Set(input.derivedIndexColumns ?? [])
  };
}

/**
 * 按表聚合派生索引列：同一张表可能由多条登记（或多个插件）各加一批。
 *
 * @remarks
 * 逐个别名都建一份索引，否则列级豁免只在逻辑表名上成立——SQLite 家族上一条只改审计时间的
 * 簿记写会被第 4 步拦成 `commit_capability_mismatch`，而那是在**拦错了人**。
 */
function collectDerivedColumnsByTable(records: ReadonlyMap<string, EntityRecord>): ReadonlyMap<string, Set<string>> {
  const byTable = new Map<string, Set<string>>();
  for (const record of records.values()) {
    for (const tableName of record.tableNames) {
      const columns = byTable.get(tableName) ?? new Set<string>();
      for (const column of record.derivedIndexColumns) columns.add(column);
      byTable.set(tableName, columns);
    }
  }
  return byTable;
}

/**
 * 从实体登记算出版本化域
 *
 * @param entities - 全部已登记实体；**不会被修改**
 * @returns 一份与输入顺序无关、可重复构造出逐项相等结果的域视图
 *
 * @remarks
 * 纯函数：同一份输入构造两次，两份清单逐项相等，且传进来的数组与其中的对象都不被改动——
 * 下游判定拿到的是域的**视图**，域自己在构造之后也不再变。
 *
 * 表名在这里统一归一化成小写，于是「归一化」这件事在整条链上只有两处：域构造（对登记）
 * 与 raw 判定（对语句）。交给六个适配器各自归一化的话，它们只需要有一份写松，整条防线就有洞。
 *
 * 每张 tracked 表登记**两个**可寻址名字（见 {@link VersionedDomainView.versionedTables}）：
 * 逻辑名与 SQLite 家族的物理名。物理形态属于「同一张表叫什么」，归域管；让判定去猜分隔符
 * 就等于把它挪进判定，而判定那一侧没有命名空间可比对，只能按前缀猜——猜宽了误伤 FTS 影子表，
 * 猜窄了就是现在这个洞。
 *
 * @example
 * ```ts
 * const domain = buildVersionedDomain([
 *   { entityName: 'Post', namespace: 'public', tableName: 'post', syncType: SyncType.Full,
 *     derivedIndexColumns: ['title_norm'] },
 *   { entityName: 'ProductCache', namespace: 'public', tableName: 'productcache', syncType: SyncType.QueryCache }
 * ]);
 *
 * domain.classifyEntity('Post');                    // 'tracked'
 * domain.classifyEntity('ProductCache');            // 'untracked'
 * domain.isUntrackedField('Post', 'title_norm');    // true —— 登记过的派生列
 * domain.isUntrackedField('Comment', 'title_norm'); // false —— 别的表的同名列不跟着豁免
 * ```
 */
export function buildVersionedDomain(entities: readonly VersionedDomainEntityInput[]): VersionedDomain {
  const records = new Map<string, EntityRecord>(entities.map(input => [input.entityName, toEntityRecord(input)]));
  const derivedByTable = collectDerivedColumnsByTable(records);
  const versionedTables = new Set(
    [...records.values()].filter(record => record.entityClass === 'tracked').flatMap(record => record.tableNames)
  );

  const classifyEntity = (entityName: string): VersionedEntityClass =>
    records.get(entityName)?.entityClass ?? 'tracked';

  const untrackedFieldsOf = (table: string): ReadonlySet<string> =>
    new Set([...UNTRACKED_BOOKKEEPING_FIELDS, ...(derivedByTable.get(normalizeTable(table)) ?? [])]);

  const isUntrackedField = (entityName: string, field: string): boolean => {
    if (classifyEntity(entityName) === 'untracked') return true;
    if (BOOKKEEPING_FIELD_SET.has(field)) return true;
    return records.get(entityName)?.derivedIndexColumns.has(field) === true;
  };

  return {
    versionedTables,
    untrackedFieldsOf,
    classifyEntity,
    isUntrackedField,
    createTransactionGuard: () => createTransactionGuard(classifyEntity)
  };
}

/**
 * 造一个流式混用守卫
 *
 * @param classifyEntity - 域的实体归类函数
 * @returns 只记住「已见的第一个 tracked」与「已见的第一个 untracked」的守卫
 *
 * @remarks
 * 只记第一个而不是两份全集：错误要回答的是「哪两个实体撞上的」，而不是「这个事务碰过哪些
 * 实体」。攒全集意味着守卫的内存随事务长度增长，却不会让错误信息更有定位价值。
 */
function createTransactionGuard(
  classifyEntity: (entityName: string) => VersionedEntityClass
): VersionedTransactionGuard {
  let tracked: string | undefined;
  let untracked: string | undefined;

  return {
    record(entityName: string): void {
      if (classifyEntity(entityName) === 'untracked') untracked ??= entityName;
      else tracked ??= entityName;
      if (tracked !== undefined && untracked !== undefined) {
        throw new MixedVersionedCacheTransactionError(tracked, untracked);
      }
    }
  };
}
