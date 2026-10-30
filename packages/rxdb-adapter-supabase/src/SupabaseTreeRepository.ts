/**
 * @fileoverview Supabase Tree Repository 实现
 * 提供树形结构的查询功能（邻接表模型）
 */

import { assertOptionalNonNegativeSafeInteger, type EntityType, type RuleGroup, type RxDBEntityId } from '@aiao/rxdb';
import type { FindTreeOptions, ITreeRepository } from '@aiao/rxdb-plugin-tree';
import { chunk_values, select_all_pages, SUPABASE_PAGE_SIZE } from './pagination.js';
import { assert_postgrest_ok } from './postgrest-error.js';
import { apply_rule_group } from './rule_group_builder.js';
import type { RxDBAdapterSupabase } from './RxDBAdapterSupabase.js';
import { resolve_supabase_schema } from './schema.utils.js';
import { SupabaseRepository } from './SupabaseRepository.js';
import { transform_row_to_entity } from './transform.js';

/** `select('parentId')` 一页的响应，只保留本文件用得到的字段 */
interface ChildRowsResponse {
  data: unknown[] | null;
  error: { message: string } | null;
  /** HTTP 状态码；`0` 表示传输失败，用于错误分类（RV-001） */
  status?: number;
}

/**
 * Supabase Tree Repository（Supabase 树形仓库）
 * 提供树形结构的查询操作
 *
 * @remarks
 * **不使用**递归 CTE，也不依赖 `get_descendants` / `get_ancestors` 之类的数据库函数 ——
 * 实现是按层发 `select`（每层一次 `in('parentId', ...)`）逐级展开。
 * 因此遍历深度 N 的子树需要 N 次往返，深树上要留意延迟；
 * 祖先链同理是自底向上逐跳查询。
 *
 * 此处此前的注释写的是「使用 PostgreSQL 的递归 CTE」，与实现不符（SUPA-023）。
 */
export class SupabaseTreeRepository<T extends EntityType> extends SupabaseRepository<T> implements ITreeRepository<T> {
  constructor(adapter: RxDBAdapterSupabase, EntityType: T) {
    super(adapter, EntityType);
  }

  /**
   * 查询子孙节点
   *
   * @remarks
   * - 指定 entityId 时：包含当前节点 + 子孙节点
   * - 不指定 entityId 时：返回所有根节点及其子孙
   */
  async findDescendants(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    return this.findDescendantsFromTable(options);
  }

  /**
   * 查询子孙节点数量
   *
   * @remarks
   * - 指定 entityId 时：**不包含当前节点**，只统计后代数量
   * - 不指定 entityId 时：统计所有根节点及其后代的总数
   */
  async countDescendants(options: FindTreeOptions<T>): Promise<number> {
    return this.countTreeNodes(await this.findDescendants(options), options.entityId);
  }

  /**
   * 查询祖先节点
   *
   * @remarks
   * - 指定 entityId 时：包含当前节点 + 祖先节点
   * - 不指定 entityId 时：返回所有根节点（起点就是全部根，往上没有祖先）
   */
  async findAncestors(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    return this.findAncestorsFromTable(options);
  }

  /**
   * 查询祖先节点数量
   *
   * @remarks
   * - 指定 entityId 时：**不包含当前节点**，只统计祖先数量
   * - 不指定 entityId 时：统计所有根节点的数量
   */
  async countAncestors(options: FindTreeOptions<T>): Promise<number> {
    return this.countTreeNodes(await this.findAncestors(options), options.entityId);
  }

  /**
   * 基于实体表的子孙节点查询
   *
   * 一次查询获取所有节点，在内存中构建树结构，避免 N+1 问题。
   */
  private async findDescendantsFromTable(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { entityId, where } = options;
    const level = assertOptionalNonNegativeSafeInteger(
      options.level,
      `tree query 'level' must be a non-negative integer, received: ${String(options.level)}`
    );
    const hasChildrenFeature = this.metadata.features?.tree?.hasChildren;
    const primaryKeyColumn = this.primary_key_column();
    const parentColumnName = this.parent_column_name();
    const tableClient = this.table_client();
    const results: InstanceType<T>[] = [];
    const visited = new Set<string>();

    // 起点不应用 where：递归 CTE 的锚点成员同样不带 rule group
    // （sqlite-core `WHERE id = ?` / `parentId is null`），起点是否匹配不影响它自身是否返回。
    const loadRoots = async (): Promise<Record<string, unknown>[]> => {
      if (entityId != null) {
        const { data, error, status } = await tableClient.select('*').eq(primaryKeyColumn, entityId).limit(1);
        assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to find descendants');
        return (data ?? []) as Record<string, unknown>[];
      }

      return this.selectRootRows('Failed to find descendants');
    };

    // 取某一层的全部子节点。这里有两重上限要绕开，缺一层都会丢节点：
    // 1. parentIds 全塞进一个 `in()` 会把查询串撑爆（表现为 `Failed to fetch` / 414）→ 分块；
    // 2. 单块内的子节点数仍可能超过 PostgREST 的 max-rows → 块内再翻页。
    // 分块结果必须先合并再统计 hasChildren，否则同一父节点的子节点会被拆到不同块里漏计。
    //
    // where 应用在这里（递归成员），不应用在起点：某一级不匹配即断链，
    // 它下面的子树不再展开，哪怕更深处的节点自身匹配。与 sqlite-core 的 children_where 一致。
    const loadChildren = async (parentIds: string[]): Promise<Record<string, unknown>[]> => {
      const rows: Record<string, unknown>[] = [];

      for (const chunk of chunk_values(parentIds)) {
        const page = await select_all_pages<Record<string, unknown>>(
          this.rxdb.reachability,
          (rangeFrom, rangeTo) =>
            this.applyWhere(tableClient.select('*').in(parentColumnName, chunk), where)
              .order(primaryKeyColumn, { ascending: true })
              .range(rangeFrom, rangeTo),
          'Failed to find descendants'
        );
        rows.push(...page);
      }

      return rows;
    };

    // hasChildren 问的是「有没有子节点」，不是「有没有匹配 where 的子节点」——
    // 对齐 sqlite-core 里那个独立的 `EXISTS(SELECT 1 ... WHERE parentId = 节点)` 子查询。
    // 因此 where 存在时不能拿已被过滤的 loadedChildren 推导，必须另发一次不带 where 的子行查询；
    // 没有 where 时 loadedChildren 本身就是完整子集，直接归并，省一次往返。
    const loadParentsWithChildren = async (
      parentIds: string[],
      loadedChildren: Record<string, unknown>[]
    ): Promise<Set<string>> => {
      if (!where) {
        const parents = new Set<string>();
        this.collectParents(loadedChildren, parents, new Set());
        return parents;
      }

      return this.findParentsWithChildren(
        (chunk, rangeFrom, rangeTo) =>
          tableClient
            .select(parentColumnName)
            .in(parentColumnName, chunk)
            .order(primaryKeyColumn, { ascending: true })
            .range(rangeFrom, rangeTo),
        parentIds,
        'Failed to find descendants'
      );
    };

    let currentLevelNodes = await loadRoots();
    let depth = 0;

    while (currentLevelNodes.length > 0 && (level === undefined || depth <= level)) {
      const nextParentIds: string[] = [];
      const uniqueCurrentLevel = currentLevelNodes.filter(node => {
        const nodeId = String(node[primaryKeyColumn]);
        if (visited.has(nodeId)) {
          return false;
        }

        visited.add(nodeId);
        nextParentIds.push(nodeId);
        return true;
      });

      if (uniqueCurrentLevel.length === 0) {
        break;
      }

      // 带 where 时 hasChildren 另有来源（见 loadParentsWithChildren），
      // 所以最后一层不必再白拉一次被过滤的子节点。
      const needsChildren = level === undefined || depth < level || (hasChildrenFeature === true && !where);
      const nextLevelNodes = needsChildren && nextParentIds.length > 0 ? await loadChildren(nextParentIds) : [];
      const parentsWithChildren =
        hasChildrenFeature ? await loadParentsWithChildren(nextParentIds, nextLevelNodes) : undefined;

      for (const node of uniqueCurrentLevel) {
        const entity = this.transformRowToEntity(node);

        if (parentsWithChildren) {
          (entity as Record<string, unknown>)['hasChildren'] = parentsWithChildren.has(String(node[primaryKeyColumn]));
        }

        results.push(entity);
      }

      currentLevelNodes = level === undefined || depth < level ? nextLevelNodes : [];
      depth += 1;
    }

    return results;
  }

  /**
   * 基于实体表的祖先节点查询
   *
   * @remarks
   * 起点与 sqlite-core / PGlite 递归 CTE 的锚点成员同一判据（`entityId == null ? parentId is null : id = ?`）：
   * - 指定 entityId：自底向上逐跳取当前节点及其祖先链，见 `selectAncestorChain`；
   * - 不指定（全树）：起点是全部根节点。递归成员 `children.id = c.parentId` 在根上找不到任何节点，
   *   结果就是全部根（按主键升序），起点不过 where、不受 level 限制。树插件的实时 merge
   *   按同一口径把新根并进结果，这里若返回空，同一个活查询的首查与增量就会前后矛盾。
   */
  private async findAncestorsFromTable(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { entityId, where } = options;
    const level = assertOptionalNonNegativeSafeInteger(
      options.level,
      `tree query 'level' must be a non-negative integer, received: ${String(options.level)}`
    );

    const rows =
      entityId == null ?
        await this.selectRootRows('Failed to find ancestors')
      : await this.selectAncestorChain(entityId as RxDBEntityId, where, level);

    if (rows.length === 0) return [];

    const hasChildrenFeature = this.metadata.features?.tree?.hasChildren;
    const primaryKeyColumn = this.primary_key_column();
    const parentColumnName = this.parent_column_name();

    // hasChildren 批量判定，避免每个节点再来一次往返
    let parentsWithChildren: Set<string> | undefined;
    if (hasChildrenFeature) {
      const ids = rows.map(node => String(node[primaryKeyColumn]));
      parentsWithChildren = await this.findParentsWithChildren(
        (chunk, rangeFrom, rangeTo) =>
          this.table_client()
            .select(parentColumnName)
            .in(parentColumnName, chunk)
            .order(primaryKeyColumn, { ascending: true })
            .range(rangeFrom, rangeTo),
        ids,
        'Failed to find ancestors'
      );
    }

    const results: InstanceType<T>[] = rows.map(node => {
      const entity = this.transformRowToEntity(node);
      if (parentsWithChildren) {
        (entity as Record<string, unknown>)['hasChildren'] = parentsWithChildren.has(String(node[primaryKeyColumn]));
      }
      return entity;
    });

    return results;
  }

  /**
   * 自底向上逐跳取当前节点及其祖先链的行
   *
   * @remarks
   * 不一次性拉整张表：整表 `select('*')` 会被 PostgREST 的 `max-rows`（默认 1000）**静默截断** ——
   * 目标节点或其祖先落在截断之外时，内存回溯会在未命中处提前 break，
   * 返回不完整的祖先链且不报任何错。往返次数由树深度决定（给了 level 时 ≤ level + 1），
   * 树的深度天然有界，代价可控。
   */
  private async selectAncestorChain(
    entityId: RxDBEntityId,
    where: FindTreeOptions<T>['where'],
    level: number | undefined
  ): Promise<Record<string, unknown>[]> {
    const primaryKeyColumn = this.primary_key_column();
    const parentColumnName = this.parent_column_name();
    const rows: Record<string, unknown>[] = [];
    // 环检测按字符串归一：PostgREST 回来的 parentId 可能是 number 也可能是 string
    const seen = new Set<string>();
    let currentId: RxDBEntityId | null = entityId;
    let currentLevel = 0;

    // `!= null` 而非 truthy：`parentId: 0` 指向的是 id 为 0 的真实父节点，不是根
    while (currentId != null && (level === undefined || currentLevel <= level)) {
      // 环保护：不传 level 时它就是唯一的终止条件；给了 level 时也不该让循环跑满 level 次
      const seenKey = String(currentId);
      if (seen.has(seenKey)) break;
      seen.add(seenKey);

      // where 只作用于往上的每一跳（递归成员），起点豁免：
      // 某一级祖先不匹配即断链，它上面的整条链都不再返回，即使更高处的节点自身匹配。
      // 与 findDescendants 及 sqlite-core 的 children_where 同一套语义。
      const hopQuery = this.table_client().select('*').eq(primaryKeyColumn, currentId);
      const { data, error, status } = await (currentLevel === 0 ? hopQuery : this.applyWhere(hopQuery, where)).limit(1);
      assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to find ancestors');
      const node = data?.[0] as Record<string, unknown> | undefined;
      if (!node) break;

      rows.push(node);
      currentId = (node[parentColumnName] as RxDBEntityId | null | undefined) ?? null;
      currentLevel++;
    }

    return rows;
  }

  /**
   * 翻页取出全部根节点（`parentId` 为空）的行，按主键升序
   *
   * @remarks
   * 全树查询（不指定 entityId）的起点，findDescendants 与 findAncestors 共用。
   * 对齐 sqlite-core / PGlite 递归 CTE 的锚点成员 `parentId is null`：不带 where、不受 level 限制。
   * 根节点可能有任意多个，必须翻页，否则会被 PostgREST 的 `max-rows` 静默截断。
   */
  private selectRootRows(errorMessage: string): Promise<Record<string, unknown>[]> {
    const tableClient = this.table_client();
    const primaryKeyColumn = this.primary_key_column();
    const parentColumnName = this.parent_column_name();

    return select_all_pages<Record<string, unknown>>(
      this.rxdb.reachability,
      (rangeFrom, rangeTo) =>
        tableClient
          .select('*')
          .is(parentColumnName, null)
          .order(primaryKeyColumn, { ascending: true })
          .range(rangeFrom, rangeTo),
      errorMessage
    );
  }

  /**
   * 树计数的口径，countDescendants 与 countAncestors 共用
   *
   * @remarks
   * 指定 entityId 时不含当前节点（节点不存在时结果为空，钳在 0 避免返回负数）；不指定时（全树）一个不扣。
   * 对齐 sqlite-core 的 `isFindRoot ? count(*) : max(count(*)-1, 0)`。
   * `!= null` 而非 truthy：整数主键 0 是合法 id，与 sqlite-core / PGlite 的判据一致。
   */
  private countTreeNodes(nodes: readonly unknown[], entityId: FindTreeOptions<T>['entityId']): number {
    return entityId != null ? Math.max(0, nodes.length - 1) : nodes.length;
  }

  /**
   * 把树查询的 `where` 应用到某一跳的查询上
   *
   * @remarks
   * 只用于递归成员（子节点 / 上一级祖先），**不**用于起点 ——
   * 起点是否匹配不影响它自身是否返回，见两处调用点的说明。
   * `where` 缺省时原样返回。
   */
  private applyWhere<TQuery>(query: TQuery, where: FindTreeOptions<T>['where']): TQuery {
    if (!where) {
      return query;
    }

    return apply_rule_group(query, where as RuleGroup<InstanceType<T>>, this.metadata, this.adapter.rxdb.schemaManager);
  }

  /**
   * 找出给定节点中「至少有一个子节点」的那些
   *
   * @remarks
   * PostgREST 没有 `DISTINCT`，只能把子行拉回来去重。因此这里做两件事：
   * 分块发 `in()`（查询串长度）+ 块内翻页（`max-rows` 截断）。
   * 翻页时一旦本块的每个 id 都已判定为「有子节点」，剩余页就没有信息量，直接停 ——
   * 否则为了几个布尔值可能要把整棵子树的行拉一遍。
   */
  private async findParentsWithChildren(
    build_page: (chunk: string[], from: number, to: number) => PromiseLike<ChildRowsResponse>,
    ids: string[],
    errorMessage: string
  ): Promise<Set<string>> {
    const parents = new Set<string>();

    for (const chunk of chunk_values(ids)) {
      const pending = new Set(chunk);

      for (let offset = 0; pending.size > 0; offset += SUPABASE_PAGE_SIZE) {
        const { data, error, status } = await build_page(chunk, offset, offset + SUPABASE_PAGE_SIZE - 1);
        assert_postgrest_ok(this.rxdb.reachability, { error, status }, errorMessage);

        const page = data ?? [];
        this.collectParents(page, parents, pending);
        if (page.length < SUPABASE_PAGE_SIZE) break;
      }
    }

    return parents;
  }

  /** 把一页子行里出现过的 parentId 记入结果集，并从待判定集合中移除 */
  private collectParents(page: unknown[], parents: Set<string>, pending: Set<string>): void {
    for (const row of page) {
      const parentId = (row as Record<string, unknown>)[this.parent_column_name()];
      if (parentId == null) continue;

      const parentKey = String(parentId);
      parents.add(parentKey);
      pending.delete(parentKey);
    }
  }

  /**
   * 将数据库行转换为实体
   */
  private transformRowToEntity(row: Record<string, unknown>): InstanceType<T> {
    const entityRow = { ...row };
    delete entityRow['level'];
    const entity = transform_row_to_entity(this.EntityType, this.metadata, entityRow);
    return entity;
  }

  /**
   * 父节点外键的远端列名，固定为属性名 `parentId`
   *
   * @remarks
   * 与 CRUD 同口径：外键同样遵守「非主键字段的远端列名就是属性名」，`create` 展开实体、
   * `update` 经 `normalize_supabase_update` 映回属性名，写的都是 `parentId`。
   * parent 关系上声明的 columnName 只对本地适配器生效，树查询改按它查就会与写入打不中同一列。
   */
  private parent_column_name(): string {
    return 'parentId';
  }

  /** 本实体的远端表；树查询一律显式带 schema（缺省 `public`） */
  private table_client() {
    const schema = resolve_supabase_schema(this.metadata.namespace) ?? 'public';
    return this.adapter.client.schema(schema).from(this.metadata.tableName);
  }
}
