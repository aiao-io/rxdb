/** 无表格渲染依赖的实体列表状态。 */
import type { OrderBy } from '@aiao/rxdb';
import type { EntityCapabilities } from '../entity-capabilities.js';
import type { EntityInstance } from './types.js';

/** 当前查询、分页、选择、记录及能力约束的列表快照。 */
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

/** 列表动作或数据源推进状态时发出的事件。 */
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

/** 列表初始状态、查询数据源与持久化动作。 */
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
  #viewEpoch = 0;
  readonly #updateQueues = new Map<string, Promise<unknown>>();
  #snapshot: EntityListSnapshot<T>;
  #disposed = false;

  /** 读取当前列表状态；实体实例保留原有方法。 */
  get snapshot(): EntityListSnapshot<T> {
    return this.#snapshot;
  }

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

  /** 订阅后续状态变化，返回取消订阅函数。 */
  subscribe(listener: ListListener<T>): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** 切换查询并清除旧页与待完成请求，随后可调用 refresh 取数。 */
  setQuery(query: unknown): void {
    this.#assertActive();
    if (Object.is(this.#query, query)) return;
    this.#invalidatePending(true);
    this.#query = query;
    this.#page = 0;
    this.#error = null;
    this.#publish({ type: 'queryChanged', query });
  }
  /** 替换排序规则并回到第一页，丢弃旧查询结果。 */
  setSorts(sorts: readonly OrderBy[]): void {
    this.#assertActive();
    if (
      this.#sorts.length === sorts.length &&
      this.#sorts.every((sort, index) => sort.field === sorts[index]?.field && sort.sort === sorts[index]?.sort)
    )
      return;
    this.#invalidatePending(true);
    this.#sorts = [...sorts];
    this.#page = 0;
    this.#error = null;
    this.#publish({ type: 'statusChanged' });
  }
  /** 设置从零开始的页码和每页条数，丢弃旧页。 */
  setPage(page: number, pageSize = this.#pageSize): void {
    this.#assertActive();
    this.#invalidatePending(true);
    this.#page = Math.max(0, page);
    this.#pageSize = Math.max(1, pageSize);
    this.#error = null;
    this.#publish({ type: 'pageChanged', page: this.#page, pageSize: this.#pageSize });
  }
  /** 用宿主记录替换当前页，可同时提供总数。 */
  setRecords(records: readonly T[], total?: number): void {
    this.#assertActive();
    this.#invalidatePending(false);
    this.#records = [...records];
    this.#total = total;
    this.#error = null;
    const known = new Set(this.#records.map(record => record.id));
    this.#selectedIds = this.#selectedIds.filter(id => known.has(id));
    this.#publish({ type: 'recordsChanged', records: this.#records });
  }
  /** 更新由宿主管理的数据源加载状态。 */
  setLoading(loading: boolean): void {
    this.#assertActive();
    this.#loading = loading;
    this.#publish({ type: 'statusChanged' });
  }
  /** 暴露宿主数据源或写入动作的错误。 */
  setError(error: unknown): void {
    this.#assertActive();
    this.#error = error;
    this.#publish({ type: 'statusChanged' });
  }
  /** 替换现有能力约束，后续写入动作按新约束判定。 */
  setCapabilities(capabilities: EntityCapabilities | undefined): void {
    this.#assertActive();
    this.#capabilities = capabilities;
    this.#publish({ type: 'statusChanged' });
  }

  /** 执行当前查询；刷新期间保留旧页，成功后替换，失败时保留旧页并暴露错误。 */
  async refresh(loader = this.#load): Promise<readonly T[]> {
    this.#assertActive();
    if (!loader) return this.#records;
    const requestId = ++this.#requestId;
    this.#abortController?.abort();
    const controller = new AbortController();
    this.#abortController = controller;
    this.#loading = true;
    this.#error = null;
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
      this.#records = [...result.records];
      this.#total = result.total;
      this.#selectedIds = this.#selectedIds.filter(id => this.#records.some(record => record.id === id));
      this.#publish({ type: 'recordsChanged', records: this.#records });
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

  /** 创建实体；有查询数据源时保存成功后重新加载当前页。 */
  async create(data: Record<string, unknown>): Promise<T> {
    this.#assertActive();
    if (this.#capabilities && !this.#capabilities.canCreate) throw new Error('Entity creation is not allowed');
    if (!this.#onCreate) throw new Error('EntityListController has no create action');
    const epoch = this.#viewEpoch;
    this.#beginMutation();
    const created = await this.#onCreate(data);
    if (this.#disposed || epoch !== this.#viewEpoch) return created;
    this.#beginMutation();
    if (this.#isConstrainedView() && !this.#load) {
      this.#records = [];
      this.#total = undefined;
      this.#selectedIds = [];
      this.#publish({ type: 'created', record: created });
      return created;
    }
    this.#records = [...this.#records, created].slice(0, this.#pageSize);
    if (this.#total !== undefined) this.#total++;
    this.#publish({ type: 'created', record: created });
    if (this.#load) await this.refresh();
    return created;
  }

  /** 更新实体；同一实体的并发更新按调用顺序执行并保留实例方法。 */
  async update(id: string, changes: Record<string, unknown>): Promise<T> {
    this.#assertActive();
    const fallback = this.#records.find(item => item.id === id);
    if (!fallback) throw new Error(`Unknown entity: ${id}`);
    const viewEpoch = this.#viewEpoch;
    const previous = this.#updateQueues.get(id);
    const run = async (): Promise<T> => {
      if (this.#disposed || viewEpoch !== this.#viewEpoch) return fallback;
      this.#assertActive();
      if (this.#capabilities && !this.#capabilities.canEdit) throw new Error('Entity update is not allowed');
      if (!this.#onUpdate) throw new Error('EntityListController has no update action');
      const record = this.#records.find(item => item.id === id);
      if (!record) throw new Error(`Unknown entity: ${id}`);
      const epoch = this.#viewEpoch;
      this.#beginMutation();
      const replacement = await this.#onUpdate(record, changes);
      if (this.#disposed || epoch !== this.#viewEpoch) return record;
      this.#beginMutation();
      if (this.#isConstrainedView() && !this.#load) {
        this.#records = [];
        this.#total = undefined;
        this.#selectedIds = [];
        this.#publish({ type: 'updated', record: replacement ?? record });
        return replacement ?? record;
      }
      const updated = replacement ?? record;
      this.#records = this.#records.map(item => (item.id === id ? updated : item));
      this.#publish({ type: 'updated', record: updated });
      if (this.#load) await this.refresh();
      return updated;
    };
    const operation = previous ? previous.catch(() => undefined).then(run) : run();
    const tracked = operation.finally(() => {
      if (this.#updateQueues.get(id) === tracked) this.#updateQueues.delete(id);
    });
    this.#updateQueues.set(id, tracked);
    return tracked as Promise<T>;
  }

  /** 删除实体；部分成功时先收敛成功项，再以 AggregateError 报告失败项。 */
  async remove(ids: readonly string[]): Promise<void> {
    this.#assertActive();
    if (this.#capabilities && !this.#capabilities.canDelete) throw new Error('Entity deletion is not allowed');
    if (!this.#onDelete) throw new Error('EntityListController has no delete action');
    const epoch = this.#viewEpoch;
    this.#beginMutation();
    const targets = this.#records.filter(record => ids.includes(record.id));
    const settled = await Promise.allSettled(
      targets.map(record => Promise.resolve().then(() => this.#onDelete!(record)))
    );
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    const failure =
      failures.length > 0 ?
        new AggregateError(
          failures.map(result => result.reason),
          'Some entity deletions failed'
        )
      : undefined;
    if (this.#disposed || epoch !== this.#viewEpoch) {
      if (failure) throw failure;
      return;
    }
    this.#beginMutation();
    const deleted = new Set(
      targets.filter((_record, index) => settled[index]?.status === 'fulfilled').map(record => record.id)
    );
    if (deleted.size > 0) {
      if (this.#isConstrainedView() && !this.#load) {
        this.#records = [];
        this.#selectedIds = [];
        this.#total = undefined;
      } else {
        this.#records = this.#records.filter(record => !deleted.has(record.id));
        this.#selectedIds = this.#selectedIds.filter(id => !deleted.has(id));
        if (this.#total !== undefined) this.#total = Math.max(0, this.#total - deleted.size);
      }
      this.#publish({ type: 'deleted', ids: [...deleted] });
    }
    if (failure) throw failure;
    if (this.#load && deleted.size > 0) await this.refresh();
  }

  /** 选择当前页中存在的实体，自动去重和过滤未知 ID。 */
  select(ids: readonly string[]): void {
    this.#assertActive();
    const known = new Set(this.#records.map(record => record.id));
    this.#selectedIds = [...new Set(ids)].filter(id => known.has(id));
    this.#publish({ type: 'selectionChanged', selectedIds: this.#selectedIds });
  }
  /** 切换一个实体的选择状态。 */
  toggleSelection(id: string): void {
    this.select(
      this.#selectedIds.includes(id) ? this.#selectedIds.filter(item => item !== id) : [...this.#selectedIds, id]
    );
  }
  /** 清空当前选择。 */
  clearSelection(): void {
    this.select([]);
  }

  /** 中止查询并移除订阅，销毁后的迟到结果不会回写。 */
  dispose(): void {
    this.#disposed = true;
    this.#requestId++;
    this.#viewEpoch++;
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

  #beginMutation(): number {
    this.#assertActive();
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#requestId++;
    this.#loading = false;
    return this.#viewEpoch;
  }

  #isConstrainedView(): boolean {
    return this.#query !== undefined || this.#sorts.length > 0 || this.#page > 0;
  }

  #invalidatePending(clearRecords: boolean): void {
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#requestId++;
    this.#viewEpoch++;
    this.#loading = false;
    if (clearRecords) {
      this.#records = [];
      this.#total = undefined;
      this.#selectedIds = [];
    }
  }
}

/** 创建不依赖展示层的实体列表控制器。 */
export function createEntityListController<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): EntityListController<T> {
  return new EntityListController(options);
}
/** 实体列表控制器工厂的 headless 别名。 */
export const createEntityListHeadless = createEntityListController;
