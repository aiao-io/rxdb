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
 * 关系列同理走 `relation.nullable` / `SET NULL` / 字面量 `default` 三道豁免。
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
    if ((property.type === PropertyType.uuid || property.type === PropertyType.integer) && property.primary) return;
    if (property.default !== undefined && !isFunction(property.default) && property.type !== PropertyType.binary) {
      return;
    }
    required.set(property.name, property.columnName);
  });

  // `relationMap?` 与同目录 `#resolveQueryCacheTarget` 的 `propertyMap?` 同口径：
  // 这条路径也会收到只带部分字段的 metadata 替身。
  for (const relation of metadata.relationMap?.values() ?? []) {
    if (relation.kind !== RelationKind.ONE_TO_ONE && relation.kind !== RelationKind.MANY_TO_ONE) continue;
    // SET NULL 的外键列必须可空，DDL 因此不给它 NOT NULL
    if (relation.nullable || relation.onDelete === 'SET NULL' || relation.onUpdate === 'SET NULL') continue;
    const relationDefault = (relation as { default?: unknown }).default;
    if (relationDefault !== undefined && !isFunction(relationDefault)) continue;
    required.set(relation.name, relation.columnName);
  }

  return required;
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
  /** 同批其他行带了、本行没有的键 */
  missingBatch: string[];
}

/**
 * 落地前校验远端行的列集，不合契约就 fail-fast。
 *
 * @remarks
 * 两条判据，成因不同、修法也不同，因此消息里分开写：
 *
 * 1. **缺非空列** —— 本地表建成 NOT NULL 且无 SQL 默认值，写下去必被 SQLite 拒。
 *    今天的表现是一条 `NOT NULL constraint failed: public$recipes.createdAt`：表名是加了
 *    命名空间前缀的**本地**表名、列名在**远端**的 schema 里根本不存在、调用栈落在适配器内部
 *    而不是那次 `find()` —— 三重误导，读者第一反应是「本地表建错了」。
 * 2. **批内异构** —— `upsertMany` 的列清单取自 `data[0]`，后续行按同一批键取值。缺哪个键
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
 * @param metadata - 实体元数据；查不到时跳过第 1 条判据（本地表的非空列集无从算起），第 2 条照旧
 * @throws {RxDBQueryCacheRowContractError} 存在不满足契约的行
 */
export const assertQueryCacheRowContract = (
  entityName: string,
  rows: readonly object[],
  metadata: EntityMetadata | undefined
): void => {
  if (rows.length === 0) return;

  const required = metadata ? requiredQueryCacheColumns(metadata) : new Map<string, string>();
  const rowKeys = rows.map(row => new Set(Object.keys(row)));
  const batchKeys = new Set<string>(rowKeys.flatMap(keys => [...keys]));

  const violations: RowViolation[] = [];
  rowKeys.forEach((keys, index) => {
    const missingRequired = [...required]
      .filter(([name, column]) => !keys.has(name) && !keys.has(column))
      .map(([name]) => name);
    // 已经按「缺非空列」报过的，不在异构那一栏里重复出现
    const missingBatch = [...batchKeys].filter(
      key => !keys.has(key) && !missingRequired.some(name => name === key || required.get(name) === key)
    );
    if (missingRequired.length === 0 && missingBatch.length === 0) return;
    violations.push({ index, id: (rows[index] as Record<string, unknown>)['id'], missingRequired, missingBatch });
  });

  if (violations.length === 0) return;
  throw new RxDBQueryCacheRowContractError(buildMessage(entityName, rows.length, violations));
};

const describeRow = (violation: RowViolation): string => {
  const reasons: string[] = [];
  if (violation.missingRequired.length > 0) {
    reasons.push(`缺 ${violation.missingRequired.join(' / ')} —— 本地表把它建成 NOT NULL 且无 SQL 默认值`);
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
    `远端行必须带齐本地表的全部非空列，含 EntityBase 的 createdAt / updatedAt。`,
    `实体上的 default 只在仓储写入路径生效，QueryCache 的落地是绕开仓储的裸 SQL，不经过它；` +
      `这里也不会就地补一个 —— 补出来的是本机拉取的时刻而非记录创建的时刻，跨设备拉同一行会得到不同的值。`,
    `契约与示例见 website/docs/collaboration/sync.md 的 QueryCache 一节。`
  ].join('\n');
};
