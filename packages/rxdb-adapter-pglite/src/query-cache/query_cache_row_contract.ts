/**
 * @fileoverview PGlite 侧 QueryCache 远端行的列契约（US-024）。
 *
 * @remarks
 * 与 `@aiao/rxdb-adapter-sqlite-core` 的同名模块是**同一条契约语义、两份判据**。
 *
 * 判据不共享不是偷懒：它算的是「**本后端的建表 DDL** 会把哪些列建成 NOT NULL 且
 * 拿不到默认值」，而两个后端的 DDL 在两处确有分歧 ——
 *
 * | 情形 | sqlite-core | PGlite |
 * | --- | --- | --- |
 * | uuid 主键 | `DEFAULT (lower(hex(randomblob(16))))` | **无任何默认值** |
 * | `SET NULL` 的非空外键列 | `mustBeNullable` → 不发 NOT NULL | 只看 `relation.nullable` → 照发 NOT NULL |
 *
 * 照抄 sqlite 那份判据，这两种行会「过了校验」再被 PostgreSQL 拒掉，等于把诊断
 * 又推回驱动错误里 —— 正是本契约要消灭的东西。US-022 的技术笔记已裁过同一条：
 * 判据要按 PostgreSQL 的 DDL 规则重写而非照抄。
 *
 * 共享的是**契约语义与消息骨架**，由 `@aiao/rxdb-test/query-cache-contract` 的
 * 跨后端套件钉死；两条分歧各自在本包的用例里锁。
 */
import { PropertyType, RelationKind, type EntityMetadata, type EntityPropertyMetadata } from '@aiao/rxdb';
import { isFunction } from '@aiao/utils';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';

/**
 * QueryCache 拉取落地时，远端行不满足本地表列契约。
 *
 * @remarks
 * 单独立一个类型而不是复用 {@link RxdbAdapterPGliteError}，是为了让调用方能把
 * **「远端给的数据不对」** 与本适配器其余的失败（连接、SQL、加密）分开处理 ——
 * 前者的修法在后端或协议实现里，重试多少次都不会变。
 *
 * `name` 与 sqlite-core 侧的同名错误**逐字相同**。两个包各有自己的类：pglite 不依赖
 * sqlite-core，而把类挪进 `@aiao/rxdb` 会改掉 sqlite-core 已发布导出的基类，现有
 * `catch (e instanceof RxDBAdapterSqliteError)` 会漏掉它。跨后端识别因此靠 `name`。
 *
 * @example
 * ```ts
 * try {
 *   await firstValueFrom(adapter.upsertMany('Recipe', rows));
 * } catch (error) {
 *   if (error instanceof RxDBQueryCacheRowContractError) reportToBackendTeam(error.message);
 * }
 * ```
 */
export class RxDBQueryCacheRowContractError extends RxdbAdapterPGliteError {
  constructor(message: string) {
    super(message);
    this.name = 'RxDBQueryCacheRowContractError';
    Object.setPrototypeOf(this, RxDBQueryCacheRowContractError.prototype);
  }
}

/**
 * 判断字面量 `default` 是否真能在 PG 的建表语句里顶掉 NOT NULL。
 *
 * @remarks
 * 逐条对齐 `table/create_table_sql.ts` 的 `getPropertyDefaultSql`：
 *
 * - **函数型** `default` 返回 `undefined`，一个字都不进 DDL。`EntityBase.createdAt` 的
 *   `default: () => new Date()` 正是这一支 —— 它是**仓储层**的东西，而 QueryCache 的
 *   落地是绕开仓储的裸 SQL，于是列建成 NOT NULL、远端又不带，INSERT 必然被拒。
 * - **`binary`** 同样返回 `undefined`：DDL 对这一类明确跳过默认值。
 * - **`null`** 会被 `transformValueJsToPGlite` 原样带出，DDL 发的是 `DEFAULT NULL` ——
 *   那在 NOT NULL 列上顶不了任何事，跟着放行就是让行在 INSERT 时才被拒。
 *   （sqlite-core 侧今天在这一支上仍是放行的，属 US-022 判据里带过来的对称缺陷，
 *   与本故事的不对称主题无关，不在这里顺手改另一个包。）
 *
 * @param defaultValue - 属性或关系上声明的 `default`
 * @param type - 属性类型；关系列按 `uuid` 传入（DDL 对关系列不做 binary 判定）。
 *   取 `EntityPropertyMetadata['type']` 而不是 `PropertyType`：属性元数据的 `type`
 *   是「枚举成员 | 同名字符串字面量」的联合（`@Entity` 里两种写法都合法），
 *   收成枚举编译不过。
 * @returns 该默认值能否进 DDL 的 `DEFAULT` 子句
 */
const hasUsableDefault = (defaultValue: unknown, type: EntityPropertyMetadata['type']): boolean =>
  defaultValue !== undefined && defaultValue !== null && !isFunction(defaultValue) && type !== PropertyType.binary;

/**
 * 算出「远端行必须自带」的列：本地表上 NOT NULL 且**建表时拿不到默认值**的那些。
 *
 * @remarks
 * 判据逐条对齐 `table/create_table_sql.ts` 的 `_create_table_column_sql` 与
 * `_create_table_relations_sql` —— 那里怎么建，这里就怎么判，**两处必须同改**。
 *
 * 属性列：
 *
 * - `nullable` 为真 → 建出来没有 `NOT NULL`，缺了无所谓；
 * - **`integer` 主键** → `serial PRIMARY KEY`，`serial` 隐含 `nextval()`，省略即自增；
 * - **其余主键（`uuid` / `string` / `bigint`）仍是必填**：PG 侧的 DDL 只发
 *   `"id" uuid PRIMARY KEY`，不像 sqlite 那样补 `DEFAULT (lower(hex(randomblob(16))))`；
 *   照 sqlite 豁免会让缺 id 的行走到 PostgreSQL 才报错。**这是两个后端的第一处分歧。**
 * - 字面量 `default` → 进 DDL 的 `DEFAULT` 子句（三条例外见 {@link hasUsableDefault}）。
 *
 * 关系列（只有 `ONE_TO_ONE` / `MANY_TO_ONE` 才占一个物理列）：
 *
 * - `relation.nullable` → DDL 不发 `NOT NULL`，豁免；
 * - **`SET NULL` 不豁免**：`_create_table_relations_sql` 只看 `relation.nullable`，
 *   非空关系列即使带 `ON DELETE SET NULL` 也照发 `NOT NULL`（sqlite 侧有 `mustBeNullable`
 *   把它降级为可空）。**这是两个后端的第二处分歧。**
 * - 字面量 `default` 只对 `MANY_TO_ONE` 豁免 —— DDL 的 `DEFAULT` 子句嵌在
 *   `kind === MANY_TO_ONE` 里，`ONE_TO_ONE` 的默认值一个字都不进建表语句。
 *
 * @param metadata - 实体元数据
 * @returns 属性名（或关系名）→ 物理列名；行里带其中任一个都算带齐
 */
export const requiredQueryCacheColumns = (metadata: EntityMetadata): ReadonlyMap<string, string> => {
  const required = new Map<string, string>();

  metadata.propertyMap?.forEach(property => {
    if (property.nullable) return;
    // 先按 `type` 收窄再读 `primary`：`EntityPropertyMetadata` 是按类型区分的联合，
    // `primary` 只挂在其中几支上，反过来写编译不过（与 create_table_sql.ts 同一写法）。
    if (property.type === PropertyType.integer && property.primary) return;
    if (hasUsableDefault(property.default, property.type)) return;
    required.set(property.name, property.columnName);
  });

  // `relationMap?` 与同目录 `resolveQueryCacheTarget` 的 `propertyMap?` 同口径：
  // 这条路径也会收到只带部分字段的 metadata 替身。
  for (const relation of metadata.relationMap?.values() ?? []) {
    if (relation.kind !== RelationKind.ONE_TO_ONE && relation.kind !== RelationKind.MANY_TO_ONE) continue;
    if (relation.nullable) continue;
    const relationDefault = (relation as { default?: unknown }).default;
    if (relation.kind === RelationKind.MANY_TO_ONE && hasUsableDefault(relationDefault, PropertyType.uuid)) continue;
    required.set(relation.name, relation.columnName);
  }

  return required;
};

/**
 * 关系名 → 外键别名（`team` → `teamId`）。
 *
 * @remarks
 * 落地路径对关系列接受**三种**写法：关系名 `team`、物理列名 `team_id`，以及
 * `metadata.foreignKeyNames` 里的 `teamId`（`transformEntityValueToSql` 与
 * `assertKnownKeys` 都认它）。契约只认前两种的话，一行带 `teamId` 的远端行会被判成
 * 「缺 team」—— 而它原本能一字不差地落进 `team_id`，这是把能落的行拒掉，
 * 比不判还糟。
 *
 * @param metadata - 实体元数据
 * @returns 关系名 → 外键别名；无关系时为空表
 */
const queryCacheRelationAliases = (metadata: EntityMetadata): ReadonlyMap<string, string> => {
  const aliases = new Map<string, string>();
  for (const relation of metadata.relationMap?.values() ?? []) {
    aliases.set(relation.name, `${relation.name}Id`);
  }
  return aliases;
};

/** 行上是否带了该必填列的外键别名写法。 */
const hasRelationAlias = (keys: ReadonlySet<string>, aliases: ReadonlyMap<string, string>, name: string): boolean => {
  const alias = aliases.get(name);
  return alias !== undefined && keys.has(alias);
};

/**
 * 按契约读出一行的主键值。
 *
 * @remarks
 * 契约对**每一个**必填列都放行 JS 属性名与物理列名两种键，因此取 id 也必须两种都认；
 * 只认 `row['id']` 的写法在自定义主键列下静默拿到 `undefined`，而这个值的全部用处
 * 就是让人拿它去远端日志里对号入座。
 *
 * @param row - 远端行
 * @param idColumn - 主键的物理列名
 * @returns 行上的主键值；两种键都没有时为 `undefined`
 */
const readQueryCacheRowId = (row: object, idColumn: string): unknown => {
  const record = row as Record<string, unknown>;
  return record['id'] ?? record[idColumn];
};

/** 错误消息里最多逐行列举几行；超出部分只报数量，不静默丢弃。 */
const MAX_LISTED_ROWS = 5;

interface RowViolation {
  /** 0 基下标 */
  index: number;
  /** 行自带的 id，用于在远端日志里对号入座 */
  id: unknown;
  /** 缺的非空列 */
  missingRequired: string[];
}

const describeRow = (violation: RowViolation): string => {
  const id = violation.id === undefined ? '无 id' : `id=${JSON.stringify(String(violation.id))}`;
  return (
    `  · 第 ${violation.index + 1} 行（${id}）` +
    `缺 ${violation.missingRequired.join(' / ')} —— 本地表把它建成 NOT NULL 且无 SQL 默认值`
  );
};

/**
 * 拼错误正文。
 *
 * @remarks
 * 骨架与 sqlite-core 侧的同名函数**逐字对齐**，由
 * `@aiao/rxdb-test/query-cache-contract` 的跨后端套件钉死 ——
 * 读者不该因为换了个本地行缓存后端就要重学一套诊断。
 */
const buildMessage = (entityName: string, total: number, violations: readonly RowViolation[]): string => {
  const listed = violations.slice(0, MAX_LISTED_ROWS).map(describeRow);
  const omitted = violations.length - listed.length;
  const tail = omitted > 0 ? [`  · 另有 ${omitted} 行同样不合契约，未逐行列出`] : [];

  return [
    `QueryCache 落地被拒：实体 "${entityName}" 的远端行不满足本地表的列契约，` +
      `本批 ${total} 行中 ${violations.length} 行不合格，**一行都没有落地**。`,
    ...listed,
    ...tail,
    `远端行必须带齐本地表的全部非空列，含 EntityBase 的 createdAt / updatedAt。`,
    `实体上的 default 只在仓储写入路径生效，QueryCache 的落地是绕开仓储的裸 SQL，不经过它；` +
      `这里也不会就地补一个 —— 补出来的是本机拉取的时刻而非记录创建的时刻，跨设备拉同一行会得到不同的值。`,
    `契约与示例见 website/docs/collaboration/sync.md 的 QueryCache 一节。`
  ].join('\n');
};

/**
 * 落地前校验远端行的列集，不合契约就 fail-fast。
 *
 * @remarks
 * 只判**一条**：缺了本地表上 NOT NULL 且无 SQL 默认值的列，写下去必被 PostgreSQL 拒。
 * 今天的表现是一条 `null value in column "created_at" of relation "qc_recipes" violates
 * not-null constraint`：表名是加了 schema 的**本地**表名、列名在**远端**的 schema 里根本
 * 不存在、调用栈落在适配器内部而不是那次 `find()` —— 三重误导，读者第一反应是
 * 「本地表建错了」。
 *
 * **不判**批内异构。sqlite-core 侧那条判据的成因是它的列清单取自 `data[0]`，后续行按同一批
 * 键取值、缺哪个就绑 `undefined` 写成 NULL（可空列被静默清空）。PGlite 走
 * `groupByColumnSet` 按列集分组、每组一条 INSERT，缺的键根本不出现在列清单里 ——
 * 结构上没有这个病，跟着判只会把一个已交付的能力改成报错。
 *
 * 判在落地前，而不是捕获 PostgreSQL 错误再翻译：翻译要匹配驱动的字符串，而各驱动措辞
 * 各不相同，那是一张要跟着驱动版本一起维护的正则表。按元数据算出「必须有哪些列」
 * 再比对，与驱动无关。
 *
 * 也**不**给缺列补本地默认值（铁律「无 fallback 兜底」）：补出来的 `createdAt` 是本机拉取
 * 的时刻而非记录创建的时刻，不同设备拉同一行会得到不同的值，且这个污染要到跨设备对比时
 * 才暴露。
 *
 * @param entityName - `QueryCacheRepository` 传入的逻辑实体名，原样进错误消息
 * @param rows - 待落地的远端行
 * @param metadata - 实体元数据（`resolveQueryCacheTarget` 已 fail-fast，这里必然拿得到）
 * @throws {RxDBQueryCacheRowContractError} 存在不满足契约的行
 */
export const assertQueryCacheRowContract = (
  entityName: string,
  rows: readonly object[],
  metadata: EntityMetadata
): void => {
  if (rows.length === 0) return;

  const required = requiredQueryCacheColumns(metadata);
  if (required.size === 0) return;
  const idColumn = metadata.propertyMap?.get('id')?.columnName ?? 'id';
  const aliases = queryCacheRelationAliases(metadata);

  const violations: RowViolation[] = [];
  rows.forEach((row, index) => {
    const keys = new Set(Object.keys(row));
    // 每个必填列都放行 JS 属性名与物理列名两种键：远端既可能发 `id`，也可能发 `todo_id`
    // （`RxDBAdapterSupabase.findByIds` 走 `select('*')`）；关系列再多认一种外键别名
    // （见 {@link queryCacheRelationAliases}）。三者与 `assertKnownKeys` /
    // `transformEntityValueToSql` 的识别范围完全同口径 —— 契约窄一格就会拒掉能落的行。
    const missingRequired = [...required]
      .filter(([name, column]) => !keys.has(name) && !keys.has(column) && !hasRelationAlias(keys, aliases, name))
      .map(([name]) => name);
    if (missingRequired.length === 0) return;
    violations.push({ index, id: readQueryCacheRowId(row, idColumn), missingRequired });
  });

  if (violations.length === 0) return;
  throw new RxDBQueryCacheRowContractError(buildMessage(entityName, rows.length, violations));
};
