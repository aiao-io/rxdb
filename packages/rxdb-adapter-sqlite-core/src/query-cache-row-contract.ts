import { PropertyType, RelationKind, type EntityMetadata } from '@aiao/rxdb';
import { isFunction } from '@aiao/utils';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/**
 * QueryCache 拉取落地时，远端行不满足本地表列契约。
 *
 * @remarks
 * 单独立一个类型而不是复用 {@link RxDBAdapterSqliteError}，是为了让调用方能把
 * **「远端给的数据不对」** 与本适配器其余的失败（连接、SQL、加密）分开处理 ——
 * 前者的修法在后端或协议实现里，重试多少次都不会变。
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
export class RxDBQueryCacheRowContractError extends RxDBAdapterSqliteError {
  constructor(message: string) {
    super(message);
    this.name = 'RxDBQueryCacheRowContractError';
    Object.setPrototypeOf(this, RxDBQueryCacheRowContractError.prototype);
  }
}

/**
 * 算出「远端行必须自带」的列：本地表上 NOT NULL 且**建表时拿不到默认值**的那些。
 *
 * @remarks
 * 判据逐条对齐 `create_table_sql.ts` 的 `create_table_column_sql` —— 那里怎么建，
 * 这里就怎么判，两处必须同改：
 *
 * - `nullable` 为真 → 建出来没有 `NOT NULL`，缺了无所谓；
 * - uuid 主键 → DDL 给了 `DEFAULT (lower(hex(randomblob(16))))`；
 * - integer 主键 → `PRIMARY KEY AUTOINCREMENT`，省略即自增；
 * - 字面量 `default` → 进 DDL 的 `DEFAULT` 子句（binary 除外，DDL 明确跳过它）；
 * - **函数 `default`** → 一个字都不进 DDL。`EntityBase.createdAt` 的
 *   `default: () => new Date()` 正是这一支：它是**仓储层**的东西，而 QueryCache 的落地
 *   是绕开仓储的裸 SQL，于是列建成 NOT NULL、远端又不带，INSERT 必然被拒。
 *
 * 关系列走 `relation.nullable` / `SET NULL` 两道豁免；字面量 `default` 只对 `MANY_TO_ONE`
 * 豁免 —— DDL 的 DEFAULT 子句只发给这一种，`ONE_TO_ONE` 的默认值一个字都不进建表语句。
 *
 * @param metadata - 实体元数据
 * @returns 属性名（或关系名）→ 物理列名；行里带其中任一个都算带齐
 */
export const requiredQueryCacheColumns = (metadata: EntityMetadata): ReadonlyMap<string, string> => {
  const required = new Map<string, string>();

  metadata.propertyMap.forEach(property => {
    if (property.nullable) return;
    // 先按 `type` 收窄再读 `primary`：`EntityPropertyMetadata` 是按类型区分的联合，
    // `primary` 只挂在其中几支上，反过来写编译不过（与 create_table_sql.ts 同一写法）。
    if ((property.type === PropertyType.uuid || property.type === PropertyType.integer) && property.primary) return;
    if (property.default !== undefined && !isFunction(property.default) && property.type !== PropertyType.binary) {
      return;
    }
    required.set(property.name, property.columnName);
  });

  for (const relation of metadata.relationMap.values()) {
    if (relation.kind !== RelationKind.ONE_TO_ONE && relation.kind !== RelationKind.MANY_TO_ONE) continue;
    // SET NULL 的外键列必须可空，DDL 因此不给它 NOT NULL
    if (relation.nullable || relation.onDelete === 'SET NULL' || relation.onUpdate === 'SET NULL') continue;
    // 字面量 `default` 只对多对一豁免：DDL 的 DEFAULT 子句嵌在 `kind === MANY_TO_ONE` 里，
    // 一对一列建出来只有 `NOT NULL`。跟着放行就是让「过了校验的行」在 INSERT 时被 SQLite 拒掉
    const relationDefault = (relation as { default?: unknown }).default;
    if (relation.kind === RelationKind.MANY_TO_ONE && relationDefault !== undefined && !isFunction(relationDefault)) {
      continue;
    }
    required.set(relation.name, relation.columnName);
  }

  return required;
};

/**
 * 外键列的**每一种**写法 → 该外键的物理列名。
 *
 * @remarks
 * 一个外键列有三种等价写法，远端发哪一种取决于远端适配器
 * （`RxDBAdapterSupabase.findByIds` 走 `select('*')`，发的是物理列名）：
 *
 * | 写法 | 例 | 出处 |
 * | --- | --- | --- |
 * | 关系名 | `team` | `relation.name` |
 * | 外键别名 | `teamId` | `metadata.foreignKeyNames`，`transformEntityToSql` 认的那一种 |
 * | 物理列名 | `team_id` | `metadata.foreignKeyColumnNames` |
 *
 * 这张表是**契约与落地路径唯一的共同口径**：契约用它判「这一列带没带」
 * （{@link assertQueryCacheRowContract}），落地路径用它把键名翻译成物理列
 * （`RxDBAdapterSqliteBase` 的 `query_cache_column_names`）。共用一张表而不是各写一份
 * 判断，两侧才不会分叉 —— 分叉的两种方向都坏：契约窄一格会把**原本能落的行**拒掉，
 * 落地窄一格会让契约放行的行被静默滤成「未知列」（值不落地、SQL 不报错）。
 *
 * 三个数组按下标一一对应，由 `metadata-transition` 保证（缺 `columnName` 在那边就抛了），
 * 因此这里不再靠字符串拼接把「别名 = 关系名 + Id」这条约定重推一遍 ——
 * 约定改了只该改 `metadata-transition` 一个地方。
 *
 * US-024 在 PGlite 侧发现这条，两个后端同改：同一行在两个本地后端必须得到同一个结论。
 *
 * @param metadata - 实体元数据
 * @returns 写法 → 物理列名；无外键关系时为空表
 */
export const queryCacheForeignKeyColumns = (metadata: EntityMetadata): ReadonlyMap<string, string> => {
  const columns = new Map<string, string>();
  metadata.foreignKeyRelations.forEach((relation, index) => {
    const column = metadata.foreignKeyColumnNames[index];
    columns.set(relation.name, column);
    columns.set(metadata.foreignKeyNames[index], column);
    columns.set(column, column);
  });
  return columns;
};

/**
 * 一行的键各自落进哪个物理外键列：物理列名 → 本行用的那个键。
 *
 * @remarks
 * 返回的是**键**而不只是「占了没占」：契约还要顺着这个键回去读值 ——
 * 带了 `ownerId: null` 与根本没带 `ownerId`，在 NOT NULL 列上是同一个结局
 * （见 {@link classifyRequiredColumns}）。
 */
const foreignKeyColumnsInRow = (
  keys: Iterable<string>,
  spellings: ReadonlyMap<string, string>
): ReadonlyMap<string, string> => {
  const claimed = new Map<string, string>();
  for (const key of keys) {
    const column = spellings.get(key);
    if (column !== undefined) claimed.set(column, key);
  }
  return claimed;
};

/**
 * 这一行用哪个键给了这个必填列；三种写法一个都没有时为 `undefined`。
 *
 * @param keys - 行的键集
 * @param claims - 物理外键列 → 本行用的键（{@link foreignKeyColumnsInRow}）
 * @param name - 属性名或关系名
 * @param column - 该列的物理列名
 */
const presentKeyOf = (
  keys: ReadonlySet<string>,
  claims: ReadonlyMap<string, string>,
  name: string,
  column: string
): string | undefined => {
  if (keys.has(name)) return name;
  if (keys.has(column)) return column;
  return claims.get(column);
};

/** 一行在必填列上的两种不合格形态。 */
interface RequiredColumnFaults {
  /** 三种写法一个都没带 */
  missing: string[];
  /** 带了键，但值是 `null` / `undefined` */
  empty: string[];
}

/**
 * 逐个必填列判「这一行能不能把一个非空值送进这一列」。
 *
 * @remarks
 * 判**值**而不只是判键在不在：`{ createdAt: null }` 与 `{ createdAt: undefined }` 都会
 * 带着键通过「有没有这一列」的检查，再被 SQLite 以
 * `NOT NULL constraint failed: public$recipes.createdAt` 拒掉 —— 正是本契约存在的
 * 那条错误。`#writeQueryCacheRows` 把两种一视同仁地绑成 NULL，因此两种都在这里拦。
 *
 * 也**不**把 `null` 换成本地默认值（铁律「无 fallback 兜底」）：理由与缺列时一致。
 *
 * @param row - 远端行
 * @param keys - 行的键集（调用方已算过，不重复构造）
 * @param required - 必填列表（{@link requiredQueryCacheColumns}）
 * @param claims - 物理外键列 → 本行用的键（{@link foreignKeyColumnsInRow}）
 */
const classifyRequiredColumns = (
  row: object,
  keys: ReadonlySet<string>,
  required: ReadonlyMap<string, string>,
  claims: ReadonlyMap<string, string>
): RequiredColumnFaults => {
  const record = row as Record<string, unknown>;
  const missing: string[] = [];
  const empty: string[] = [];
  for (const [name, column] of required) {
    const key = presentKeyOf(keys, claims, name, column);
    if (key === undefined) missing.push(name);
    else if (record[key] === null || record[key] === undefined) empty.push(name);
  }
  return { missing, empty };
};

/**
 * 按契约读出一行的主键值。
 *
 * @remarks
 * 契约对**每一个**必填列都放行两种键（见 {@link assertQueryCacheRowContract} 里
 * `!keys.has(name) && !keys.has(column)` 那一行）：远端既可能发 JS 属性名 `id`，
 * 也可能发物理列名 `todo_id`。因此凡是要从远端行上取值的地方都必须走这里，
 * 只认 `row['id']` 的写法在自定义主键列下静默拿到 `undefined`。
 *
 * 不做「两个都没有就抛错」：调用方已经先过了 {@link assertQueryCacheRowContract}，
 * 在这里再判一次等于把同一条判据写两遍，且两处措辞迟早会漂。
 *
 * @param row - 远端行
 * @param idColumn - 主键的物理列名（`#resolveQueryCacheTarget` 解析）
 * @returns 行上的主键值；两种键都没有时为 `undefined`
 */
export const readQueryCacheRowId = (row: object, idColumn: string): unknown => {
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
  /** 一个写法都没带的非空列 */
  missingRequired: string[];
  /** 带了键但值为 `null` / `undefined` 的非空列 */
  emptyRequired: string[];
  /** 同批其他行带了、本行没有的键 */
  missingBatch: string[];
}

/**
 * 落地前校验远端行的列集，不合契约就 fail-fast。
 *
 * @remarks
 * 三条判据，成因不同、修法也不同，因此消息里分开写：
 *
 * 1. **缺非空列** —— 本地表建成 NOT NULL 且无 SQL 默认值，写下去必被 SQLite 拒。
 *    今天的表现是一条 `NOT NULL constraint failed: public$recipes.createdAt`：表名是加了
 *    命名空间前缀的**本地**表名、列名在**远端**的 schema 里根本不存在、调用栈落在适配器内部
 *    而不是那次 `find()` —— 三重误导，读者第一反应是「本地表建错了」。
 * 2. **非空列带了键但值是空** —— `{ createdAt: null }` 会带着键通过第 1 条，再被数据库以
 *    **同一条** NOT NULL 报错拒掉。远端那一列可空、或 `select` 带了没命中的 join 时，
 *    `select('*')` 返回的正是这个形状，不是理论形态。修法与第 1 条不同（要去查远端为什么
 *    这一列是 null），因此单列一栏。
 * 3. **批内异构** —— `upsertMany` 的列清单取自 `data[0]`，后续行按同一批键取值。缺哪个键
 *    就绑 `undefined`，落到 SQLite 上是 NULL：可空列会被**静默清空**，连报错都没有。
 *
 * 判在落地前，而不是捕获 SQLite 错误再翻译：翻译要匹配驱动的字符串，而
 * wa-sqlite / sqlite-wasm / node:sqlite 的措辞各不相同，那是一张要跟着驱动版本一起维护的
 * 正则表。按元数据算出「必须有哪些列」再比对，与驱动无关。
 *
 * 也**不**给缺列补本地默认值：补出来的 `createdAt` 是本机拉取的时刻而非记录创建的时刻，
 * 不同设备拉同一行会得到不同的值，且这个污染要到跨设备对比时才暴露。
 *
 * @param entityName - `QueryCacheRepository` 传入的逻辑实体名，原样进错误消息
 * @param rows - 待落地的远端行
 * @param metadata - 实体元数据；查不到时跳过前两条判据（本地表的非空列集无从算起），第 3 条照旧
 * @throws {RxDBQueryCacheRowContractError} 存在不满足契约的行
 */
export const assertQueryCacheRowContract = (
  entityName: string,
  rows: readonly object[],
  metadata: EntityMetadata | undefined
): void => {
  if (rows.length === 0) return;

  const required = metadata ? requiredQueryCacheColumns(metadata) : new Map<string, string>();
  const idColumn = metadata?.propertyMap.get('id')?.columnName ?? 'id';
  const spellings = metadata ? queryCacheForeignKeyColumns(metadata) : new Map<string, string>();
  const rowKeys = rows.map(row => new Set(Object.keys(row)));
  const batchKeys = new Set<string>(rowKeys.flatMap(keys => [...keys]));

  const violations: RowViolation[] = [];
  rowKeys.forEach((keys, index) => {
    // 每个必填列都放行 JS 属性名与物理列名两种键；外键列再多认一种别名 `teamId`，
    // 三种写法共用 {@link queryCacheForeignKeyColumns} 这张表 —— 与落地路径翻译列名时
    // 用的是同一张。契约窄一格就会拒掉原本能落的行。
    const claims = foreignKeyColumnsInRow(keys, spellings);
    const { missing, empty } = classifyRequiredColumns(rows[index], keys, required, claims);
    // 已经按「缺非空列」报过的，不在异构那一栏里重复出现
    const missingBatch = [...batchKeys].filter(
      key => !keys.has(key) && !missing.some(name => name === key || required.get(name) === key)
    );
    if (missing.length === 0 && empty.length === 0 && missingBatch.length === 0) return;
    // 走 readQueryCacheRowId：只认 `row['id']` 的话，自定义主键列的行在错误消息里一律报「无 id」，
    // 而这条消息的全部用处就是让人拿 id 去远端日志里对号入座
    violations.push({
      index,
      id: readQueryCacheRowId(rows[index], idColumn),
      missingRequired: missing,
      emptyRequired: empty,
      missingBatch
    });
  });

  if (violations.length === 0) return;
  throw new RxDBQueryCacheRowContractError(buildMessage(entityName, rows.length, violations));
};

/**
 * 拼一行的诊断。
 *
 * @remarks
 * 「没带这一列」与「带了但值是空」分两栏写：前者的修法是让远端把列发出来，
 * 后者的修法是去查远端为什么这一列是 null（列在远端可空、或 join 没命中），
 * 合成一句「缺 X」会把后者引到错误的方向上。措辞与 pglite 侧逐字对齐。
 */
const describeRow = (violation: RowViolation): string => {
  const reasons: string[] = [];
  if (violation.missingRequired.length > 0) {
    reasons.push(`缺 ${violation.missingRequired.join(' / ')} —— 本地表把它建成 NOT NULL 且无 SQL 默认值`);
  }
  if (violation.emptyRequired.length > 0) {
    reasons.push(
      `${violation.emptyRequired.join(' / ')} 的值为空 —— 本地表把它建成 NOT NULL 且无 SQL 默认值，带了键也落不进去`
    );
  }
  if (violation.missingBatch.length > 0) {
    reasons.push(`缺 ${violation.missingBatch.join(' / ')} —— 同批其他行带了这个键，本行会被绑成 undefined 写成 NULL`);
  }
  const id = violation.id === undefined ? '无 id' : `id=${JSON.stringify(String(violation.id))}`;
  return `  · 第 ${violation.index + 1} 行（${id}）${reasons.join('；')}`;
};

const buildMessage = (entityName: string, total: number, violations: readonly RowViolation[]): string => {
  const listed = violations.slice(0, MAX_LISTED_ROWS).map(describeRow);
  const omitted = violations.length - listed.length;
  const tail = omitted > 0 ? [`  · 另有 ${omitted} 行同样不合契约，未逐行列出`] : [];

  return [
    `QueryCache 落地被拒：实体 "${entityName}" 的远端行不满足本地表的列契约，` +
      `本批 ${total} 行中 ${violations.length} 行不合格，**一行都没有落地**。`,
    ...listed,
    ...tail,
    `远端行必须带齐本地表的全部非空列并给出非空值，含 EntityBase 的 createdAt / updatedAt。`,
    `实体上的 default 只在仓储写入路径生效，QueryCache 的落地是绕开仓储的裸 SQL，不经过它；` +
      `这里也不会就地补一个 —— 补出来的是本机拉取的时刻而非记录创建的时刻，跨设备拉同一行会得到不同的值。`,
    `契约与示例见 website/docs/collaboration/sync.md 的 QueryCache 一节。`
  ].join('\n');
};
