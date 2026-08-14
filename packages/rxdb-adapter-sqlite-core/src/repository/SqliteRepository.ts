import { EntityStaticType, EntityType, FindOptions, getEntityMetadata, getEntityStatus, IRepository } from '@aiao/rxdb';
import { generate_entity_delete_sql } from '../entity/delete_sql.js';
import { generate_entity_insert_sql } from '../entity/insert_sql.js';
import { update_sql as generate_entity_update_sql } from '../entity/update_sql.js';
import { count_sql as generate_query_count_sql } from '../query/count_sql.js';
import { find_sql as generate_query_find_sql } from '../query/find_sql.js';
import { getMonotonicUpdatedAt, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import { SqliteRepositoryBase } from './SqliteRepositoryBase.js';

/**
 * 操作实体仓库
 */
export class SqliteRepository<T extends EntityType> extends SqliteRepositoryBase<T> implements IRepository<T> {
  async get(id: EntityStaticType<T, 'idType'>): Promise<InstanceType<T>> {
    const query: FindOptions<T> = {
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: id }]
      }
    };
    const d = await this.findOne(query);
    if (!d) throw new RxDBAdapterSqliteError(`Entity (${id}) not found`);
    return d;
  }

  async findOne(options: EntityStaticType<T, 'findOneOptions'>): Promise<InstanceType<T> | undefined> {
    const d = await this.find({ ...options, limit: 1, offset: 0 });
    return d[0];
  }

  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_query_find_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    const entities = await this.addQueryCache(result);
    return entities;
  }

  async count(options: EntityStaticType<T, 'countOptions'>): Promise<number> {
    const { sql, params } = generate_query_count_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return result.results[0].rows[0][0] as number;
  }

  async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const { sql, params } = await generate_entity_insert_sql(this.metadata, entity, {
      ...this.rxdb.context,
      encryption: this.adapter.encryptionContext
    });
    const result = await this.adapter.writeQuery(sql, params);
    await this.addQueryCache(result, true);
    return entity;
  }

  async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const { sql, params } = await generate_entity_update_sql(this.metadata, entity, patch, {
      ...this.rxdb.context,
      encryption: this.adapter.encryptionContext,
      updatedAt: getMonotonicUpdatedAt(entity)
    });
    const result = await this.adapter.writeQuery(sql, params);
    await this.addQueryCache(result, true);
    return entity;
  }

  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const status = getEntityStatus(entity);
    // 更新状态
    const _update_entity_status = () => {
      status.origin = structuredClone({ ...entity });
      status.modified = false;
      status.removed = true;
    };
    // 本地删除
    if (status.local === true) {
      const { sql, params } = generate_entity_delete_sql(this.metadata, entity);
      await this.adapter.writeQuery(sql, params);
      _update_entity_status();
      return entity;
    }
    const meta = getEntityMetadata(entity);
    throw new RxDBAdapterSqliteError(`Remove Error${meta.name}(${entity.id}) not saved local.`);
  }
}
