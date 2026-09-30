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

  /**
   * 按查询条件读实体，并把结果行合进身份映射。
   *
   * @param options - 查询条件
   * @returns 结果行对应的实体（命中缓存的返回同一引用）
   *
   * @remarks
   * 回填走 {@link SqliteRepositoryBase.mergeQueryCache} 而不是 `addQueryCache(result)`：
   * 后者在 `forcedUpdate = false` 下**只建新实体、不碰已缓存的**，于是任何绕过 ORM 的写
   * （提交图的 HEAD CAS、启用提交能力的 CAS）落库之后，本进程再怎么 `find()` 都只读得到
   * 缓存里那份旧值——CAS 明明把 `headRevision` 推到了 1，读回来还是 0，下一次提交因此
   * 永远撞 `head_revision_conflict`。PGlite 那一端每次读都回填，同一段代码在两个后端上
   * 结果不同。
   *
   * 也不用 `addQueryCache(result, true)`：那是整行覆盖 + `modified` 归零，会把用户尚未
   * 保存的编辑写进基线后静默清空（见 `entity-status.ts#applyExternal`）。
   */
  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_query_find_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    const entities = await this.mergeQueryCache(result);
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
