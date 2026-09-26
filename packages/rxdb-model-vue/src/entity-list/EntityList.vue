<script lang="ts" setup>
/**
 * 实体列表组件（对齐 Angular 侧 `EntityListComponent`）。
 *
 * 封装了实体列表的完整 UI：工具栏（显示名称、筛选、撤销/重做、新增）+ 数据表格。
 * 通过 `namespace` 和 `name` props 定位 RxDB 实体，实现无限滚动加载和 CRUD 操作；
 * 行内编辑批量合并落库、撤销/重做（依赖 `@aiao/rxdb-plugin-history` 的 versionManager）、
 * 筛选弹层（内嵌查询构建器）、级联新增与多对多选择模式。
 *
 * Angular 侧的 `InfiniteScrollingList` 由 `@aiao/rxdb-vue` 的 `useInfiniteScroll` 替代，
 * 行为一致：各页活查询、触底 loadMore、选项变化重置重查、refresh 从首页重来。
 */
import { getEntityMetadata, isSystemEntity, RelationKind, type EntityType, type FindByCursorOptions } from '@aiao/rxdb';
import {
  actionsColumn,
  buildEditableColumns,
  buildFormFields,
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
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import { useInfiniteScroll, useRxDB, type InfiniteScrollResource } from '@aiao/rxdb-vue';
import { Funnel as FunnelIcon, Redo2 as Redo2Icon, Undo2 as Undo2Icon } from '@lucide/vue';
import type { ColumnsDefine, ListTableConstructorOptions } from '@visactor/vtable';
import { of, type Observable } from 'rxjs';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue';
import DialogPortal from '../entity-dialog/DialogPortal.vue';
import EntityDialog from '../entity-dialog/EntityDialog.vue';
import EntityDetail from '../entity-detail/EntityDetail.vue';
import type { EntityDetailDialogData } from '../entity-detail/entity-detail-types';
import QueryTable from '../entity-table/QueryTable.vue';
import QueryBuilder from '../query-builder/query-builder/QueryBuilder.vue';
import type { RxDBQueryOutput } from '../query-builder/query-builder/query-builder-types';

// 历史 / 撤销重做子系统在开源核心中被拆为 rxdb-plugin-history 插件（US-025）：
// 其装配期在 RxDB 实例上挂载 `versionManager` 槽位，此处声明合并恢复该类型的可见性。
declare module '@aiao/rxdb' {
  interface RxDB {
    versionManager: VersionManager;
  }
}

/** RxDB 实体实例（用于 CRUD 操作） */
type EntityInstance = {
  [key: string]: unknown;
  readonly id: string;
  save(): Promise<void>;
  remove(): Promise<void>;
};

type FilterQuery = { combinator: 'and' | 'or'; rules: unknown[] };

const EMPTY_FILTER: FilterQuery = { combinator: 'and', rules: [] };

/** 列表列头排序状态（normal = 默认 id desc） */
type ListSortState = { field: string; order: 'asc' | 'desc' | 'normal' };

const DEFAULT_SORT_STATE: ListSortState = { field: 'id', order: 'normal' };

/**
 * 实体列表的表格选项：关掉行序号列的拖拽手柄
 *
 * @remarks
 * `buildTableOptions()` 默认开 `rowSeriesNumber.dragOrder`，而列表不接 `rowReordered`，拖完不落库。
 * 排序持久化属 US-028 阶段 B，届时只对可排序实体重新打开。`buildTableOptions()` 对 `rowSeriesNumber`
 * 整体覆盖，`title` / `width` 要照默认值一并带上。
 */
const LIST_TABLE_OPTIONS: Partial<ListTableConstructorOptions> = {
  rowSeriesNumber: { title: '', width: 40, dragOrder: false }
};

/** 历史 API 的最小面（versionManager 缺省时退回 no-op） */
interface HistoryLike {
  undoCount$: Observable<number>;
  redoCount$: Observable<number>;
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
}

/** 规范化 VTable sort_click 的 field，拒绝 actions / 空字段 */
function normalizeSortField(field: unknown): string | undefined {
  if (typeof field !== 'string') return undefined;
  const trimmed = field.trim();
  if (!trimmed || trimmed === 'actions') return undefined;
  return trimmed;
}

/** 将 VTable order 规范为 asc | desc | normal */
function normalizeSortOrder(order: unknown): ListSortState['order'] {
  if (typeof order !== 'string') return 'normal';
  const lower = order.toLowerCase();
  if (lower === 'asc' || lower === 'desc' || lower === 'normal') return lower;
  return 'normal';
}

/**
 * 构造 FindByCursor 所需 orderBy。
 * normal → id desc；用户字段 → [field, id] 同向（末尾唯一键满足游标定位）。
 */
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

/** 解析外部导航传入的筛选条件 JSON 字符串，格式非法时静默忽略 */
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

const props = withDefaults(
  defineProps<{
    /** 实体命名空间 */
    namespace: string;
    /** 实体名 */
    name: string;
    /** 固定查询条件，与用户筛选条件做 AND 合并（用于关系属性过滤，如 ownerId = currentId） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    fixedQuery?: FilterQuery | undefined;
    /** 外部导航传入的初始筛选条件（JSON 字符串） */
    initialFilter?: string | undefined;
    /** 预填充的外键数据（级联新增时传递给子实体对话框） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    fixedFormData?: EntityFormData | undefined;
    /** 草稿父实体（用于级联新增场景，子实体通过关系 API 注册到父实体） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    draftParentEntity?: EntityInstance | null;
    /** 父实体上关系属性名（如 'children'），用于调用 parent.children$.add(child) */
    parentRelationName?: string | undefined;
    /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
    creationChain?: string[];
    /** 已打开详情对话框的记录 id 栈（含祖先记录），「查看」前检查以防无限套娃 */
    editChain?: string[];
    /** 关系类型（MANY_TO_MANY 时启用选择模式） */
    relationKind?: RelationKind | undefined;
    /** 父实体实例（用于 M2M 关系操作，包含 draft 和已保存实体） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    parentEntity?: EntityInstance | null;
    /** 列表模式：default=普通列表, select=选择模式（带 checkbox 列） */
    mode?: 'default' | 'select';
    /** 已关联的实体 ID 集合（选择模式下过滤掉，不再展示） */
    alreadyLinkedIds?: Set<string>;
  }>(),
  {
    initialFilter: undefined,
    parentRelationName: undefined,
    creationChain: () => [],
    editChain: () => [],
    relationKind: undefined,
    mode: 'default',
    alreadyLinkedIds: () => new Set<string>()
  }
);

const emit = defineEmits<{
  /** 点击「查看」按钮时触发，携带对应行记录；组件同时打开内置编辑对话框 */
  viewEntity: [record: EntityTableRecord];
  /** 选择模式：确认选择时触发，携带选中的实体实例 */
  selectionConfirmed: [entities: EntityInstance[]];
  /** 选择模式：取消选择时触发 */
  selectionCancelled: [];
}>();

const rxdb = useRxDB();

/** 统一错误处理（Angular ErrorHandler 的最小等价） */
const handleError = (error: unknown): void => {
  console.error('[EntityList]', error);
};

// ── Save coalescing ───────────────────────────────────────────────────
const pendingChanges = new Map<string, Record<string, unknown>>();
let flushHandle = false;

// ── Entity registry ───────────────────────────────────────────────────
const entityClsMap = new Map<string, EntityType>(
  rxdb.config.entities.map(cls => {
    const meta = getEntityMetadata(cls);
    return [`${meta.namespace}:${meta.name}`, cls] as const;
  })
);

const modelInfoMap = new Map<string, ModelInfo>(
  rxdb.config.entities.map(cls => {
    const meta = getEntityMetadata(cls);
    return [
      meta.name,
      {
        name: meta.name,
        displayName: meta.displayName ?? meta.name,
        entityClass: cls as new (...args: unknown[]) => unknown,
        metadata: meta
      }
    ] as const;
  })
);

/** 每实体一个无限滚动资源（Angular 侧按需建 InfiniteScrollingList；Vue 组合式须在 setup 建齐） */
const scrollListMap = new Map<string, InfiniteScrollResource<InstanceType<EntityType>>>();

const entityKey = computed(() => `${props.namespace}:${props.name}`);

// ── Reactive state ────────────────────────────────────────────────────
const filterQuery = ref<FilterQuery>({ ...EMPTY_FILTER });
const pendingQuery = ref<FilterQuery>({ ...EMPTY_FILTER });
const pendingQueryValid = ref(true);
const showFilterPopover = ref(false);

// 切实体时重置筛选与排序为默认
watch(entityKey, () => {
  filterQuery.value = { ...EMPTY_FILTER };
  pendingQuery.value = { ...EMPTY_FILTER };
  sortState.value = { ...DEFAULT_SORT_STATE };
});

// ── 无限滚动列表资源（等价 Angular #getOrCreateList + #currentList） ──

/** 列头排序；切实体时重置为默认 id desc */
const sortState = ref<ListSortState>({ ...DEFAULT_SORT_STATE });

/** 构造某实体 key 的游标查询选项（where = 固定 + 用户筛选；主表用列头排序） */
const buildListOptions = (key: string) => {
  const userFilter = filterQuery.value;
  const fixed = props.fixedQuery;
  let where: FilterQuery;
  if (!fixed || fixed.rules.length === 0) {
    where = userFilter;
  } else if (userFilter.rules.length === 0) {
    where = fixed;
  } else {
    where = { combinator: 'and', rules: [...fixed.rules, ...userFilter.rules] };
  }
  // 关联实体下拉的 list 不跟主表列头排序，避免外键侧字段缺失
  const activeSortState = key === entityKey.value ? sortState.value : DEFAULT_SORT_STATE;
  return {
    where: where as never,
    orderBy: buildCursorOrderBy(activeSortState) as FindByCursorOptions<EntityType>['orderBy']
  };
};

for (const cls of rxdb.config.entities) {
  const meta = getEntityMetadata(cls);
  const key = `${meta.namespace}:${meta.name}`;
  const resource = useInfiniteScroll(
    cls,
    computed(() => buildListOptions(key))
  );
  scrollListMap.set(key, resource);
}

const currentList = computed(() => scrollListMap.get(entityKey.value));

const instances = computed<EntityInstance[]>(() => {
  const list = currentList.value;
  return list ? (list.value.value as EntityInstance[]) : [];
});

/** 级联新增模式下本地草稿子实体（未保存到 DB，由父实体级联保存） */
const localDraftItems = ref<EntityInstance[]>([]);

const entityCls = computed(() => entityClsMap.get(entityKey.value));

/** 当前实体是否为 RxDB 注入的系统表（整表只读） */
const isSystemTable = computed(() => entityCls.value !== undefined && isSystemEntity(entityCls.value));

// ── History (undo/redo) ───────────────────────────────────────────────
const vHistory =
  (rxdb as unknown as { versionManager?: VersionManager }).versionManager?.history() ??
  ({
    undoCount$: of(0),
    redoCount$: of(0),
    undo: async () => undefined,
    redo: async () => undefined
  } satisfies HistoryLike);

const undoCount = ref(0);
const redoCount = ref(0);
watchEffect(onCleanup => {
  const sub = vHistory.undoCount$.subscribe(n => (undoCount.value = n));
  const sub2 = vHistory.redoCount$.subscribe(n => (redoCount.value = n));
  onCleanup(() => {
    sub.unsubscribe();
    sub2.unsubscribe();
  });
});

const canUndo = computed(() => undoCount.value > 0);
const canRedo = computed(() => redoCount.value > 0);

// ── Columns cache（每实体一次） ───────────────────────────────────────
const columnsCache = new Map<string, ColumnsDefine>(
  rxdb.config.entities.map(cls => {
    const meta = getEntityMetadata(cls);
    return [
      `${meta.namespace}:${meta.name}`,
      buildEditableColumns(meta, {
        relatedItemsProviderFactory: (_fkField, relatedEntityName) => {
          const relCls = [...entityClsMap.values()].find(c => {
            const m = getEntityMetadata(c);
            return m.name === relatedEntityName;
          });
          if (!relCls) return undefined;
          const relMeta = getEntityMetadata(relCls);
          const relKey = `${relMeta.namespace}:${relMeta.name}`;
          const list = scrollListMap.get(relKey);
          if (!list) return undefined;
          const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
          return () => {
            return (list.value.value as Record<string, unknown>[]).map(inst => ({
              id: String(inst['id'] ?? ''),
              displayName: strVal(inst['displayName']) ?? strVal(inst['name']) ?? String(inst['id'] ?? '')
            }));
          };
        }
      })
    ] as const;
  })
);

// ── View bindings ─────────────────────────────────────────────────────
const loadMore = computed(() => {
  const list = currentList.value;
  return list ? () => list.loadMore() : undefined;
});

const $isFilterQuery = computed(() => filterQuery.value.rules.length > 0);
const isQueryActive = computed(() => filterQuery.value.rules.length > 0);
const filteredCount = computed(() => instances.value.length + localDraftItems.value.length);

const isInitialLoading = computed(() => {
  const list = currentList.value;
  return list ? list.isLoading.value && list.value.value.length === 0 : false;
});

const isLoadingMore = computed(() => {
  const list = currentList.value;
  return list ? list.isLoading.value && list.value.value.length > 0 : false;
});

const displayName = computed(() => {
  const cls = entityCls.value;
  if (!cls) return props.name;
  const meta = getEntityMetadata(cls);
  return meta.displayName ?? meta.name;
});

/** 当前实体不接受从列表新增：系统表，或已在祖先创建链路中（循环创建检测） */
const isCreateBlocked = computed(() => isSystemTable.value || props.creationChain.includes(entityKey.value));

const queryBuilderFields = computed<FieldMetadata[]>(() => {
  const cls = entityCls.value;
  if (!cls) return [];
  return organizeFields(extractFieldsFromMetadata(getEntityMetadata(cls), modelInfoMap));
});

// ── Select mode ───────────────────────────────────────────────────────
const isSelectMode = computed(() => props.mode === 'select');
const isM2m = computed(() => props.relationKind === RelationKind.MANY_TO_MANY);

const selectedIds = ref<Set<string>>(new Set());
const selectedCount = computed(() => selectedIds.value.size);

const m2mAlreadyLinkedIds = computed<Set<string>>(() => {
  const dbIds = instances.value.map(e => e.id);
  const draftIds = localDraftItems.value.map(e => e.id);
  return new Set([...dbIds, ...draftIds]);
});

const tableRecords = computed<EntityTableRecord[]>(() => {
  const dbRecords = instances.value.map(inst => ({ ...(inst as Record<string, unknown>) }));
  const draftRecords = localDraftItems.value.map(inst => ({ ...(inst as Record<string, unknown>) }));
  let records: EntityTableRecord[] = [...draftRecords, ...dbRecords];
  if (isSelectMode.value) {
    const linkedIds = props.alreadyLinkedIds;
    const selIds = selectedIds.value;
    records = records
      .filter(r => !linkedIds.has(r['id'] as string))
      .map(r => ({ ...r, __selected: selIds.has(r['id'] as string) }));
  }
  // 系统表整表只读：交给现成的 `_readonly` 行守卫挡住编辑、粘贴与删除；
  // 操作列对只读行不出图标，「查看」也随之隐藏
  if (isSystemTable.value) records = records.map(r => ({ ...r, _readonly: true }));
  return records;
});

const tableColumns = computed<ColumnsDefine>(() => {
  const base = columnsCache.get(entityKey.value) ?? [actionsColumn('操作', '删除', '查看')];
  if (isSelectMode.value) {
    const withoutActions = base.filter(c => (c as Record<string, unknown>)['field'] !== 'actions');
    return [{ field: '__selected', title: '', cellType: 'checkbox', width: 50 }, ...withoutActions];
  }
  return base;
});

const createFormFieldConfigs = computed<FormFieldConfig[]>(() => {
  const cls = entityCls.value;
  if (!cls) return [];
  const meta = getEntityMetadata(cls);
  return buildFormFields(meta, 'create');
});

// ── 对话框状态（CDK Dialog 的包内替代：DialogPortal 渲染 + v-if 开关） ──

// shallowRef：对话框数据含 EntityMetadata（不可配置 Map 属性），深响应式会破坏核心契约
const createDialogData = shallowRef<EntityDetailDialogData | null>(null);
const viewDialogData = shallowRef<EntityDetailDialogData | null>(null);
const m2mDialogOpen = ref(false);

// ── initialFilter effect ──────────────────────────────────────────────
watch(
  () => props.initialFilter,
  raw => {
    const parsed = parseInitialFilter(raw);
    if (!parsed) return;
    pendingQuery.value = parsed;
    filterQuery.value = parsed;
  },
  { immediate: true }
);

// ── Event handlers ────────────────────────────────────────────────────

const toggleFilterPopover = (): void => {
  showFilterPopover.value = !showFilterPopover.value;
};

const closeFilterPopover = (): void => {
  showFilterPopover.value = false;
};

const applyFilter = (): void => {
  filterQuery.value = { ...pendingQuery.value };
  showFilterPopover.value = false;
};

const resetFilter = (): void => {
  pendingQuery.value = { ...EMPTY_FILTER };
  filterQuery.value = { ...EMPTY_FILTER };
};

/** 键盘快捷键：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 重做（输入控件内不拦截） */
const onKeydown = (e: KeyboardEvent): void => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (e.shiftKey) {
      if (canRedo.value) {
        e.preventDefault();
        void redo();
      }
    } else {
      if (canUndo.value) {
        e.preventDefault();
        void undo();
      }
    }
  }
};

const onQueryChange = (query: { combinator: 'and' | 'or'; rules: unknown[] } | undefined): void => {
  pendingQuery.value = query ?? { ...EMPTY_FILTER };
};

const onValidationChange = (result: ValidationResult): void => {
  pendingQueryValid.value = result.valid;
};

const onCellChanged = (event: CellChangeEvent): void => {
  if (!event.field || event.field === 'actions') return;
  if (event.field === '__selected') {
    const id = event.record['id'] as string;
    selectedIds.value = (() => {
      const next = new Set(selectedIds.value);
      if (event.value) next.add(id);
      else next.delete(id);
      return next;
    })();
    return;
  }
  const id = event.record['id'] as string;
  const cls = entityCls.value;
  let value = event.value;
  if (cls) {
    const prop = getEntityMetadata(cls).propertyMap.get(event.field);
    if (prop) value = parsePropertyColumnValue(prop.type, event.value);
  }
  enqueue(id, { [event.field]: value });
};

const undo = (): void => {
  void vHistory.undo();
};

const redo = (): void => {
  void vHistory.redo();
};

const onIconClicked = async (event: { name: string; record: EntityTableRecord }): Promise<void> => {
  if (event.name === 'view-action') {
    emit('viewEntity', event.record);
    openViewDialog(event.record);
    return;
  }
  if (event.name !== 'delete-action') return;
  const id = event.record['id'] as string;

  const draftInst = localDraftItems.value.find(i => i.id === id);
  if (draftInst) {
    localDraftItems.value = localDraftItems.value.filter(i => i.id !== id);
    return;
  }

  const inst = instances.value.find(i => i.id === id);
  if (!inst) return;
  try {
    await inst.remove();
  } catch (e) {
    handleError(e);
  }
};

const onRowDeleted = async (event: EntityTableRecord): Promise<void> => {
  await onIconClicked({ name: 'delete-action', record: event });
};

const onBatchUpdated = (mutations: BatchChangeItem[]): void => {
  for (const { recordId, changes } of mutations) {
    const filtered = Object.fromEntries(Object.entries(changes).filter(([k]) => k && k !== 'actions'));
    if (Object.keys(filtered).length) enqueue(recordId, filtered);
  }
};

const openCreateDialog = (): void => {
  if (isCreateBlocked.value) return;

  const fields = createFormFieldConfigs.value;
  const cls = entityCls.value;
  if (!cls || fields.length === 0) return;

  const meta = getEntityMetadata(cls);
  const relatedEntityProvider = makeRelatedEntityProvider(props.draftParentEntity ?? null);

  createDialogData.value = {
    metadata: meta,
    formFields: fields,
    formData: {},
    formMode: 'create' as const,
    relatedEntityProvider,
    fixedFormData: props.fixedFormData,
    delegateSave: !!props.draftParentEntity,
    creationChain: props.creationChain
  } satisfies EntityDetailDialogData;
};

const onCreateFormSubmitted = (result: EntityFormData): void => {
  void handleCreateSubmit(result);
  createDialogData.value = null;
};

const onCreateDialogClosed = (result?: unknown): void => {
  if (result === 'saved') currentList.value?.refresh();
  createDialogData.value = null;
};

// ── M2M / Select mode methods ─────────────────────────────────────────

const openM2mSelectDialog = (): void => {
  if (m2mDialogOpen.value) return;
  m2mDialogOpen.value = true;
};

const onM2mSelectionConfirmed = (entities: EntityInstance[]): void => {
  const parent = props.parentEntity;
  const relName = props.parentRelationName;

  if (parent && relName) {
    const relation = (parent as Record<string, unknown>)[relName + '$'];
    if (relation && typeof (relation as Record<string, unknown>)['add'] === 'function') {
      (relation as { add(...args: unknown[]): void }).add(...entities);
    }

    if (!props.draftParentEntity) {
      parent
        .save()
        .then(() => currentList.value?.refresh())
        .catch(handleError);
    } else {
      localDraftItems.value = [...localDraftItems.value, ...entities];
    }
  }

  m2mDialogOpen.value = false;
};

const m2mCancelSelection = (): void => {
  m2mDialogOpen.value = false;
};

const confirmSelection = (): void => {
  const ids = selectedIds.value;
  if (ids.size === 0) {
    emit('selectionCancelled');
    return;
  }
  const entities = instances.value.filter(e => ids.has(e.id));
  emit('selectionConfirmed', entities);
};

const cancelSelection = (): void => {
  emit('selectionCancelled');
};

/**
 * 列头排序点击：驱动 cursor orderBy 重查（VTable 客户端排序已禁用）。
 */
const onSortClicked = (event: { field: unknown; order: unknown }): void => {
  const field = normalizeSortField(event.field);
  if (!field) return;
  sortState.value = { field, order: normalizeSortOrder(event.order) };
};

// ── Private helpers ───────────────────────────────────────────────────

/**
 * 「查看」行 → 打开 edit 详情对话框（内置弹窗修改）。
 * 关系 Tab 内嵌的列表同样走这里，套娃下钻；`editChain` 命中或未落库草稿时只 emit 不打开。
 */
const openViewDialog = (record: EntityTableRecord): void => {
  const id = record['id'];
  if (typeof id !== 'string' || !id) return;
  if (props.editChain.includes(id)) return;
  if (localDraftItems.value.some(i => i.id === id)) return;
  const cls = entityCls.value;
  if (!cls) return;

  const meta = getEntityMetadata(cls);
  const fields = buildFormFields(meta, 'edit');

  viewDialogData.value = {
    metadata: meta,
    formFields: fields,
    formData: {},
    formMode: 'edit' as const,
    entityId: id,
    editChain: [...props.editChain, id],
    relatedEntityProvider: makeRelatedEntityProvider(null)
  } satisfies EntityDetailDialogData;
};

const onViewDialogClosed = (result?: unknown): void => {
  if (result === 'saved') currentList.value?.refresh();
  viewDialogData.value = null;
};

/**
 * 关系字段下拉的数据源：按关联实体名（+可选 namespace）解析实体类并读出当前列表。
 * `draftParent` 存在时把草稿父实体并入候选（级联新增自引用场景）。
 */
const makeRelatedEntityProvider = (draftParent: EntityInstance | null): RelatedEntityProvider => {
  const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return (entityName, namespace) => {
    const relCls = [...entityClsMap.values()].find(c => {
      const m = getEntityMetadata(c);
      return m.name === entityName && (!namespace || m.namespace === namespace);
    });
    if (!relCls) return [];
    const relMeta = getEntityMetadata(relCls);
    const list = scrollListMap.get(`${relMeta.namespace}:${relMeta.name}`);
    const items = ((list?.value.value as Record<string, unknown>[] | undefined) ?? []).map(inst => ({
      id: String(inst['id'] ?? ''),
      displayName: strVal(inst['displayName']) ?? strVal(inst['name']) ?? String(inst['id'] ?? '')
    }));
    if (draftParent) {
      const parentMeta = getEntityMetadata(draftParent['constructor'] as EntityType);
      if (parentMeta.name === entityName && (!namespace || parentMeta.namespace === namespace)) {
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
};

const handleCreateSubmit = async (data: EntityFormData): Promise<void> => {
  const cls = entityCls.value;
  if (!cls) return;

  const parent = props.draftParentEntity;
  const relName = props.parentRelationName;

  if (parent && relName) {
    const child = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
    const relation = parent[relName + '$'] as { add(child: EntityInstance): void } | undefined;
    if (relation && typeof relation.add === 'function') {
      relation.add(child);
    }
    localDraftItems.value = [...localDraftItems.value, child];
    return;
  }

  try {
    const inst = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
    await inst.save();
    currentList.value?.refresh();
  } catch (e) {
    handleError(e);
  }
};

const enqueue = (recordId: string, changes: Record<string, unknown>): void => {
  const cur = pendingChanges.get(recordId) ?? {};
  pendingChanges.set(recordId, { ...cur, ...changes });
  if (flushHandle) return;
  flushHandle = true;
  queueMicrotask(() => {
    flushHandle = false;
    const snapshot = [...pendingChanges.entries()];
    pendingChanges.clear();
    void flushPending(snapshot);
  });
};

const flushPending = async (pending: [string, Record<string, unknown>][]): Promise<void> => {
  if (!pending.length) return;
  const EntityClass = entityCls.value;
  if (!EntityClass) return;
  const toUpdate = new Set<EntityInstance>();
  const prevMap = new Map<EntityInstance, Record<string, unknown>>();
  const draftUpdated = new Set<EntityInstance>();
  for (const [id, changes] of pending) {
    let inst = instances.value.find(i => i.id === id);
    const isDraft = !inst;
    if (!inst) {
      inst = localDraftItems.value.find(i => i.id === id);
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
    if (isDraft) {
      draftUpdated.add(inst);
    } else {
      toUpdate.add(inst);
    }
  }

  // 草稿实体直接更新列表触发重渲染（不写 DB）
  if (draftUpdated.size) {
    localDraftItems.value = [...localDraftItems.value];
  }

  if (!toUpdate.size) return;

  const updateMap = new Map([[EntityClass, toUpdate as unknown as Set<unknown>]]);
  try {
    await rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
  } catch (e) {
    handleError(e);
    for (const [inst, prev] of prevMap) Object.assign(inst as Record<string, unknown>, prev);
  }
};

// ── 筛选弹层定位（CDK ConnectedOverlay 下方/上方右对齐的包内替代） ────

const filterTrigger = ref<HTMLElement | null>(null);
const filterPanel = ref<HTMLElement | null>(null);
let popoverEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

const positionFilterPanel = (): void => {
  const panel = filterPanel.value;
  const trigger = filterTrigger.value;
  if (!panel || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const panelWidth = panel.offsetWidth || 320;
  const panelHeight = panel.offsetHeight || 200;
  const left = Math.max(0, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth));
  panel.style.position = 'fixed';
  panel.style.left = `${left}px`;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= panelHeight + gap) {
    panel.style.top = `${rect.bottom + gap}px`;
    panel.style.bottom = 'unset';
  } else {
    panel.style.top = 'unset';
    panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  }
};

watch(showFilterPopover, open => {
  if (open) {
    void nextTick(() => positionFilterPanel());
    // CDK Overlay 带 backdrop 时 Escape 关闭（文档级监听，与焦点位置无关）
    popoverEscapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFilterPopover();
    };
    document.addEventListener('keydown', popoverEscapeHandler);
  } else if (popoverEscapeHandler) {
    document.removeEventListener('keydown', popoverEscapeHandler);
    popoverEscapeHandler = null;
  }
});

onBeforeUnmount(() => {
  if (popoverEscapeHandler) {
    document.removeEventListener('keydown', popoverEscapeHandler);
    popoverEscapeHandler = null;
  }
});

defineExpose({
  rxdb,
  entityKey,
  displayName,
  isCreateBlocked,
  filteredCount,
  isQueryActive,
  $isFilterQuery,
  isSelectMode,
  isM2m,
  isInitialLoading,
  isLoadingMore,
  loadMore,
  undoCount,
  redoCount,
  canUndo,
  canRedo,
  queryBuilderFields,
  tableRecords,
  tableColumns,
  createFormFieldConfigs,
  filterQuery,
  pendingQuery,
  pendingQueryValid,
  showFilterPopover,
  selectedIds,
  selectedCount,
  m2mAlreadyLinkedIds,
  localDraftItems,
  instances,
  currentList,
  sortState,
  toggleFilterPopover,
  closeFilterPopover,
  applyFilter,
  resetFilter,
  onKeydown,
  onQueryChange,
  onValidationChange,
  onCellChanged,
  undo,
  redo,
  onIconClicked,
  onRowDeleted,
  onBatchUpdated,
  openCreateDialog,
  openViewDialog,
  openM2mSelectDialog,
  onM2mSelectionConfirmed,
  m2mCancelSelection,
  confirmSelection,
  cancelSelection,
  onSortClicked
});
</script>

<template>
  <div
    class="rxdb-entity-list"
    @keydown="onKeydown"
    style="display: flex; flex-direction: column; height: 100%; overflow: hidden"
  >
    <!-- 顶栏：实体名称 + 计数 + 筛选按钮 + 新增按钮 -->
    <div class="border-base-300 flex h-10 min-h-10 shrink-0 items-center justify-between border-b px-4">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-medium">{{ displayName }}</span>
        <span
          class="badge badge-ghost badge-sm"
          v-if="$isFilterQuery"
          >{{ filteredCount }} 条记录</span
        >
      </div>
      <div class="flex items-center gap-2">
        <template v-if="!isSelectMode">
          <!-- Undo / Redo -->
          <button
            class="btn btn-xs btn-ghost"
            :disabled="!canUndo"
            @click="undo"
            aria-label="撤销 (Ctrl+Z)"
            type="button"
          >
            <Undo2Icon
              class="h-3.5 w-3.5"
              :size="14"
            />
            <span
              class="badge badge-xs"
              v-if="undoCount"
              >{{ undoCount }}</span
            >
          </button>
          <button
            class="btn btn-xs btn-ghost"
            :disabled="!canRedo"
            @click="redo"
            aria-label="重做 (Ctrl+Shift+Z)"
            type="button"
          >
            <Redo2Icon
              class="h-3.5 w-3.5"
              :size="14"
            />
            <span
              class="badge badge-xs"
              v-if="redoCount"
              >{{ redoCount }}</span
            >
          </button>
          <div class="divider divider-horizontal mx-0.5 h-5 self-center" />
        </template>
        <!-- 筛选 popover 触发器 -->
        <button
          class="btn btn-ghost btn-sm gap-1"
          :class="{ 'btn-active': isQueryActive }"
          @click="toggleFilterPopover"
          ref="filterTrigger"
          type="button"
        >
          <FunnelIcon
            class="h-4 w-4"
            :size="16"
          />
          筛选
          <span
            class="badge badge-primary badge-xs"
            v-if="isQueryActive"
            >{{ filterQuery.rules.length }}</span
          >
        </button>
        <button
          class="btn btn-sm btn-outline"
          v-if="!isCreateBlocked && isSelectMode"
          @click="openCreateDialog"
          type="button"
        >
          + 新建
        </button>
        <button
          class="btn btn-primary btn-sm"
          v-else-if="!isCreateBlocked && isM2m"
          @click="openM2mSelectDialog"
          type="button"
        >
          + 添加
        </button>
        <button
          class="btn btn-primary btn-sm"
          v-else-if="!isCreateBlocked"
          @click="openCreateDialog"
          type="button"
        >
          + 新增
        </button>
      </div>
    </div>

    <!-- 筛选 popover（CDK ConnectedOverlay + 透明 backdrop 的包内替代） -->
    <Teleport to="body">
      <template v-if="showFilterPopover">
        <div
          class="rxdb-filter-popover-backdrop"
          @click="closeFilterPopover"
        />
        <!--
          面板**不能**带 aria-hidden：里面全是可聚焦控件（字段树选择、操作符、值输入、
          重置 / 确定），aria-hidden 会把它们整片从无障碍树里摘掉 —— 屏幕阅读器读不到、
          axe 的 aria-hidden-focus 判违规，基于 role 的定位（含 e2e 的 getByRole）也全部落空。
          backdrop 与面板是 Teleport 下的**兄弟节点**而非祖先，面板内的点击到不了 backdrop
          的 @click，所以也不需要 .stop（只有 React 端面板套在 backdrop 里才需要）。
        -->
        <div
          class="border-base-300 bg-base-100 rxdb-filter-popover-panel rounded-lg border p-3 shadow-lg"
          ref="filterPanel"
        >
          <QueryBuilder
            v-if="queryBuilderFields.length > 0"
            :fields="queryBuilderFields"
            :initial-query="filterQuery as unknown as RxDBQueryOutput<Record<string, unknown>>"
            @query-change="onQueryChange"
            @validation-change="onValidationChange"
          />
          <div class="mt-3 flex justify-end gap-2">
            <button
              class="btn btn-ghost btn-sm"
              @click="resetFilter"
              type="button"
            >
              重置
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!pendingQueryValid"
              @click="applyFilter"
              type="button"
            >
              确定
            </button>
          </div>
        </div>
      </template>
    </Teleport>

    <!-- 表格主体 -->
    <div class="min-h-0 flex-1">
      <QueryTable
        :columns="tableColumns"
        :filtered-count="filteredCount"
        :key="namespace + ':' + name"
        :load-more="loadMore"
        :loading="isInitialLoading"
        :loading-more="isLoadingMore"
        :query-active="isQueryActive"
        :records="tableRecords"
        :table-options="LIST_TABLE_OPTIONS"
        @batch-updated="onBatchUpdated"
        @cell-changed="onCellChanged"
        @icon-clicked="onIconClicked"
        @row-deleted="onRowDeleted"
        @sort-clicked="onSortClicked"
      />
    </div>

    <!-- Select mode footer -->
    <div
      class="border-base-300 flex shrink-0 items-center justify-between border-t px-4 py-3"
      v-if="isSelectMode"
    >
      <span
        class="text-base-content/70 text-sm"
        v-if="selectedCount > 0"
        >已选 {{ selectedCount }} 项</span
      >
      <span
        class="text-base-content/40 text-sm"
        v-else
        >请选择要关联的{{ displayName }}</span
      >
      <div class="flex gap-2">
        <button
          class="btn btn-sm"
          @click="cancelSelection"
          type="button"
        >
          取消
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="selectedCount === 0"
          @click="confirmSelection"
          type="button"
        >
          确认添加
        </button>
      </div>
    </div>

    <!-- 新增（create）详情对话框 -->
    <DialogPortal
      v-if="createDialogData"
      @closed="onCreateDialogClosed"
      height="80vh"
      min-height="300px"
      min-width="400px"
      panel-class="entity-detail-dialog"
      width="720px"
    >
      <EntityDetail
        v-bind="createDialogData"
        @form-submitted="onCreateFormSubmitted"
      />
    </DialogPortal>

    <!-- 查看（edit）详情对话框 -->
    <DialogPortal
      v-if="viewDialogData"
      @closed="onViewDialogClosed"
      height="80vh"
      min-height="300px"
      min-width="400px"
      panel-class="entity-detail-dialog"
      width="720px"
    >
      <EntityDetail v-bind="viewDialogData" />
    </DialogPortal>

    <!-- M2M Selection Dialog -->
    <DialogPortal
      v-if="m2mDialogOpen"
      @closed="m2mDialogOpen = false"
      height="70vh"
      min-height="300px"
      min-width="400px"
      panel-class="entity-m2m-select-dialog"
      width="720px"
    >
      <EntityDialog
        :title="`添加${displayName}`"
        @close-requested="m2mCancelSelection"
      >
        <EntityList
          :already-linked-ids="m2mAlreadyLinkedIds"
          :name="name"
          :namespace="namespace"
          @selection-cancelled="m2mCancelSelection"
          @selection-confirmed="onM2mSelectionConfirmed"
          mode="select"
        />
      </EntityDialog>
    </DialogPortal>
  </div>
</template>

<style scoped>
.rxdb-filter-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.rxdb-filter-popover-panel {
  z-index: 1000;
}
</style>
