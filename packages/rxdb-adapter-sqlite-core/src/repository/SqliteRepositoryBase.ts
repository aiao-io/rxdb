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

  private mergeQueryCache(sqliteSuccessResult: SqliteSuccessResult): Promise<InstanceType<T>[]> {
    return transaction_sqlite_result<T>(this.adapter, this.EntityType, sqliteSuccessResult, false, false, true);
  }
}
