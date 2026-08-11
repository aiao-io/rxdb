import {
  CountOptions,
  EntityStaticType,
  EntityType,
  FindAllOptions,
  FindOptions,
  getEntityMetadata,
  getEntityStatus,
  IRepository
} from '@aiao/rxdb';
import generate_entity_delete_sql from '../entity/delete_sql.js';
import generate_entity_insert_sql from '../entity/insert_sql.js';
import generate_entity_update_sql from '../entity/update_sql.js';
import { getMonotonicUpdatedAt, RxdbAdapterPGliteError } from '../pglite.utils.js';
import { generate_count_sql, generate_find_sql } from '../query/query_sql.js';
import { PGliteRepositoryBase } from './PGliteRepositoryBase.js';

export class PGliteRepository<T extends EntityType> extends PGliteRepositoryBase<T> implements IRepository<T> {
  async get(id: EntityStaticType<T, 'idType'>): Promise<InstanceType<T>> {
    const query: FindOptions<T> = {
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: id }]
      }
    };
    const d = await this.findOne(query);
    if (!d) throw new RxdbAdapterPGliteError(`Entity (${id}) not found`);
    return d;
  }

  async findOne(options: EntityStaticType<T, 'findOneOptions'>): Promise<InstanceType<T> | undefined> {
    const findOptions = { ...options, limit: 1, offset: 0 } as EntityStaticType<T, 'findOptions'>;
    const d = await this.find(findOptions);
    return d[0];
  }

  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_find_sql(this.adapter, this.metadata, options as unknown as FindOptions);
    const result = await this.adapter.query<Record<string, unknown>>(sql, params);
    return this.addQueryCache(result);
  }

  async findAll(options: EntityStaticType<T, 'findAllOptions'>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_find_sql(this.adapter, this.metadata, options as unknown as FindAllOptions);
    const result = await this.adapter.query<Record<string, unknown>>(sql, params);
    return await this.addQueryCache(result);
  }

  async count(options: EntityStaticType<T, 'countOptions'>): Promise<number> {
    const { sql, params } = generate_count_sql(this.adapter, this.metadata, options as unknown as CountOptions);
    const result = await this.adapter.query<{ count: string | number }>(sql, params);
    return Number(result.rows[0].count);
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
      updatedAt: getMonotonicUpdatedAt(entity),
      encryption: this.adapter.encryptionContext
    });
    const result = await this.adapter.writeQuery(sql, params);
    await this.addQueryCache(result, true);
    return entity;
  }

  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const status = getEntityStatus(entity);
    if (status.local !== true) {
      const meta = getEntityMetadata(entity);
      throw new RxdbAdapterPGliteError(`Remove Error${meta.name}(${entity.id}) not saved local.`);
    }

    const { sql, params } = generate_entity_delete_sql(this.metadata, entity);
    await this.adapter.writeQuery(sql, params);

    status.origin = structuredClone({ ...entity });
    status.modified = false;
    status.removed = true;
    status.local = false;

    return entity;
  }
}
