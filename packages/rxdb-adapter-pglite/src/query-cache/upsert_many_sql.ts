import type { EntityMetadata } from '@aiao/rxdb';
import {
  chunkByPgParamLimit,
  quoteIdentifier,
  RxdbAdapterPGliteError,
  transformEntityValueToSql,
  type EncryptionContext
} from '../pglite.utils.js';
import { assertQueryCacheRowContract, queryCacheForeignKeyColumns } from './query_cache_row_contract.js';
import type { QueryCacheTarget } from './query_cache_target.js';

/** 一条参数化语句。 */
export interface QueryCacheStatement {
  sql: string;
  params: unknown[];
}

/**
 * 为 `upsertMany` 生成参数化的 INSERT … ON CONFLICT 语句。
 *
 * @remarks
 * 旧实现从 `data[0]` 取 `Object.keys` 当列名，导致四件事同时错：
 * 列名不经 `propertyMap` 映射、异构行按第一行的列集合截断、值不做类型转换与加密、
 * 未知键直接成为 SQL 标识符（且拼接时没有转义双引号）。
 *
 * 这里改为 metadata 驱动：
 * 1. 先整批校验**列契约**：缺了本地表的非空无默认值列就 fail-fast，一条语句都不生成
 *    （US-024）。放在最前面是因为它是**整批**判据 —— 逐行校验会先把合格行的语句攒出来，
 *    再在某一行上抛错，读者看到的就是「一部分做了一部分没做」；
 * 2. 先判「同一个物理列有没有被两种写法同时占用」（{@link assertSingleSpellingPerColumn}），
 *    再把外键列的三种写法归一成物理列名（{@link withForeignKeyColumns}）——
 *    契约放行了哪三种，这里就得认哪三种，共用 `queryCacheForeignKeyColumns` 那张表；
 * 3. 校验键名白名单，未知键 **fail-fast**，不进入 SQL 结构；
 * 4. 每行各自过 `transformEntityValueToSql`（属性名/列名双向识别 + 类型转换 + 加密）；
 * 5. 按**规范化后的列集合**分组，每组一条语句 —— 异构行不再互相截断；
 * 6. 值一律参数化，并按 PG 参数上限分片。
 *
 * 第 1 步刻意**不**判「批内异构」（sqlite-core 侧契约的第二条判据）：那条判据的成因是
 * 它的列清单取自 `data[0]`，而这里的第 4 步按列集分组，结构上没有那个病 —— 跟着判只会把
 * `groupByColumnSet` 这个已交付的能力改成报错。
 *
 * @param target - 已解析的物理定位信息
 * @param rows - 远端行（键名可以是 JS 属性名，也可以是物理列名）
 * @param encryption - 加密上下文；实体声明了加密列时必须提供已解锁的 keyring
 * @returns 待执行的参数化语句列表；无可写列时返回空数组
 * @throws {RxDBQueryCacheRowContractError} 存在缺必填列的行
 * @throws {RxdbAdapterPGliteError} 存在不属于该实体的键，或同一个物理列被两种写法同时占用
 */
export const buildQueryCacheUpsertStatements = async (
  target: QueryCacheTarget,
  rows: readonly object[],
  encryption?: EncryptionContext
): Promise<QueryCacheStatement[]> => {
  assertQueryCacheRowContract(target.entityName, rows, target.metadata);

  const foreignKeyColumns = queryCacheForeignKeyColumns(target.metadata);
  const normalizedRows: Record<string, unknown>[] = [];
  for (const row of rows) {
    assertSingleSpellingPerColumn(target.entityName, target.metadata, foreignKeyColumns, row);
    const keyed = withForeignKeyColumns(foreignKeyColumns, row);
    assertKnownKeys(target.entityName, target.metadata, keyed);
    // primaryKey 刻意不显式传入：`transformEntityValueToSql` 默认取 `row.id`，
    // 与常规写入路径（entity/inserts_sql.ts）取的是同一个值。
    // 传一个不同的值会让加密 AAD 与常规路径分叉，密文将无法被读路径解开。
    normalizedRows.push(await transformEntityValueToSql(target.metadata, keyed, encryption));
  }

  const groups = groupByColumnSet(normalizedRows);
  const statements: QueryCacheStatement[] = [];

  for (const group of groups) {
    const { columns } = group;
    if (columns.length === 0) continue;
    const quotedColumns = columns.map(quoteIdentifier).join(', ');
    const conflictClause = buildOnConflictClause(target.idColumn, columns);

    for (const chunk of chunkByPgParamLimit(group.rows, columns.length)) {
      const params: unknown[] = [];
      const valueGroups = chunk.map((row, rowIndex) => {
        const offset = rowIndex * columns.length;
        const placeholders = columns.map((column, columnIndex) => {
          params.push(row[column] ?? null);
          return `$${offset + columnIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      statements.push({
        sql: `INSERT INTO ${target.tableName} (${quotedColumns}) VALUES ${valueGroups.join(', ')}${conflictClause}`,
        params
      });
    }
  }

  return statements;
};

/**
 * 生成 ON CONFLICT 子句。
 *
 * @remarks
 * 无可更新列时发 `DO NOTHING` —— 旧实现在这里会拼出空的 `DO UPDATE SET `，
 * 只带 id 的行必然语法错误。排除集合只有主键列，与 sqlite-core 的
 * `generate_upsert_clause` 同口径。
 */
const buildOnConflictClause = (idColumn: string, columns: readonly string[]): string => {
  const conflictTarget = quoteIdentifier(idColumn);
  const updateColumns = columns.filter(column => column !== idColumn);
  if (updateColumns.length === 0) return ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  const assignments = updateColumns
    .map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ');
  return ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`;
};

/** 按列集合把规范化后的行分组，组内列顺序稳定（字典序）。 */
const groupByColumnSet = (
  rows: readonly Record<string, unknown>[]
): { columns: string[]; rows: Record<string, unknown>[] }[] => {
  const groups = new Map<string, { columns: string[]; rows: Record<string, unknown>[] }>();
  for (const row of rows) {
    const columns = Object.keys(row)
      .filter(column => row[column] !== undefined)
      .sort();
    // 用 NUL 作分隔符：列名不可能含 NUL，拼出来的签名与列集合一一对应。
    // 必须写成转义 `\u0000`，直接写裸字节会让整个文件被 git 判为二进制。
    const signature = columns.join('\u0000');
    const group = groups.get(signature);
    if (group) group.rows.push(row);
    else groups.set(signature, { columns, rows: [row] });
  }
  return [...groups.values()];
};

/**
 * 把外键列的三种写法（`team` / `teamId` / `team_id`）统一改写成物理列名。
 *
 * @remarks
 * 契约（{@link assertQueryCacheRowContract}）对这三种写法一律放行，落地路径就必须一律认 ——
 * 而 `transformEntityValueToSql` 只认后两种：它是与常规仓储写入路径**共用**的，那条路径上
 * `team` 装的可能是嵌套实体对象，不能在那里按外键处理。所以归一放在 QueryCache 这一侧。
 * 少了这一步，一行带 `team` 的远端行会被契约放行、再在 `assertKnownKeys` 被判成未知键 ——
 * 拒掉的是一行**原本能落进 `team_id`** 的数据。
 *
 * @param foreignKeyColumns - 写法 → 物理列名（{@link queryCacheForeignKeyColumns}）
 * @param row - 远端行；已过 {@link assertSingleSpellingPerColumn}，同一列不会有两种写法
 * @returns 外键键名已归一的新对象；非外键键原样保留
 */
const withForeignKeyColumns = (
  foreignKeyColumns: ReadonlyMap<string, string>,
  row: object
): Record<string, unknown> => {
  const keyed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const column = foreignKeyColumns.get(key);
    keyed[column ?? key] = value;
  }
  return keyed;
};

/**
 * 把一个键解析成它最终落进的物理列。
 *
 * @remarks
 * 三支覆盖了一个键的全部去处：外键的三种写法走 {@link queryCacheForeignKeyColumns}、
 * 属性名走 `propertyMap`、物理列名（属性的与外键的）解析成自己。未知键也解析成自己 ——
 * 它由 {@link assertKnownKeys} 负责报，这里不抢它的话。
 */
const resolveColumn = (metadata: EntityMetadata, foreignKeyColumns: ReadonlyMap<string, string>, key: string): string =>
  foreignKeyColumns.get(key) ?? metadata.propertyMap.get(key)?.columnName ?? key;

/**
 * 一行里同一个物理列只允许一种写法。
 *
 * @remarks
 * 属性名与物理列名（`nickName` / `nick_name`）、外键的三种写法（`team` / `teamId` /
 * `team_id`）都落进同一个物理列。一行里同时给两种，`transformEntityValueToSql` 会按
 * `Object.keys` 的顺序后者覆盖前者，静默留下一个值 —— 两个值不同时，落地的是哪一个
 * 取决于键的枚举顺序，且没有任何信号。这不是风格问题，是远端一行里把同一列发了两次。
 *
 * 不做「取其一」的兜底（铁律「无 fallback 兜底」）：挑哪个都是猜，而猜错的那次会以
 * 「写入成功」的形态留在缓存里。
 *
 * @param entityName - 实体名，用于诊断消息
 * @param metadata - 实体元数据
 * @param foreignKeyColumns - 写法 → 物理列名（{@link queryCacheForeignKeyColumns}）
 * @param row - 远端行（未归一）
 * @throws {RxdbAdapterPGliteError} 同一个物理列被两种写法同时占用
 */
const assertSingleSpellingPerColumn = (
  entityName: string,
  metadata: EntityMetadata,
  foreignKeyColumns: ReadonlyMap<string, string>,
  row: object
): void => {
  const claimedBy = new Map<string, string>();
  for (const key of Object.keys(row)) {
    const column = resolveColumn(metadata, foreignKeyColumns, key);
    const claimer = claimedBy.get(column);
    if (claimer !== undefined) {
      throw new RxdbAdapterPGliteError(
        `QueryCache: entity "${entityName}" row gives column "${column}" twice, as "${claimer}" and "${key}"; use exactly one spelling per column`
      );
    }
    claimedBy.set(column, key);
  }
};

/**
 * 校验行内所有键都属于该实体。
 *
 * @remarks
 * 接受 JS 属性名与物理列名两种写法 —— 远端行的形态由远端适配器决定
 * （`RxDBAdapterSupabase.findByIds` 走 `select('*')`），两种都可能出现，
 * `transformEntityValueToSql` 本身也是双向识别的。外键的第三种写法（关系名 / 别名）
 * 在 {@link withForeignKeyColumns} 里已经归一成物理列名，到这里只剩物理列名一种，
 * 因此**不再**单独判 `foreignKeyNames`。
 *
 * 未知键**不静默丢弃**：丢弃会把「本地 schema 与远端漂移」伪装成写入成功，
 * 缓存里留下一行缺字段的数据，且没有任何信号。
 *
 * @param entityName - 实体名，用于诊断消息
 * @param metadata - 实体元数据
 * @param row - 已归一外键键名的行
 * @throws {RxdbAdapterPGliteError} 存在不属于该实体的键
 */
const assertKnownKeys = (entityName: string, metadata: EntityMetadata, row: object): void => {
  const unknownKeys = Object.keys(row).filter(key => !isKnownKey(metadata, key));
  if (unknownKeys.length === 0) return;
  throw new RxdbAdapterPGliteError(
    `QueryCache: entity "${entityName}" has no property or column named ${unknownKeys.map(key => `"${key}"`).join(', ')}`
  );
};

/**
 * 键是否属于该实体。
 *
 * @remarks
 * 三支都是活的，缺一不可：`columnNameToPropertyName` 只由 `propertyMap` 建起，
 * 不含任何关系（见 `metadata-transition`），所以外键的物理列名必须单独判。
 */
const isKnownKey = (metadata: EntityMetadata, key: string): boolean =>
  metadata.propertyMap.has(key) ||
  metadata.columnNameToPropertyName.has(key) ||
  metadata.foreignKeyColumnNames.includes(key);
