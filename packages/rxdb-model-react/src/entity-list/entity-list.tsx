/**
 * @fileoverview 实体列表组件（Angular `EntityListComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：以 namespace + name 定位实体元数据，提供无限滚动表格
 * （`useInfiniteScroll` 等价 Angular 的 `InfiniteScrollingList`）、行内编辑批量合并落库
 * （`entityManager.mutations`）、撤销/重做（`@aiao/rxdb-plugin-history`）、
 * 筛选弹层（内嵌 QueryBuilder）、级联新增与多对多选择模式、列头排序驱动 cursor orderBy 重查。
 *
 * 差异：CDK Overlay / Dialog 换成包内 {@link Dialog} 与固定定位弹层（对外交互语义一致）；
 * RxDB 经 `@aiao/rxdb-react` 的 `useRxDB` 获取（Angular DI 的等价物）。
 *
 * @module entity-list
 */
import {
  RelationKind,
  getEntityMetadata,
  type EntityType,
  type FindByCursorOptions,
  type HistoryScopeAPI
} from '@aiao/rxdb';
import {
  actionsColumn,
  buildEditableColumns,
  buildFormFields,
  cn,
  extractFieldsFromMetadata,
  organizeFields,
  parsePropertyColumnValue,
  type BatchChangeItem,
  type CellChangeEvent,
  type EntityFormData,
  type EntityTableRecord,
  type FieldMetadata,
  type FormFieldConfig,
  type ModelInfo,
  type RelatedEntityProvider,
  type ValidationResult
} from '@aiao/rxdb-model';
import { useInfiniteScroll, useRxDB, type InfiniteScrollResource } from '@aiao/rxdb-react';
import type { ColumnDefine } from '@visactor/vtable/es/ts-types/index.js';
import { Funnel, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import { of } from 'rxjs';
import { Dialog } from '../dialog/dialog';
import { EntityDetail, type EntityDetailDialogData } from '../entity-detail/entity-detail';
import { EntityDialog } from '../entity-dialog/entity-dialog';
import { QueryTable } from '../entity-table/query-table';
import { QueryBuilder } from '../query-builder/query-builder/query-builder';
import './entity-list.css';

/** RxDB 实体实例（用于 CRUD 操作）。 */
export type EntityInstance = {
  [key: string]: unknown;
  readonly id: string;
  save(): Promise<void>;
  remove(): Promise<void>;
};

/** 筛选查询结构。 */
export type FilterQuery = { combinator: 'and' | 'or'; rules: unknown[] };

const EMPTY_FILTER: FilterQuery = { combinator: 'and', rules: [] };

/** 列表列头排序状态（normal = 默认 id desc）。 */
type ListSortState = { field: string; order: 'asc' | 'desc' | 'normal' };

const DEFAULT_SORT_STATE: ListSortState = { field: 'id', order: 'normal' };

/** 规范化 VTable sort_click 的 field，拒绝 actions / 空字段。 */
function normalizeSortField(field: unknown): string | undefined {
  if (typeof field !== 'string') return undefined;
  const trimmed = field.trim();
  if (!trimmed || trimmed === 'actions') return undefined;
  return trimmed;
}

/** 将 VTable order 规范为 asc | desc | normal。 */
function normalizeSortOrder(order: unknown): ListSortState['order'] {
  if (typeof order !== 'string') return 'normal';
  const lower = order.toLowerCase();
  if (lower === 'asc' || lower === 'desc' || lower === 'normal') return lower;
  return 'normal';
}

/** 构造 FindByCursor 所需 orderBy：normal → id desc；用户字段 → [field, id] 同向。 */
function buildCursorOrderBy(state: ListSortState): Array<{ field: string; sort: 'asc' | 'desc' }> {
  if (state.order === 'normal' || !state.field) {
    return [{ field: 'id', sort: 'desc' }];
  }
  if (state.field === 'id') {
    return [{ field: 'id', sort: state.order }];
  }
  return [
    { field: state.field, sort: state.order },
    { field: 'id', sort: state.order }
  ];
}

/** 解析外部导航传入的筛选条件 JSON 字符串，格式非法时静默忽略。 */
function parseInitialFilter(raw: string | undefined): FilterQuery | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as FilterQuery).rules)) {
      return parsed as FilterQuery;
    }
  } catch {
    // 忽略非法 JSON，保持空筛选
  }
  return undefined;
}

/** 未装配历史插件时的空历史作用域（与 Angular 侧回退一致）。 */
const DEFAULT_HISTORY_FALLBACK: HistoryScopeAPI = {
  type: 'database',
  histories$: of([]),
  undoHistories$: of([]),
  redoHistories$: of([]),
  count$: of(0),
  undoCount$: of(0),
  redoCount$: of(0),
  undo: async () => undefined,
  redo: async () => undefined
};

/** 打开的对话框状态（对应 Angular 侧 DialogRef 的三种用途；详情数据在打开时快照）。 */
type OpenDialog =
  | { kind: 'create'; data: EntityDetailDialogData }
  | { kind: 'view'; recordId: string; data: EntityDetailDialogData }
  | { kind: 'm2m' };

/** {@link EntityList} 的 props。 */
export interface EntityListProps {
  /** 实体命名空间（必填）。 */
  namespace: string;
  /** 实体名（必填）。 */
  name: string;
  /** 固定查询条件，与用户筛选条件做 AND 合并（用于关系属性过滤）。 */
  fixedQuery?: FilterQuery;
  /** 外部导航传入的初始筛选条件（JSON 字符串）。 */
  initialFilter?: string;
  /** 预填充的外键数据（级联新增时传递给子实体对话框）。 */
  fixedFormData?: EntityFormData;
  /** 草稿父实体（级联新增场景）。 */
  draftParentEntity?: EntityInstance | null;
  /** 父实体上关系属性名（如 'children'）。 */
  parentRelationName?: string;
  /** 创建链路中的实体类型（namespace:name），用于阻断循环创建。 */
  creationChain?: string[];
  /** 已打开详情对话框的记录 id 栈（含祖先记录），防无限套娃。 */
  editChain?: string[];
  /** 关系类型（MANY_TO_MANY 时启用选择模式入口）。 */
  relationKind?: RelationKind;
  /** 父实体实例（用于 M2M 关系操作）。 */
  parentEntity?: EntityInstance | null;
  /** 列表模式：default=普通列表, select=选择模式（带 checkbox 列）。 */
  mode?: 'default' | 'select';
  /** 已关联的实体 ID 集合（选择模式下过滤掉）。 */
  alreadyLinkedIds?: Set<string>;
  /** 点击「查看」按钮时触发，携带对应行记录。 */
  onViewEntity?: (record: EntityTableRecord) => void;
  /** 选择模式：确认选择时触发，携带选中的实体实例。 */
  onSelectionConfirmed?: (entities: EntityInstance[]) => void;
  /** 选择模式：取消选择时触发。 */
  onSelectionCancelled?: () => void;
}

/**
 * 实体列表组件：无限滚动表格 + 行内编辑 + 撤销/重做 + 筛选弹层 + 级联新增 + M2M 选择模式。
 */
export function EntityList({
  namespace,
  name,
  fixedQuery,
  initialFilter,
  fixedFormData,
  draftParentEntity,
  parentRelationName,
  creationChain = [],
  editChain = [],
  relationKind,
  parentEntity,
  mode = 'default',
  alreadyLinkedIds = new Set(),
  onViewEntity,
  onSelectionConfirmed,
  onSelectionCancelled
}: EntityListProps): JSX.Element {
  const rxdb = useRxDB();

  const entityKey = `${namespace}:${name}`;

  // ── 实体注册表（Angular 侧构造时初始化）─────────────────────────────
  const entityClsMap = useMemo(() => {
    const map = new Map<string, EntityType>();
    for (const cls of rxdb.config.entities) {
      const meta = getEntityMetadata(cls);
      map.set(`${meta.namespace}:${meta.name}`, cls);
    }
    return map;
  }, [rxdb]);

  const modelInfoMap = useMemo(() => {
    const map = new Map<string, ModelInfo>();
    for (const cls of rxdb.config.entities) {
      const meta = getEntityMetadata(cls);
      map.set(meta.name, {
        name: meta.name,
        displayName: meta.displayName ?? meta.name,
        entityClass: cls as new (...args: unknown[]) => unknown,
        metadata: meta
      });
    }
    return map;
  }, [rxdb]);

  // ── 列表槽位：为配置内全部实体 + 它们的外键关联实体各维护一个活查询列表 ──
  // （Angular 侧 columnsCache 在构造时为每个实体的 FK 关系 eager 创建 InfiniteScrollingList）
  const listKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const cls of rxdb.config.entities) {
      const meta = getEntityMetadata(cls);
      keys.add(`${meta.namespace}:${meta.name}`);
      for (const relation of meta.foreignKeyRelationMap.values()) {
        const relCls = [...rxdb.config.entities].find(c => getEntityMetadata(c).name === relation.mappedEntity);
        if (relCls) {
          const relMeta = getEntityMetadata(relCls);
          keys.add(`${relMeta.namespace}:${relMeta.name}`);
        }
      }
    }
    return [...keys];
  }, [rxdb]);

  // ── 用户状态 ───────────────────────────────────────────────────────────
  const [sortState, setSortState] = useState<ListSortState>({ ...DEFAULT_SORT_STATE });
  const [filterQuery, setFilterQuery] = useState<FilterQuery>({ ...EMPTY_FILTER });
  const [pendingQuery, setPendingQuery] = useState<FilterQuery>({ ...EMPTY_FILTER });
  const [pendingQueryValid, setPendingQueryValid] = useState(true);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localDraftItems, setLocalDraftItems] = useState<EntityInstance[]>([]);
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);

  // namespace/name 变化时重置排序与筛选（对应 Angular 侧 linkedSignal；渲染期调整状态）
  const [prevEntityInputs, setPrevEntityInputs] = useState({ namespace, name });
  if (prevEntityInputs.namespace !== namespace || prevEntityInputs.name !== name) {
    setPrevEntityInputs({ namespace, name });
    setSortState({ ...DEFAULT_SORT_STATE });
    setFilterQuery({ ...EMPTY_FILTER });
    setPendingQuery({ ...EMPTY_FILTER });
  }

  // initialFilter 变化 → 载入初始筛选（Angular 侧 effect 同语义；渲染期调整状态；
  // 哨兵初值保证挂载时也走一次解析 —— Angular 的 effect 首跑即执行）
  const [prevInitialFilter, setPrevInitialFilter] = useState<unknown>(undefined);
  if (prevInitialFilter !== initialFilter) {
    setPrevInitialFilter(initialFilter);
    const parsed = parseInitialFilter(initialFilter);
    if (parsed) {
      setPendingQuery(parsed);
      setFilterQuery(parsed);
    }
  }

  // Map.has 先验证再取值：与 Angular 侧 #entityCls 同语义，且满足 CodeQL CWE-915 的白名单取值模式
  const entityCls = entityClsMap.has(entityKey) ? entityClsMap.get(entityKey) : undefined;

  // ── 历史 / 撤销重做（@aiao/rxdb-plugin-history 装配的 versionManager）──
  const vHistory = useMemo<HistoryScopeAPI>(() => {
    const vm = (rxdb as unknown as { versionManager?: { history(): HistoryScopeAPI } }).versionManager;
    return vm?.history() ?? DEFAULT_HISTORY_FALLBACK;
  }, [rxdb]);

  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  useEffect(() => {
    const undoSubscription = vHistory.undoCount$.subscribe(setUndoCount);
    const redoSubscription = vHistory.redoCount$.subscribe(setRedoCount);
    return () => {
      undoSubscription.unsubscribe();
      redoSubscription.unsubscribe();
    };
  }, [vHistory]);
  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  // ── 列表资源注册表（ListSlot 写入；事件/回调路径经 ref 镜像读取）───────
  const [listResources, setListResources] = useState<ReadonlyMap<string, InfiniteScrollResource<EntityType>>>(
    () => new Map()
  );
  const listResourcesRef = useRef(listResources);
  useEffect(() => {
    listResourcesRef.current = listResources;
  }, [listResources]);

  const registerListResource = useCallback((key: string, resource: InfiniteScrollResource<EntityType>) => {
    setListResources(previous => {
      const existing = previous.get(key);
      if (
        existing &&
        existing.value === resource.value &&
        existing.isLoading === resource.isLoading &&
        existing.hasMore === resource.hasMore &&
        existing.error === resource.error &&
        existing.isEmpty === resource.isEmpty
      ) {
        return previous;
      }
      const next = new Map(previous);
      next.set(key, resource);
      return next;
    });
  }, []);

  const currentList = listResources.get(entityKey);
  const instances = useMemo(() => (currentList?.value ?? []) as unknown as EntityInstance[], [currentList]);

  const computedWhere = useMemo<FilterQuery>(() => {
    const fixed = fixedQuery;
    const userFilter = filterQuery;
    if (!fixed || fixed.rules.length === 0) return userFilter;
    if (userFilter.rules.length === 0) return fixed;
    return { combinator: 'and', rules: [...fixed.rules, ...userFilter.rules] };
  }, [fixedQuery, filterQuery]);

  // 每个列表槽位的查询选项工厂：where 共享（Angular 侧同一 computed），orderBy 主表跟列头排序
  const optionsFor = useCallback(
    (key: string): (() => FindByCursorOptions<EntityType>) =>
      () => {
        const listSortState = key === entityKey ? sortState : DEFAULT_SORT_STATE;
        return {
          where: computedWhere as never,
          orderBy: buildCursorOrderBy(listSortState) as FindByCursorOptions<EntityType>['orderBy']
        };
      },
    [computedWhere, entityKey, sortState]
  );

  // ── 视图派生 ───────────────────────────────────────────────────────────
  const isSelectMode = mode === 'select';
  const isM2m = relationKind === RelationKind.MANY_TO_MANY;
  const isFilterQuery = filterQuery.rules.length > 0;
  const isQueryActive = filterQuery.rules.length > 0;
  const filteredCount = instances.length + localDraftItems.length;

  const isInitialLoading = currentList ? currentList.isLoading && currentList.value.length === 0 : false;
  const isLoadingMore = currentList ? currentList.isLoading && currentList.value.length > 0 : false;

  const displayName = useMemo(() => {
    if (!entityCls) return name;
    const meta = getEntityMetadata(entityCls);
    return meta.displayName ?? meta.name;
  }, [entityCls, name]);

  /** 当前实体是否存在于祖先创建链路中（循环创建检测）。 */
  const isCreateBlocked = creationChain.includes(entityKey);

  const queryBuilderFields = useMemo<FieldMetadata[]>(() => {
    if (!entityCls) return [];
    return organizeFields(extractFieldsFromMetadata(getEntityMetadata(entityCls), modelInfoMap));
  }, [entityCls, modelInfoMap]);

  const tableRecords = useMemo<EntityTableRecord[]>(() => {
    const dbRecords = instances.map(inst => ({ ...(inst as Record<string, unknown>) }));
    const draftRecords = localDraftItems.map(inst => ({ ...(inst as Record<string, unknown>) }));
    let records: EntityTableRecord[] = [...draftRecords, ...dbRecords];
    if (isSelectMode) {
      records = records
        .filter(record => !alreadyLinkedIds.has(record['id'] as string))
        .map(record => ({ ...record, __selected: selectedIds.has(record['id'] as string) }));
    }
    return records;
  }, [instances, localDraftItems, isSelectMode, alreadyLinkedIds, selectedIds]);

  const columnsCache = useMemo(() => {
    const cache = new Map<string, ColumnDefine[]>();
    for (const cls of rxdb.config.entities) {
      const meta = getEntityMetadata(cls);
      cache.set(
        `${meta.namespace}:${meta.name}`,
        buildEditableColumns(meta, {
          relatedItemsProviderFactory: (fkField, relatedEntityName) => {
            const relCls = [...entityClsMap.values()].find(c => getEntityMetadata(c).name === relatedEntityName);
            if (!relCls) return undefined;
            const relKey = (() => {
              const m = getEntityMetadata(relCls);
              return `${m.namespace}:${m.name}`;
            })();
            const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
            return () => {
              const list = listResourcesRef.current.get(relKey);
              return ((list?.value ?? []) as unknown as Record<string, unknown>[]).map(inst => ({
                id: String(inst['id'] ?? ''),
                displayName: strVal(inst['displayName']) ?? strVal(inst['name']) ?? String(inst['id'] ?? '')
              }));
            };
          }
        })
      );
    }
    return cache;
  }, [rxdb, entityClsMap]);

  const tableColumns = useMemo<ColumnDefine[]>(() => {
    const base = columnsCache.get(entityKey) ?? [actionsColumn('操作', '删除', '查看')];
    if (isSelectMode) {
      const withoutActions = base.filter(column => (column as Record<string, unknown>)['field'] !== 'actions');
      return [{ field: '__selected', title: '', cellType: 'checkbox', width: 50 }, ...withoutActions];
    }
    return base;
  }, [columnsCache, entityKey, isSelectMode]);

  const createFormFieldConfigs = useMemo<FormFieldConfig[]>(() => {
    if (!entityCls) return [];
    return buildFormFields(getEntityMetadata(entityCls), 'create');
  }, [entityCls]);

  const selectedCount = selectedIds.size;

  /** 选择模式：已关联 id 集合（db + 本地草稿，M2M 对话框用）。 */
  const m2mAlreadyLinkedIds = useMemo<Set<string>>(
    () => new Set([...instances.map(e => e.id), ...localDraftItems.map(e => e.id)]),
    [instances, localDraftItems]
  );

  // ── 变更合并（Angular 侧 #enqueue / #flushPending 同语义）──────────────
  const pendingChangesRef = useRef(new Map<string, Record<string, unknown>>());
  const flushHandleRef = useRef(false);
  const instancesRef = useRef(instances);
  const localDraftItemsRef = useRef(localDraftItems);
  const entityClsRef = useRef(entityCls);
  const filterQueryRef = useRef(filterQuery);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  useEffect(() => {
    localDraftItemsRef.current = localDraftItems;
  }, [localDraftItems]);
  useEffect(() => {
    entityClsRef.current = entityCls;
  }, [entityCls]);
  useEffect(() => {
    filterQueryRef.current = filterQuery;
  }, [filterQuery]);

  const flushPending = useCallback(
    async (pending: [string, Record<string, unknown>][]): Promise<void> => {
      if (!pending.length) return;
      const EntityClass = entityClsRef.current;
      if (!EntityClass) return;
      const toUpdate = new Set<EntityInstance>();
      const prevMap = new Map<EntityInstance, Record<string, unknown>>();
      const draftUpdated = new Set<EntityInstance>();
      for (const [id, changes] of pending) {
        let inst = instancesRef.current.find(i => i.id === id);
        const isDraft = !inst;
        if (!inst) {
          inst = localDraftItemsRef.current.find(i => i.id === id);
        }
        if (!inst) continue;
        const prev: Record<string, unknown> = {};
        const actual: Record<string, unknown> = {};
        let hasChange = false;
        for (const k of Object.keys(changes)) {
          if (inst[k] !== changes[k]) {
            prev[k] = inst[k];
            actual[k] = changes[k];
            hasChange = true;
          }
        }
        if (!hasChange) continue;
        prevMap.set(inst, prev);
        Object.assign(inst as Record<string, unknown>, actual);
        if (isDraft) draftUpdated.add(inst);
        else toUpdate.add(inst);
      }

      // 草稿实体直接更新本地集合触发重渲染（不写DB）
      if (draftUpdated.size) {
        setLocalDraftItems(items => [...items]);
      }

      if (!toUpdate.size) return;

      const updateMap = new Map([[EntityClass, toUpdate as unknown as Set<unknown>]]);
      try {
        await rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
      } catch (error) {
        console.error(error);
        for (const [inst, prev] of prevMap) Object.assign(inst as Record<string, unknown>, prev);
      }
    },
    [rxdb]
  );

  /** 入队变更，微任务合并后落库（同一行多字段合入同一 UPDATE）。 */
  const enqueue = useCallback(
    (recordId: string, changes: Record<string, unknown>): void => {
      const current = pendingChangesRef.current.get(recordId) ?? {};
      pendingChangesRef.current.set(recordId, { ...current, ...changes });
      if (flushHandleRef.current) return;
      flushHandleRef.current = true;
      queueMicrotask(() => {
        flushHandleRef.current = false;
        const snapshot = [...pendingChangesRef.current.entries()];
        pendingChangesRef.current.clear();
        void flushPending(snapshot);
      });
    },
    [flushPending]
  );

  // ── 事件处理 ───────────────────────────────────────────────────────────
  const onCellChanged = useCallback(
    (event: CellChangeEvent): void => {
      if (!event.field || event.field === 'actions') return;
      if (event.field === '__selected') {
        const id = event.record['id'] as string;
        setSelectedIds(current => {
          const next = new Set(current);
          if (event.value) next.add(id);
          else next.delete(id);
          return next;
        });
        return;
      }
      const id = event.record['id'] as string;
      const cls = entityClsRef.current;
      let value = event.value;
      if (cls) {
        const prop = getEntityMetadata(cls).propertyMap.get(event.field);
        if (prop) value = parsePropertyColumnValue(prop.type, event.value);
      }
      enqueue(id, { [event.field]: value });
    },
    [enqueue]
  );

  const undo = useCallback((): void => {
    void vHistory.undo();
  }, [vHistory]);

  const redo = useCallback((): void => {
    void vHistory.redo();
  }, [vHistory]);

  /** 关系字段下拉的数据源（对应 Angular `#makeRelatedEntityProvider`）。 */
  const makeRelatedEntityProvider = useCallback(
    (draftParent: EntityInstance | null): RelatedEntityProvider => {
      const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
      return (entityName, ns) => {
        const relCls = [...entityClsMap.values()].find(c => {
          const m = getEntityMetadata(c);
          return m.name === entityName && (!ns || m.namespace === ns);
        });
        if (!relCls) return [];
        const relMeta = getEntityMetadata(relCls);
        const list = listResourcesRef.current.get(`${relMeta.namespace}:${relMeta.name}`);
        const items = ((list?.value ?? []) as unknown as Record<string, unknown>[]).map(inst => ({
          id: String(inst['id'] ?? ''),
          displayName: strVal(inst['displayName']) ?? strVal(inst['name']) ?? String(inst['id'] ?? '')
        }));
        if (draftParent) {
          const parentMeta = getEntityMetadata(draftParent['constructor'] as EntityType);
          if (parentMeta.name === entityName && (!ns || parentMeta.namespace === ns)) {
            const parentId = String(draftParent.id);
            if (!items.some(i => i.id === parentId)) {
              items.push({
                id: parentId,
                displayName: strVal(draftParent['displayName']) ?? strVal(draftParent['name']) ?? parentId
              });
            }
          }
        }
        return items;
      };
    },
    [entityClsMap]
  );

  /** 打开编辑详情对话框（「查看」行）；详情数据在打开时快照（Angular 侧 #openViewDialog 同语义）。 */
  const openViewDialog = useCallback(
    (record: EntityTableRecord): void => {
      const id = record['id'];
      if (typeof id !== 'string' || !id) return;
      if (editChain.includes(id)) return;
      if (localDraftItemsRef.current.some(i => i.id === id)) return;
      const cls = entityClsRef.current;
      if (!cls) return;
      const meta = getEntityMetadata(cls);
      const data: EntityDetailDialogData = {
        metadata: meta,
        formFields: buildFormFields(meta, 'edit'),
        formData: {},
        formMode: 'edit',
        entityId: id,
        editChain: [...editChain, id],
        relatedEntityProvider: makeRelatedEntityProvider(null)
      };
      setOpenDialog({ kind: 'view', recordId: id, data });
    },
    [editChain, makeRelatedEntityProvider]
  );

  const onIconClicked = useCallback(
    async (event: { name: string; record: EntityTableRecord }): Promise<void> => {
      if (event.name === 'view-action') {
        onViewEntity?.(event.record);
        openViewDialog(event.record);
        return;
      }
      if (event.name !== 'delete-action') return;
      const id = event.record['id'] as string;

      const draftInst = localDraftItemsRef.current.find(i => i.id === id);
      if (draftInst) {
        setLocalDraftItems(items => items.filter(i => i.id !== id));
        return;
      }

      const inst = instancesRef.current.find(i => i.id === id);
      if (!inst) return;
      try {
        await inst.remove();
      } catch (error) {
        console.error(error);
      }
    },
    [onViewEntity, openViewDialog]
  );

  const onRowDeleted = useCallback(
    async (record: EntityTableRecord): Promise<void> => {
      await onIconClicked({ name: 'delete-action', record });
    },
    [onIconClicked]
  );

  const onBatchUpdated = useCallback(
    (mutations: BatchChangeItem[]): void => {
      for (const { recordId, changes } of mutations) {
        const filtered = Object.fromEntries(Object.entries(changes).filter(([k]) => k && k !== 'actions'));
        if (Object.keys(filtered).length) enqueue(recordId, filtered);
      }
    },
    [enqueue]
  );

  /** 列头排序点击：驱动 cursor orderBy 重查（VTable 客户端排序已禁用）。 */
  const onSortClicked = useCallback((event: { field: unknown; order: unknown }): void => {
    const field = normalizeSortField(event.field);
    if (!field) return;
    setSortState({ field, order: normalizeSortOrder(event.order) });
  }, []);

  const onQueryChange = useCallback((query: FilterQuery | undefined): void => {
    setPendingQuery(query ?? { ...EMPTY_FILTER });
  }, []);

  const onValidationChange = useCallback((result: ValidationResult): void => {
    setPendingQueryValid(result.valid);
  }, []);

  const applyFilter = useCallback((): void => {
    setFilterQuery({ ...pendingQuery });
    setShowFilterPopover(false);
  }, [pendingQuery]);

  const resetFilter = useCallback((): void => {
    setPendingQuery({ ...EMPTY_FILTER });
    setFilterQuery({ ...EMPTY_FILTER });
  }, []);

  /** Ctrl+Z / Ctrl+Shift+Z 键盘快捷键驱动 undo / redo（输入框内不拦截）。 */
  const onKeydown = useCallback(
    (event: React.KeyboardEvent): void => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        if (event.shiftKey) {
          if (canRedo) {
            event.preventDefault();
            redo();
          }
        } else {
          if (canUndo) {
            event.preventDefault();
            undo();
          }
        }
      }
    },
    [canRedo, canUndo, redo, undo]
  );

  /** 级联新增提交：有父实体时注册到关系并进本地草稿，否则新建落库。 */
  const handleCreateSubmit = useCallback(
    async (data: EntityFormData): Promise<void> => {
      const cls = entityClsRef.current;
      if (!cls || typeof cls !== 'function') return;
      const parent = draftParentEntity;
      const relName = parentRelationName;

      if (parent && relName) {
        const child = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
        const relation = parent[relName + '$'] as { add(child: EntityInstance): void } | undefined;
        if (relation && typeof relation.add === 'function') {
          relation.add(child);
        }
        setLocalDraftItems(items => [...items, child]);
        return;
      }

      try {
        const inst = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
        await inst.save();
        listResourcesRef.current.get(entityKey)?.refresh();
      } catch (error) {
        console.error(error);
      }
    },
    [draftParentEntity, parentRelationName, entityKey]
  );

  /** 打开新建对话框；详情数据在打开时快照（Angular 侧 openCreateDialog 同语义）。 */
  const openCreateDialog = useCallback((): void => {
    if (isCreateBlocked) return;
    const cls = entityClsRef.current;
    const meta = cls ? getEntityMetadata(cls) : undefined;
    const fields = createFormFieldConfigs;
    if (!meta || fields.length === 0) return;
    const data: EntityDetailDialogData = {
      metadata: meta,
      formFields: fields,
      formData: {},
      formMode: 'create',
      relatedEntityProvider: makeRelatedEntityProvider(draftParentEntity ?? null),
      fixedFormData,
      delegateSave: !!draftParentEntity,
      creationChain
    };
    setOpenDialog({ kind: 'create', data });
  }, [
    isCreateBlocked,
    createFormFieldConfigs,
    makeRelatedEntityProvider,
    draftParentEntity,
    fixedFormData,
    creationChain
  ]);

  /** 打开 M2M 选择对话框（已打开时重入被挡）。 */
  const openM2mSelectDialog = useCallback((): void => {
    setOpenDialog(current => (current ? current : { kind: 'm2m' }));
  }, []);

  /** M2M 确认：父实体关系 add + save；草稿父实体只合并本地草稿。 */
  const onM2mSelectionConfirmed = useCallback(
    (entities: EntityInstance[]): void => {
      const parent = parentEntity;
      const relName = parentRelationName;

      if (parent && relName) {
        const relation = (parent as Record<string, unknown>)[relName + '$'];
        if (relation && typeof (relation as Record<string, unknown>)['add'] === 'function') {
          (relation as { add(...args: unknown[]): void }).add(...entities);
        }

        if (!draftParentEntity) {
          parent
            .save()
            .then(() => listResourcesRef.current.get(entityKey)?.refresh())
            .catch(error => console.error(error));
        } else {
          setLocalDraftItems(items => [...items, ...entities]);
        }
      }

      setOpenDialog(null);
    },
    [parentEntity, parentRelationName, draftParentEntity, entityKey]
  );

  const m2mCancelSelection = useCallback((): void => {
    setOpenDialog(null);
  }, []);

  const confirmSelection = useCallback((): void => {
    const ids = selectedIds;
    if (ids.size === 0) {
      onSelectionCancelled?.();
      return;
    }
    const entities = instances.filter(e => ids.has(e.id));
    onSelectionConfirmed?.(entities);
  }, [selectedIds, instances, onSelectionConfirmed, onSelectionCancelled]);

  const cancelSelection = useCallback((): void => {
    onSelectionCancelled?.();
  }, [onSelectionCancelled]);

  /** 刷新当前列表（create / edit 对话框 saved 后）。 */
  const refreshCurrentList = useCallback((): void => {
    listResourcesRef.current.get(entityKey)?.refresh();
  }, [entityKey]);

  const isBrowser = typeof window !== 'undefined';

  const loadMore = currentList ? (): void => currentList.loadMore() : undefined;

  return (
    <div
      className='rxdb-entity-list'
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onKeyDown={onKeydown}
    >
      {/* 每个列表槽位：活查询 hook 宿主（渲染空节点，资源经 registry 上抛） */}
      {listKeys.map(key => {
        const cls = entityClsMap.get(key);
        if (!cls) return null;
        return (
          <ListSlot
            entityKey={key}
            cls={cls}
            key={key}
            options={optionsFor(key)}
            onResourceChange={registerListResource}
          />
        );
      })}

      {/* 顶栏：实体名称 + 计数 + 筛选按钮 + 新增按钮 */}
      <div className='border-base-300 flex h-10 min-h-10 shrink-0 items-center justify-between border-b px-4'>
        <div className='flex items-center gap-2 text-sm'>
          <span className='font-medium'>{displayName}</span>
          {isFilterQuery && <span className='badge badge-ghost badge-sm'>{filteredCount} 条记录</span>}
        </div>
        <div className='flex items-center gap-2'>
          {!isSelectMode && (
            <>
              {/* Undo / Redo */}
              <button
                className='btn btn-xs btn-ghost'
                disabled={!canUndo}
                onClick={undo}
                aria-label='撤销 (Ctrl+Z)'
                type='button'
              >
                <Undo2 className='h-3.5 w-3.5' size={14} />
                <span className='badge badge-xs'>{undoCount}</span>
              </button>
              <button
                className='btn btn-xs btn-ghost'
                disabled={!canRedo}
                onClick={redo}
                aria-label='重做 (Ctrl+Shift+Z)'
                type='button'
              >
                <Redo2 className='h-3.5 w-3.5' size={14} />
                <span className='badge badge-xs'>{redoCount}</span>
              </button>
              <div className='divider divider-horizontal mx-0.5 h-5 self-center' />
            </>
          )}
          {/* 筛选 popover 触发器 */}
          <FilterPopover
            open={showFilterPopover}
            onToggle={() => setShowFilterPopover(value => !value)}
            onBackdropClick={() => setShowFilterPopover(false)}
            isQueryActive={isQueryActive}
            filterRuleCount={filterQuery.rules.length}
            fields={queryBuilderFields}
            initialQuery={filterQuery}
            pendingQuery={pendingQuery}
            pendingQueryValid={pendingQueryValid}
            onQueryChange={onQueryChange}
            onValidationChange={onValidationChange}
            onReset={resetFilter}
            onApply={applyFilter}
          />
          {!isCreateBlocked &&
            (isSelectMode ?
              <button className='btn btn-sm btn-outline' onClick={openCreateDialog} type='button'>
                + 新建
              </button>
            : isM2m ?
              <button className='btn btn-primary btn-sm' onClick={openM2mSelectDialog} type='button'>
                + 添加
              </button>
            : <button className='btn btn-primary btn-sm' onClick={openCreateDialog} type='button'>
                + 新增
              </button>)}
        </div>
      </div>

      {/* 表格主体 */}
      <div className='min-h-0 flex-1'>
        {isBrowser && (
          <QueryTable
            columns={tableColumns}
            filteredCount={filteredCount}
            loading={isInitialLoading}
            loadingMore={isLoadingMore}
            loadMore={loadMore}
            queryActive={isQueryActive}
            records={tableRecords}
            onBatchUpdated={onBatchUpdated}
            onCellChanged={onCellChanged}
            onIconClicked={event => void onIconClicked(event)}
            onRowDeleted={event => void onRowDeleted(event)}
            onSortClicked={onSortClicked}
          />
        )}
      </div>

      {/* Select mode footer */}
      {isSelectMode && (
        <div className='border-base-300 flex shrink-0 items-center justify-between border-t px-4 py-3'>
          {selectedCount > 0 ?
            <span className='text-base-content/70 text-sm'>已选 {selectedCount} 项</span>
          : <span className='text-base-content/40 text-sm'>请选择要关联的{displayName}</span>}
          <div className='flex gap-2'>
            <button className='btn btn-sm' onClick={cancelSelection} type='button'>
              取消
            </button>
            <button
              className='btn btn-primary btn-sm'
              disabled={selectedCount === 0}
              onClick={confirmSelection}
              type='button'
            >
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* 新建对话框 */}
      {openDialog?.kind === 'create' && (
        <Dialog
          open
          onClose={result => {
            setOpenDialog(null);
            if (result === 'saved') refreshCurrentList();
          }}
          width='720px'
          minWidth='400px'
          height='80vh'
          minHeight='300px'
          className='entity-detail-dialog'
        >
          <EntityDetail
            {...openDialog.data}
            onFormSubmitted={data => {
              void handleCreateSubmit(data);
              setOpenDialog(null);
            }}
          />
        </Dialog>
      )}

      {/* 编辑（查看）对话框 */}
      {openDialog?.kind === 'view' && (
        <Dialog
          open
          onClose={result => {
            setOpenDialog(null);
            if (result === 'saved') refreshCurrentList();
          }}
          width='720px'
          minWidth='400px'
          height='80vh'
          minHeight='300px'
          className='entity-detail-dialog'
        >
          <EntityDetail {...openDialog.data} />
        </Dialog>
      )}

      {/* M2M 选择对话框 */}
      {openDialog?.kind === 'm2m' && (
        <Dialog
          open
          onClose={() => setOpenDialog(null)}
          width='720px'
          minWidth='400px'
          height='70vh'
          minHeight='300px'
          className='entity-m2m-select-dialog'
        >
          <EntityDialog title={`添加${displayName}`} onCloseRequested={m2mCancelSelection}>
            <EntityList
              alreadyLinkedIds={m2mAlreadyLinkedIds}
              mode='select'
              name={name}
              namespace={namespace}
              onSelectionCancelled={m2mCancelSelection}
              onSelectionConfirmed={entities => onM2mSelectionConfirmed(entities)}
            />
          </EntityDialog>
        </Dialog>
      )}
    </div>
  );
}

// ─── 筛选弹层（Angular 侧 CDK Overlay 的固定定位等价物）─────────────────────

/** {@link FilterPopover} 的 props。 */
interface FilterPopoverProps {
  open: boolean;
  onToggle: () => void;
  onBackdropClick: () => void;
  isQueryActive: boolean;
  filterRuleCount: number;
  fields: FieldMetadata[];
  initialQuery: FilterQuery;
  pendingQuery: FilterQuery;
  pendingQueryValid: boolean;
  onQueryChange: (query: FilterQuery | undefined) => void;
  onValidationChange: (result: ValidationResult) => void;
  onReset: () => void;
  onApply: () => void;
}

/**
 * 筛选弹层：触发器按钮 + 透明遮罩 + 内嵌 QueryBuilder 的内容卡片。
 *
 * @remarks
 * Angular 侧用 CDK Overlay（透明 backdrop，backdropClick 关闭，无 Escape），
 * 定位优先下方右对齐、其次上方右对齐；本实现以固定定位 + 内容高度测量还原同一语义。
 */
function FilterPopover({
  open,
  onToggle,
  onBackdropClick,
  isQueryActive,
  filterRuleCount,
  fields,
  initialQuery,
  pendingQuery,
  pendingQueryValid,
  onQueryChange,
  onValidationChange,
  onReset,
  onApply
}: FilterPopoverProps): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 定位：优先下方右对齐，空间不足翻转到上方（对应 Angular overlayPositions）
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;
    const rect = trigger.getBoundingClientRect();
    const height = content.offsetHeight || 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    content.style.position = 'fixed';
    content.style.margin = '0';
    content.style.right = `${window.innerWidth - rect.right}px`;
    if (spaceBelow > height + 8 || spaceBelow > 120) {
      content.style.top = `${rect.bottom + 4}px`;
      content.style.bottom = 'unset';
    } else {
      content.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      content.style.top = 'unset';
    }
  }, [open]);

  return (
    <div>
      <button
        ref={triggerRef}
        className={cn('btn btn-ghost btn-sm gap-1', isQueryActive && 'btn-active')}
        onClick={onToggle}
        type='button'
      >
        <Funnel className='h-4 w-4' size={16} />
        筛选
        {isQueryActive && <span className='badge badge-primary badge-xs'>{filterRuleCount}</span>}
      </button>
      {open && (
        <div className='rxdb-filter-backdrop' onClick={onBackdropClick}>
          {fields.length > 0 && (
            <div
              ref={contentRef}
              className='border-base-300 bg-base-100 rounded-lg border p-3 shadow-lg'
              onClick={event => event.stopPropagation()}
              aria-hidden='true'
            >
              <QueryBuilder
                fields={fields}
                initialQuery={initialQuery as never}
                onQueryChange={query => onQueryChange(query as FilterQuery)}
                onValidationChange={onValidationChange}
              />
              <div className='mt-3 flex justify-end gap-2'>
                <button className='btn btn-ghost btn-sm' onClick={onReset} type='button'>
                  重置
                </button>
                <button
                  className='btn btn-primary btn-sm'
                  disabled={!pendingQueryValid}
                  onClick={onApply}
                  type='button'
                >
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 列表槽位（无限滚动 hook 宿主）──────────────────────────────────────────

/** 列表槽位 props。 */
interface ListSlotProps {
  entityKey: string;
  cls: EntityType;
  options: () => FindByCursorOptions<EntityType>;
  onResourceChange: (entityKey: string, resource: InfiniteScrollResource<EntityType>) => void;
}

/**
 * 列表槽位：为单个实体维护一个 {@link useInfiniteScroll} 活查询，
 * 资源变化时经 `onResourceChange` 上抛（父组件按版本号重渲染）。
 */
function ListSlot({ entityKey, cls, options, onResourceChange }: ListSlotProps): null {
  const resource = useInfiniteScroll(cls, options);

  useEffect(() => {
    onResourceChange(entityKey, resource);
    // 内容变化才上抛（resource 对象每次渲染都是新身份，按身份依赖会死循环）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entityKey,
    onResourceChange,
    resource.value,
    resource.isLoading,
    resource.hasMore,
    resource.error,
    resource.isEmpty
  ]);

  return null;
}
