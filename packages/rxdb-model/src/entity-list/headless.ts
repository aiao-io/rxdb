/** 无表格渲染依赖的实体列表状态。 */
import type { OrderBy } from '@aiao/rxdb';
import type { EntityCapabilities } from '../entity-capabilities.js';
import type { EntityInstance } from './types.js';

export interface EntityListSnapshot<T extends EntityInstance = EntityInstance> {
  readonly query: unknown;
  readonly sorts: readonly OrderBy[];
  readonly page: number;
  readonly pageSize: number;
  readonly records: readonly T[];
  /** 已知总数；数据源未提供时为空。 */
  readonly total: number | undefined;
  /** 是否还有下一页；数据源未提供总数时为空。 */
  readonly hasNext: boolean | undefined;
  readonly selectedIds: readonly string[];
  readonly loading: boolean;
  readonly error: unknown;
  readonly capabilities?: EntityCapabilities;
}

export type EntityListEvent<T extends EntityInstance = EntityInstance> =
  | { readonly type: 'queryChanged'; readonly query: unknown }
  | { readonly type: 'pageChanged'; readonly page: number; readonly pageSize: number }
  | { readonly type: 'recordsChanged'; readonly records: readonly T[] }
  | { readonly type: 'selectionChanged'; readonly selectedIds: readonly string[] }
  | { readonly type: 'loadStarted' }
  | { readonly type: 'loadFinished'; readonly records: readonly T[] }
  | { readonly type: 'created'; readonly record: T }
  | { readonly type: 'updated'; readonly record: T }
  | { readonly type: 'deleted'; readonly ids: readonly string[] }
  | { readonly type: 'statusChanged' };

/** 查询数据源收到的请求上下文。 */
export interface EntityListLoadContext {
  readonly query: unknown;
  readonly sorts: readonly OrderBy[];
  readonly page: number;
  readonly pageSize: number;
  readonly signal: AbortSignal;
}

/** 列表查询结果。 */
export interface EntityListLoadResult<T extends EntityInstance = EntityInstance> {
  readonly records: readonly T[];
  readonly total?: number;
}

export interface EntityListControllerOptions<T extends EntityInstance = EntityInstance> {
  readonly query?: unknown;
  readonly sorts?: readonly OrderBy[];
  readonly page?: number;
  readonly pageSize?: number;
  readonly records?: readonly T[];
  readonly capabilities?: EntityCapabilities;
  /** 查询数据源；返回值过期时会自动丢弃。 */
  readonly load?: (context: EntityListLoadContext) => Promise<EntityListLoadResult<T>> | EntityListLoadResult<T>;
  readonly onCreate?: (data: Record<string, unknown>) => Promise<T> | T;
  readonly onUpdate?: (record: T, changes: Record<string, unknown>) => Promise<T | void> | T | void;
  readonly onDelete?: (record: T) => Promise<void> | void;
}

type ListListener<T extends EntityInstance> = (snapshot: EntityListSnapshot<T>, event: EntityListEvent<T>) => void;

/** 列表筛选、分页、选择与数据状态的共享控制器。 */
export class EntityListController<T extends EntityInstance = EntityInstance> {
  readonly #listeners = new Set<ListListener<T>>();
  #query: unknown;
  #sorts: OrderBy[];
  #page: number;
  #pageSize: number;
  #records: T[];
  #total: number | undefined;
  #selectedIds: string[] = [];
  #loading = false;
  #error: unknown = null;
  #capabilities?: EntityCapabilities;
  readonly #load?: EntityListControllerOptions<T>['load'];
  readonly #onCreate?: EntityListControllerOptions<T>['onCreate'];
  readonly #onUpdate?: EntityListControllerOptions<T>['onUpdate'];
  readonly #onDelete?: EntityListControllerOptions<T>['onDelete'];
  #requestId = 0;
  #abortController: AbortController | undefined;
  #snapshot: EntityListSnapshot<T>;
  #disposed = false;

  constructor(options: EntityListControllerOptions<T> = {}) {
    this.#query = options.query;
    this.#sorts = [...(options.sorts ?? [])];
    this.#page = Math.max(0, options.page ?? 0);
    this.#pageSize = Math.max(1, options.pageSize ?? 25);
    this.#records = [...(options.records ?? [])];
    this.#total = undefined;
    this.#capabilities = options.capabilities;
    this.#load = options.load;
    this.#onCreate = options.onCreate;
    this.#onUpdate = options.onUpdate;
    this.#onDelete = options.onDelete;
    this.#snapshot = this.#buildSnapshot();
  }

  get snapshot(): EntityListSnapshot<T> {
    return this.#snapshot;
  }
  subscribe(listener: ListListener<T>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  setQuery(query: unknown): void {
    this.#assertActive();
    if (Object.is(this.#query, query)) return;
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#requestId++;
    this.#query = query;
    this.#page = 0;
    this.#loading = false;
    this.#publish({ type: 'queryChanged', query });
  }
  setSorts(sorts: readonly OrderBy[]): void {
    this.#assertActive();
    if (
      this.#sorts.length === sorts.length &&
      this.#sorts.every((sort, index) => sort.field === sorts[index]?.field && sort.sort === sorts[index]?.sort)
    )
      return;
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#requestId++;
    this.#sorts = [...sorts];
    this.#page = 0;
    this.#loading = false;
    this.#publish({ type: 'statusChanged' });
  }
  setPage(page: number, pageSize = this.#pageSize): void {
    this.#assertActive();
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#requestId++;
    this.#page = Math.max(0, page);
    this.#pageSize = Math.max(1, pageSize);
    this.#loading = false;
    this.#publish({ type: 'pageChanged', page: this.#page, pageSize: this.#pageSize });
  }
  setRecords(records: readonly T[], total?: number): void {
    this.#assertActive();
    this.#records = [...records];
    this.#total = total;
    const known = new Set(this.#records.map(record => record.id));
    this.#selectedIds = this.#selectedIds.filter(id => known.has(id));
    this.#publish({ type: 'recordsChanged', records: this.#records });
  }
  setLoading(loading: boolean): void {
    this.#assertActive();
    this.#loading = loading;
    this.#publish({ type: 'statusChanged' });
  }
  setError(error: unknown): void {
    this.#assertActive();
    this.#error = error;
    this.#publish({ type: 'statusChanged' });
  }
  setCapabilities(capabilities: EntityCapabilities | undefined): void {
    this.#assertActive();
    this.#capabilities = capabilities;
    this.#publish({ type: 'statusChanged' });
  }

  /** 执行当前查询；查询切换后旧结果不会写入新状态。 */
  async refresh(loader = this.#load): Promise<readonly T[]> {
    this.#assertActive();
    if (!loader) return this.#records;
    const requestId = ++this.#requestId;
    this.#abortController?.abort();
    const controller = new AbortController();
    this.#abortController = controller;
    this.#loading = true;
    this.#error = null;
    this.#records = [];
    this.#total = undefined;
    this.#selectedIds = [];
    this.#publish({ type: 'loadStarted' });
    try {
      const result = await loader({
        query: this.#query,
        sorts: [...this.#sorts],
        page: this.#page,
        pageSize: this.#pageSize,
        signal: controller.signal
      });
      if (this.#disposed || requestId !== this.#requestId) return this.#records;
      this.#abortController = undefined;
      this.#loading = false;
      this.setRecords(result.records, result.total);
      this.#publish({ type: 'loadFinished', records: this.#records });
      return this.#records;
    } catch (error) {
      if (this.#disposed || requestId !== this.#requestId) return this.#records;
      this.#abortController = undefined;
      this.#loading = false;
      this.#error = error;
      this.#publish({ type: 'statusChanged' });
      throw error;
    }
  }

  async create(data: Record<string, unknown>): Promise<T> {
    this.#assertActive();
    if (this.#capabilities && !this.#capabilities.canCreate) throw new Error('Entity creation is not allowed');
    if (!this.#onCreate) throw new Error('EntityListController has no create action');
    const created = await this.#onCreate(data);
    this.#records = [...this.#records, created];
    this.#publish({ type: 'created', record: created });
    return created;
  }

  async update(id: string, changes: Record<string, unknown>): Promise<T> {
    this.#assertActive();
    if (this.#capabilities && !this.#capabilities.canEdit) throw new Error('Entity update is not allowed');
    if (!this.#onUpdate) throw new Error('EntityListController has no update action');
    const record = this.#records.find(item => item.id === id);
    if (!record) throw new Error(`Unknown entity: ${id}`);
    const updated = (await this.#onUpdate(record, changes)) ?? ({ ...record, ...changes } as T);
    this.#records = this.#records.map(item => (item.id === id ? updated : item));
    this.#publish({ type: 'updated', record: updated });
    return updated;
  }

  async remove(ids: readonly string[]): Promise<void> {
    this.#assertActive();
    if (this.#capabilities && !this.#capabilities.canDelete) throw new Error('Entity deletion is not allowed');
    if (!this.#onDelete) throw new Error('EntityListController has no delete action');
    const targets = this.#records.filter(record => ids.includes(record.id));
    await Promise.all(targets.map(record => this.#onDelete!(record)));
    const deleted = new Set(targets.map(record => record.id));
    this.#records = this.#records.filter(record => !deleted.has(record.id));
    this.#selectedIds = this.#selectedIds.filter(id => !deleted.has(id));
    this.#publish({ type: 'deleted', ids: [...deleted] });
  }

  select(ids: readonly string[]): void {
    this.#assertActive();
    const known = new Set(this.#records.map(record => record.id));
    this.#selectedIds = [...new Set(ids)].filter(id => known.has(id));
    this.#publish({ type: 'selectionChanged', selectedIds: this.#selectedIds });
  }
  toggleSelection(id: string): void {
    this.select(
      this.#selectedIds.includes(id) ? this.#selectedIds.filter(item => item !== id) : [...this.#selectedIds, id]
    );
  }
  clearSelection(): void {
    this.select([]);
  }

  dispose(): void {
    this.#disposed = true;
    this.#requestId++;
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#listeners.clear();
  }

  #buildSnapshot(): EntityListSnapshot<T> {
    return {
      query: this.#query,
      sorts: [...this.#sorts],
      page: this.#page,
      pageSize: this.#pageSize,
      records: [...this.#records],
      total: this.#total,
      hasNext: this.#total === undefined ? undefined : (this.#page + 1) * this.#pageSize < this.#total,
      selectedIds: [...this.#selectedIds],
      loading: this.#loading,
      error: this.#error,
      capabilities: this.#capabilities
    };
  }
  #publish(event: EntityListEvent<T>): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot, event);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('EntityListController has been disposed');
  }
}

export function createEntityListController<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): EntityListController<T> {
  return new EntityListController(options);
}
export const createEntityListHeadless = createEntityListController;
