import { EntityMetadata, EntityType, getEntityMetadata, getEntityStatus, RepositoryBase } from '@aiao/rxdb';
import { find_by_row_ids_sql } from '../query/find_by_row_ids_sql.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { RowId, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { chunkBySqliteBindLimit, ROWID } from '../sqlite-core.utils.js';
import { transaction_sqlite_result } from '../transaction_sqlite_result.js';

const get_result_row_ids = (sqliteResult: SqliteSuccessResult): RowId[] =>
  sqliteResult.results.flatMap(({ columns, rows }) => {
    const rowIdIndex = columns.indexOf(ROWID);
    if (rowIdIndex === -1) return [];
    return rows.map(row => BigInt(row[rowIdIndex] as number));
  });

/**
 * 操作实体仓库
 */
export class SqliteRepositoryBase<T extends EntityType> extends RepositoryBase<T> {
  public readonly metadata!: EntityMetadata;

  constructor(
    protected adapter: RxDBAdapterSqliteBase,
    EntityType: T
  ) {
    super(adapter.rxdb, EntityType);
    this.metadata = getEntityMetadata(EntityType);
  }

  async findByRowIds(rowIds: RowId[], forceRefresh = false): Promise<InstanceType<T>[]> {
    const cachedEntities = rowIds.map(rowId => this.adapter.getEntityByRowId(rowId, this.EntityType));
    if (!forceRefresh && cachedEntities.every(entity => entity && !getEntityStatus(entity).removed)) {
      return cachedEntities as InstanceType<T>[];
    }

    // 普通查询仅回库查询缓存缺失或已标记 removed 的行，命中行直接信任缓存（与全命中快路径语义一致），
    // 避免大列表少量缺失时整批重查带来的多余 IO。
    const queryRowIds =
      forceRefresh ? rowIds : (
        rowIds.filter((rowId, index) => {
          const entity = cachedEntities[index];
          return !entity || getEntityStatus(entity).removed;
        })
      );
    const refreshedRowIds = new Set<RowId>();

    for (const chunk of chunkBySqliteBindLimit(queryRowIds)) {
      const { sql, params } = find_by_row_ids_sql(this.metadata, chunk);
      const sqliteResult = await this.adapter.query(sql, params);
      if (forceRefresh) {
        get_result_row_ids(sqliteResult).forEach(rowId => refreshedRowIds.add(rowId));
        await this.mergeQueryCache(sqliteResult);
        continue;
      }
      await this.addQueryCache(sqliteResult);
    }

    // 按入参 rowIds 顺序重排（缺失行省略），与全缓存命中分支语义一致
    return rowIds
      .filter(rowId => !forceRefresh || refreshedRowIds.has(rowId))
      .map(rowId => this.adapter.getEntityByRowId(rowId, this.EntityType))
      .filter(Boolean) as InstanceType<T>[];
  }

  /**
   * 添加缓存
   * @param sqliteSuccessResult
   * @param forcedUpdate 强制刷新，在数据有的情况下也会更新数据，在修改数据的情况下需要
   */
  addQueryCache(sqliteSuccessResult: SqliteSuccessResult, forcedUpdate = false): Promise<InstanceType<T>[]> {
    return transaction_sqlite_result<T>(this.adapter, this.EntityType, sqliteSuccessResult, forcedUpdate);
  }

  /**
   * 把结果行合进身份映射：干净实体整行刷新，脏实体逐字段避让未保存的编辑。
   *
   * @param sqliteSuccessResult - 一次 SELECT 的结果集
   * @returns 结果行对应的实体（命中缓存的返回同一引用）
   *
   * @remarks
   * 与 {@link addQueryCache} 的分工是「读」与「写」：写路径（`create` / `update`）知道自己
   * 刚刚写了什么，用 `forcedUpdate` 整行盖回去是对的；读路径拿到的是**别人**写的行，可能
   * 落在一个用户正在编辑的实体上，只能用 `state.modified ? mergeExternal : replace`
   * 这一对策略——这正是 `entity-status.ts#applyExternal` 的语义，它把「查询结果回填」
   * 明确列为必须分流的三条路径之一。
   */
  protected mergeQueryCache(sqliteSuccessResult: SqliteSuccessResult): Promise<InstanceType<T>[]> {
    return transaction_sqlite_result<T>(this.adapter, this.EntityType, sqliteSuccessResult, false, false, true);
  }
}
