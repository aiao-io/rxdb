/**
 * @fileoverview Supabase Repository 实现
 */

import type { EntityMetadata, EntityType, IRepository, RuleGroup } from '@aiao/rxdb';
import { EntityStaticType, getEntityMetadata, isRuleGroup, normalizeUpdateEntity, RepositoryBase } from '@aiao/rxdb';

import { SupabaseDataError } from './errors.js';
import { apply_rule_group } from './rule_group_builder.js';
import type { RxDBAdapterSupabase } from './RxDBAdapterSupabase.js';
import { resolve_supabase_schema } from './schema.utils.js';
import { transform_row_to_entity } from './transform.js';

type RepositoryRuleGroup = RuleGroup<Record<string, unknown>>;

interface RepositoryRuleView {
  field: string;
  operator: string;
  where?: RepositoryRuleGroup;
}

function normalize_supabase_update(metadata: EntityMetadata, patch: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeUpdateEntity(metadata, patch);
  const result: Record<string, unknown> = {};

  for (const [propertyName, property] of metadata.propertyMap) {
    if (!(property.columnName in normalized)) continue;
    Object.defineProperty(result, propertyName, {
      value: normalized[property.columnName],
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  const foreignKeyNames = metadata.foreignKeyNames ?? [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames ?? foreignKeyNames;
  for (let index = 0; index < foreignKeyNames.length; index++) {
    const columnName = foreignKeyColumnNames[index];
    if (!(columnName in normalized)) continue;
    Object.defineProperty(result, foreignKeyNames[index], {
      value: normalized[columnName],
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  return result;
}

/**
 * Supabase Repository（Supabase 仓库）
 * 提供对 Supabase 表的 CRUD 操作
 */
export class SupabaseRepository<T extends EntityType> extends RepositoryBase<T> implements IRepository<T> {
  protected readonly metadata: EntityMetadata;

  constructor(
    protected readonly adapter: RxDBAdapterSupabase,
    EntityType: T
  ) {
    super(adapter.rxdb, EntityType);
    this.metadata = getEntityMetadata(EntityType);
  }

  /**
   * 查询多个实体。
   *
   * 自动按 1000 行分页拉取直到 limit 满足或数据耗尽，避免单次请求超过 PostgREST 的默认上限。
   * 当 where 含跨表条件时会附加 `!inner` 关系 SELECT，确保关联过滤生效。
   *
   * @param options - 查询条件（where / orderBy / limit / offset）
   * @returns 满足条件的实体数组（已通过 transform_row_to_entity 还原为类型实例）
   * @throws {SupabaseDataError} PostgREST 返回错误时
   */
  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    type FindOrder = NonNullable<EntityStaticType<T, 'findOptions'>['orderBy']>[number];
    const where = options.where as unknown as RepositoryRuleGroup;

    const selectFields = this.build_select_fields(where);

    const build_query = () => {
      let query = this.get_client().select(selectFields);
      query = apply_rule_group(query, where, this.metadata, this.adapter.rxdb.schemaManager);

      if (options.orderBy?.length) {
        for (const order of options.orderBy) {
          query = query.order(order.field, { ascending: order.sort === 'asc' });
        }
      }

      // 始终以 id 作为稳定排序兜底：无 orderBy 时 PostgREST 不保证跨 range 分页的顺序，
      // 否则结果集 > pageSize 时翻页会出现重复或丢行。
      if (!options.orderBy?.some((order: FindOrder) => order.field === 'id')) {
        query = query.order('id', { ascending: true });
      }

      return query;
    };

    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = options.offset ?? 0;
    let remaining = options.limit;

    while (true) {
      const batchSize = remaining === undefined ? pageSize : Math.min(pageSize, remaining);
      if (batchSize <= 0) break;

      const { data, error } = await build_query().range(from, from + batchSize - 1);
      if (error) throw new SupabaseDataError(`Failed to find entities: ${error.message}`);

      const batch = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...batch);

      if (batch.length < batchSize) break;

      from += batch.length;
      if (remaining !== undefined) {
        remaining -= batch.length;
        if (remaining <= 0) break;
      }
    }

    return rows.map((row: Record<string, unknown>) => transform_row_to_entity(this.EntityType, this.metadata, row));
  }

  /**
   * 统计满足条件的实体数量。
   *
   * 使用 PostgREST 的 `count=exact` + `head=true`，仅返回计数不下载行数据。
   * 暂不支持 groupBy。
   *
   * @param options - 查询条件（where / groupBy）
   * @returns 实体总数（无匹配时返回 0）
   * @throws {Error} 传入 groupBy（暂未实现）
   * @throws {SupabaseDataError} PostgREST 返回错误时
   */
  async count(options: EntityStaticType<T, 'countOptions'>): Promise<number> {
    if (options.groupBy) throw new Error('groupBy not supported yet');
    const where = options.where as unknown as RepositoryRuleGroup;

    const selectFields = this.build_select_fields(where);

    let query = this.get_client().select(selectFields, { count: 'exact', head: true });
    query = apply_rule_group(query, where, this.metadata, this.adapter.rxdb.schemaManager);

    const { count, error } = await query;
    if (error) {
      throw new SupabaseDataError(`Failed to count entities: ${error.message || 'unknown error'}`);
    }

    return count ?? 0;
  }

  /**
   * 创建实体并落库。
   *
   * 若 rxdb.context.userId 存在，会自动注入 createdBy / updatedBy 审计字段。
   *
   * @param entity - 待创建的实体（必须包含主键 id）
   * @returns 创建后的实体（含数据库回填字段如 createdAt，已通过 `transform_row_to_entity` 还原为类型实例）
   * @throws {SupabaseDataError} 插入失败（主键冲突 / RLS 拒绝 / 网络错误等）
   */
  async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const entityData = { ...entity } as Record<string, unknown>;
    const userId = this.rxdb.context.userId;
    if (userId) {
      entityData['createdBy'] = userId;
      entityData['updatedBy'] = userId;
    }

    const { data, error } = await this.get_client().insert(entityData).select().single();
    if (error) throw new SupabaseDataError(`Failed to create entity: ${error.message}`);

    return transform_row_to_entity(this.EntityType, this.metadata, data as Record<string, unknown>);
  }

  /**
   * 按 id 部分更新实体。
   *
   * 若 rxdb.context.userId 存在，会自动注入 updatedBy 审计字段。
   * 服务端的触发器/默认值会回填到返回结果。
   *
   * 用户 patch 先由 `normalizeUpdateEntity` 过滤 readonly 字段，系统审计字段随后单独注入。
   *
   * @param entity - 目标实体（仅取 id 用于定位行）
   * @param patch - 增量字段（不含 id）
   * @returns 更新后的实体（已通过 `transform_row_to_entity` 还原为类型实例）
   * @throws {SupabaseDataError} 行不存在 / RLS 拒绝 / 网络错误时
   */
  async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const patchData = normalize_supabase_update(this.metadata, patch as Record<string, unknown>);
    const userId = this.rxdb.context.userId;
    if (userId) {
      const updatedBy = this.metadata.propertyMap.get('updatedBy');
      if (updatedBy) patchData[updatedBy.columnName] = userId;
    }
    const { data, error } = await this.get_client()
      .update<Record<string, unknown>>(patchData)
      .eq('id', entity.id)
      .select()
      .single();
    if (error) throw new SupabaseDataError(`Failed to update entity: ${error.message}`);
    return transform_row_to_entity(this.EntityType, this.metadata, data as Record<string, unknown>);
  }

  /**
   * 按 id 硬删除实体（无软删 / tombstone）。
   *
   * 返回原始 entity 引用方便链式处理；如需服务端回填字段请改用 find/update。
   *
   * @param entity - 目标实体（仅取 id 用于定位行）
   * @returns 传入的 entity（删除成功后原样返回）
   * @throws {SupabaseDataError} RLS 拒绝 / 网络错误时
   */
  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const { data, error } = await this.get_client().delete().eq('id', entity.id).select('id').single();
    if (error) throw new SupabaseDataError(`Failed to remove entity: ${error.message}`);
    if (data?.id !== entity.id) throw new SupabaseDataError('Failed to remove entity: deleted row did not match');
    return entity;
  }

  // ============================================
  // 私有方法
  // ============================================

  private build_select_fields(where: RepositoryRuleGroup | undefined): string {
    const relationFields = this.extract_relation_fields(where);
    if (relationFields.size === 0) return '*';

    const paths = [...relationFields.keys()];
    const deepestPaths = paths.filter(path => !paths.some(other => other !== path && other.startsWith(`${path}.`)));
    return `*, ${deepestPaths
      .map(path => this.build_relation_select(path, relationFields.get(path) ?? true))
      .join(', ')}`;
  }

  /** 提取查询中的关系字段路径（用于 EXISTS 查询的 INNER JOIN） */
  private extract_relation_fields(ruleGroup: RepositoryRuleGroup | undefined): Map<string, boolean> {
    const paths = new Map<string, boolean>();

    const addPath = (path: string, inner: boolean) => {
      if (inner || !paths.has(path)) {
        paths.set(path, inner);
      }
    };

    const traverse = (rg: RepositoryRuleGroup | undefined, prefix: string = '') => {
      if (!rg?.rules) return;

      for (const rule of rg.rules) {
        if (isRuleGroup(rule)) {
          traverse(rule as unknown as RepositoryRuleGroup, prefix);
          continue;
        }

        const ruleView = rule as unknown as RepositoryRuleView;
        if (ruleView.field.includes('.')) {
          // 点号字段：提取关系路径（不含最后的字段名）
          const parts = ruleView.field.split('.');
          for (let i = 1; i < parts.length; i++) {
            const path = parts.slice(0, i).join('.');
            addPath(prefix ? `${prefix}.${path}` : path, true);
          }
        } else if (ruleView.operator === 'exists' || ruleView.operator === 'notExists') {
          const name = ruleView.field;
          const currentPath = prefix ? `${prefix}.${name}` : name;

          if (this.metadata.relationMap?.has(name)) {
            addPath(currentPath, ruleView.operator === 'exists');
          }
          if (ruleView.where) traverse(ruleView.where, currentPath);
        }
      }
    };

    traverse(ruleGroup);
    return paths;
  }

  /**
   * 构建关系字段的 SELECT 语法
   * 支持嵌套路径：'orders.items' → Order!inner(*, OrderItem!inner(*))
   */
  private build_relation_select(relationPath: string, inner: boolean): string {
    const parts = relationPath.split('.');
    if (parts.length === 1) return this.build_single_relation_select(parts[0], inner);

    // 收集每层关系信息
    const infos: Array<{
      relationName: string;
      targetTableName: string;
      targetEntityName: string;
      kind: string;
      sourceEntityName: string;
      sourceTableName: string;
    }> = [];
    let meta = this.metadata;

    for (const name of parts) {
      const rel = meta.relationMap?.get(name);
      if (!rel) return `${name}(id)`;

      const nextMeta = this.adapter.rxdb.schemaManager.getEntityMetadata(rel.mappedEntity, rel.mappedNamespace ?? '');

      infos.push({
        relationName: name,
        targetTableName: nextMeta?.tableName ?? rel.mappedEntity,
        targetEntityName: rel.mappedEntity,
        kind: rel.kind,
        sourceEntityName: meta.name,
        sourceTableName: meta.tableName
      });

      if (nextMeta) meta = nextMeta;
    }

    // 从内向外构建嵌套 SELECT
    let result = this.build_relation_segment(infos[infos.length - 1], inner);
    for (let i = infos.length - 2; i >= 0; i--) {
      const base = this.build_relation_segment(infos[i], inner);
      result = base.replace('(*)', `(*, ${result})`);
    }
    return result;
  }

  /**
   * 构建单层关系 SELECT
   * 根据关系类型生成正确的消歧语法
   */
  private build_single_relation_select(relationName: string, inner: boolean): string {
    const rel = this.metadata.relationMap?.get(relationName);
    if (!rel) return `${relationName}(id)`;

    const mappedMeta = this.adapter.rxdb.schemaManager.getEntityMetadata(rel.mappedEntity, rel.mappedNamespace ?? '');
    const table = mappedMeta?.tableName ?? rel.mappedEntity;
    const current = this.metadata.tableName;
    const suffix = inner ? '!inner' : '';

    // m:1 / 1:1：使用外键约束名消歧
    if (rel.kind === 'm:1' || rel.kind === '1:1') {
      const constraint = `${current}_${relationName}Id_fkey`.toLowerCase();
      return `${relationName}:${table}!${constraint}${suffix}(*)`;
    }

    // m:n：使用中间表消歧
    if (rel.kind === 'm:n') {
      const joinTable = this.get_join_table_name(this.metadata.name, rel.mappedEntity);
      return `${relationName}:${table}!${joinTable}${suffix}(*)`;
    }

    // 1:m：简单语法
    return `${relationName}:${table}${suffix}(*)`;
  }

  /** 构建关系 SELECT 片段 */
  private build_relation_segment(
    info: {
      relationName: string;
      targetTableName: string;
      targetEntityName: string;
      kind: string;
      sourceEntityName: string;
      sourceTableName: string;
    },
    inner: boolean
  ): string {
    const suffix = inner ? '!inner' : '';
    if (info.kind === 'm:n') {
      const joinTable = this.get_join_table_name(info.sourceEntityName, info.targetEntityName);
      return `${info.relationName}:${info.targetTableName}!${joinTable}${suffix}(*)`;
    }
    if (info.kind === 'm:1' || info.kind === '1:1') {
      const constraint = `${info.sourceTableName}_${info.relationName}Id_fkey`.toLowerCase();
      return `${info.relationName}:${info.targetTableName}!${constraint}${suffix}(*)`;
    }
    return `${info.relationName}:${info.targetTableName}${suffix}(*)`;
  }

  /** 获取 m:n 中间表名（按字母顺序） */
  private get_join_table_name(a: string, b: string): string {
    return [a, b].sort().join('_');
  }

  /** 获取带 schema 的 client */
  private get_client() {
    const schema = resolve_supabase_schema(this.metadata.namespace);
    return schema ?
        this.adapter.client.schema(schema).from(this.metadata.tableName)
      : this.adapter.client.from(this.metadata.tableName);
  }
}
