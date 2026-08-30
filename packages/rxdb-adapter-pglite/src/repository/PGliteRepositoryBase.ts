import {
  EntityMetadata,
  EntityStaticType,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
  RepositoryBase
} from '@aiao/rxdb';
import { Results } from '@electric-sql/pglite';
import { getEntityObjectFromResult } from '../pglite.utils.js';
import generate_query_find_by_row_ids_sql from '../query/find_by_row_ids_sql.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { decodeRxDBChangeRow, isRxDBChangeMetadata } from '../system/change-row.js';

export class PGliteRepositoryBase<T extends EntityType> extends RepositoryBase<T> {
  public readonly metadata!: EntityMetadata;

  constructor(
    protected adapter: RxDBAdapterPGlite,
    EntityType: T
  ) {
    super(adapter.rxdb, EntityType);
    this.metadata = getEntityMetadata(EntityType);
  }

  /**
   * 通过行 ID 列表查询实体
   * 用于 handle_rxdb_change 中根据 NOTIFY 事件的 rowIds 查询实体
   *
   * @param rowIds - 行 ID 数组（string | number）
   * @returns 实体数组
   */
  async findByRowIds(rowIds: Array<string | number>): Promise<InstanceType<T>[]> {
    if (rowIds.length === 0) return [];
    const { sql, params } = generate_query_find_by_row_ids_sql(this.metadata, rowIds);
    const result = await this.adapter.query(sql, params);
    return await this.addQueryCache(result);
  }

  protected async addQueryCache(
    result: Results<Record<string, unknown>>,
    forcedUpdate = true
  ): Promise<InstanceType<T>[]> {
    return await Promise.all(
      result.rows.map(async row => {
        const rawData = await getEntityObjectFromResult(this.metadata, row, this.adapter.encryptionContext);
        const data = isRxDBChangeMetadata(this.metadata) ? decodeRxDBChangeRow(this.adapter, rawData) : rawData;
        const id = data['id'] as EntityStaticType<T, 'idType'>;
        const entityData = data as unknown as InstanceType<T>;
        let entity: InstanceType<T>;
        if (super.hasEntityRef(id)) {
          entity = super.getEntityRef(id)!;
          if (forcedUpdate) super.updateEntity(entity, entityData);
        } else {
          entity = this.createEntityRef(entityData);
        }
        const state = getEntityStatus(entity);
        state.local = true;
        state.modified = false;
        return entity!;
      })
    );
  }
}
