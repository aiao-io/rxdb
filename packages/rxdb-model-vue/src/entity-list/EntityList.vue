<script lang="ts" setup>
const { t, runtime: modelI18n } = useModelI18n();

import { useModelI18n } from '../i18n';

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
import {
  getEntityMetadata,
  RelationKind,
  type EntityMetadata,
  type EntityType,
  type FindByCursorOptions,
  type HistoryScopeAPI
} from '@aiao/rxdb';
import {
  actionsColumn,
  buildEditableColumns,
  buildFormFields,
  canReorderEntityList,
  commitRowMove,
  applyListViewColumns,
  buildListViewOrderBy,
  buildListViewRecords,
  buildListViewTableOptions,
  createListViewState,
  getListViewFields,
  type ListViewState,
  deriveEntityCapabilities,
  describeHistoryBarrier,
  extractFieldsFromMetadata,
  organizeFields,
  parsePropertyColumnValue,
  type BatchChangeItem,
  type CellChangeEvent,
  type EntityFormData,
  type EntityInstance,
  type EntityTableRecord,
  type FieldMetadata,
  type FilterQuery,
  type FormFieldConfig,
  type ModelInfo,
  type RelatedEntityProvider,
  type RowMoveEvent,
  type ValidationResult
} from '@aiao/rxdb-model';
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import { useInfiniteScroll, useRxDB, type InfiniteScrollResource } from '@aiao/rxdb-vue';
import { Funnel as FunnelIcon, Redo2 as Redo2Icon, Undo2 as Undo2Icon, X as XIcon } from '@lucide/vue';
import type { ColumnsDefine, ListTableConstructorOptions } from '@visactor/vtable';
import { of, type Observable, type ObservedValueOf } from 'rxjs';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue';
import DialogPortal from '../entity-dialog/DialogPortal.vue';
import EntityDialog from '../entity-dialog/EntityDialog.vue';
import EntityDetail from '../entity-detail/EntityDetail.vue';
import type { EntityDetailDialogData } from '../entity-detail/entity-detail-types';
import ListViewSettings from './ListViewSettings.vue';
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

const EMPTY_FILTER: FilterQuery = { combinator: 'and', rules: [] };

/** 列表列头排序状态（normal = 默认 id desc） */
type ListSortState = { field: string; order: 'asc' | 'desc' | 'normal' };

const DEFAULT_SORT_STATE: ListSortState = { field: 'id', order: 'normal' };

/**
 * 实体列表的表格选项：建表时打开行序号列的拖拽
 *
 * @remarks
 * VTable 只在建表时读 `dragOrder`，所以统一打开，手柄是否出现由 `rowDragEnabled` 按
 * {@link canReorderEntityList} 运行时开关（US-028 阶段 B）。`buildTableOptions()` 对 `rowSeriesNumber`
 * 整体覆盖，`title` / `width` 要照默认值一并带上。
 */
const LIST_TABLE_OPTIONS: Partial<ListTableConstructorOptions> = {
  rowSeriesNumber: { title: '', width: 40, dragOrder: true }
};

/** 把落库错误转成提示文案 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 历史 API 的最小面（versionManager 缺省时退回 no-op） */
interface HistoryLike {
  undoCount$: Observable<number>;
  redoCount$: Observable<number>;
  undoBarrier$: HistoryScopeAPI['undoBarrier$'];
  redoBarrier$: HistoryScopeAPI['redoBarrier$'];
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
}

interface PendingEntityChange {
  entityClass: EntityType;
  target: EntityInstance;
  draft: boolean;
  changes: Record<string, unknown>;
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
const pendingChanges = new Map<string, PendingEntityChange>();
let flushHandle = false;
/** 已排队或正在落库的行内编辑批次数；拖放时据此判定「有未完成的编辑」 */
const pendingEditBatches = ref(0);
/** 上一次拖拽的重排还没落定 */
const reorderPending = ref(false);
/** 最近一次重排落库失败的提示；成功或重新拖放时清除 */
const reorderError = ref<string | null>(null);
/** 最近一次删除被存储层拒绝的原因（如仍被其他记录引用）；重新删除或切换实体时清除 */
const deleteError = ref<string | null>(null);
/** 表格链路（列表 → QueryTable → EntityTable），用于把被拒或失败的拖放恢复原顺序 */
const queryTableRef = ref<InstanceType<typeof QueryTable> | null>(null);

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
const viewState = ref(createListViewState());

// ── 无限滚动列表资源（等价 Angular #getOrCreateList + #currentList） ──

/** 列头排序；切实体时重置为默认 id desc */
const sortState = ref<ListSortState>({ ...DEFAULT_SORT_STATE });

/** 主表使用固定与用户筛选，关联候选独立查询。 */
const buildListOptions = (key: string, metadata: EntityMetadata) => {
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
  // 关联候选不使用主表的筛选与排序
  const isCurrent = key === entityKey.value;
  const view = isCurrent ? viewState.value : createListViewState();
  return {
    where: (isCurrent ? where : EMPTY_FILTER) as never,
    orderBy: buildListViewOrderBy(view, metadata) as FindByCursorOptions<EntityType>['orderBy']
  };
};

for (const cls of rxdb.config.entities) {
  const meta = getEntityMetadata(cls);
  const key = `${meta.namespace}:${meta.name}`;
  const resource = useInfiniteScroll(
    cls,
    computed(() => buildListOptions(key, meta))
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

/** 当前实体的界面能力，由 `permissions` 派生（US-027）；未注册实体无元数据可派生，为 `undefined` */
const capabilities = computed(() => {
  const cls = entityCls.value;
  return cls ? deriveEntityCapabilities(getEntityMetadata(cls), { readOnly: rxdb.readOnly }) : undefined;
});

// ── History (undo/redo) ───────────────────────────────────────────────
const vHistory =
  (rxdb as unknown as { versionManager?: VersionManager }).versionManager?.history() ??
  ({
    undoCount$: of(0),
    redoCount$: of(0),
    undoBarrier$: of(null),
    redoBarrier$: of(null),
    undo: async () => undefined,
    redo: async () => undefined
  } satisfies HistoryLike);

const undoCount = ref(0);
const redoCount = ref(0);
const undoBarrier = shallowRef<ObservedValueOf<HistoryScopeAPI['undoBarrier$']>>(null);
const redoBarrier = shallowRef<ObservedValueOf<HistoryScopeAPI['redoBarrier$']>>(null);
watchEffect(onCleanup => {
  const sub = vHistory.undoCount$.subscribe(n => (undoCount.value = n));
  const sub2 = vHistory.redoCount$.subscribe(n => (redoCount.value = n));
  const sub3 = vHistory.undoBarrier$.subscribe(value => (undoBarrier.value = value));
  const sub4 = vHistory.redoBarrier$.subscribe(value => (redoBarrier.value = value));
  onCleanup(() => {
    sub.unsubscribe();
    sub2.unsubscribe();
    sub3.unsubscribe();
    sub4.unsubscribe();
  });
});

const canUndo = computed(() => undoCount.value > 0);
const canRedo = computed(() => redoCount.value > 0);
const undoHint = computed(() => (canUndo.value ? null : describeHistoryBarrier('undo', undoBarrier.value, modelI18n)));
const redoHint = computed(() => (canRedo.value ? null : describeHistoryBarrier('redo', redoBarrier.value, modelI18n)));

// ── Columns cache（每实体一次） ───────────────────────────────────────
const columnsCache = computed(() => {
  t('common.actions');
  return new Map<string, ColumnsDefine>(
    rxdb.config.entities.map(cls => {
      const meta = getEntityMetadata(cls);
      return [
        `${meta.namespace}:${meta.name}`,
        buildEditableColumns(meta, {
          i18n: modelI18n,
          readOnly: rxdb.readOnly,
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
});

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

/** 当前实体不接受从列表新增：`create` 只许系统写，或已在祖先创建链路中（循环创建检测） */
const isCreateBlocked = computed(
  () => capabilities.value?.canCreate === false || props.creationChain.includes(entityKey.value)
);

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

/** 当前列表是否允许拖拽排序（US-028）：只有看到的行就是一条完整排序域时才打开手柄 */
const rowDragEnabled = computed(() => {
  const cls = entityCls.value;
  const list = currentList.value;
  return (
    viewState.value.groupBy === null &&
    canReorderEntityList({
      metadata: cls ? getEntityMetadata(cls) : undefined,
      sortOrder: sortState.value.order,
      hasUserFilter: filterQuery.value.rules.length > 0,
      selectMode: isSelectMode.value,
      fixedQuery: props.fixedQuery,
      fullyLoaded: !!list && !list.hasMore.value && !list.isLoading.value,
      hasReadonlyRows: capabilities.value?.canEdit === false,
      hasDrafts: localDraftItems.value.length > 0,
      hasPendingEdits: pendingEditBatches.value > 0,
      reorderPending: reorderPending.value
    })
  );
});

const sourceTableRecords = computed<EntityTableRecord[]>(() => {
  // `update` 只许系统写：已落库的行交给现成的 `_readonly` 行守卫挡住编辑与粘贴，详情走 view 模式；
  // 删除另由操作列按 `delete` 权限判定。草稿尚未落库，仍可编辑
  const isRowReadonly = capabilities.value?.canEdit === false;
  const dbRecords = instances.value.map(inst => ({
    ...(inst as Record<string, unknown>),
    ...(isRowReadonly ? { _readonly: true } : {})
  }));
  const draftRecords = localDraftItems.value.map(inst => ({ ...(inst as Record<string, unknown>) }));
  let records: EntityTableRecord[] = [...draftRecords, ...dbRecords];
  if (isSelectMode.value) {
    const linkedIds = props.alreadyLinkedIds;
    const selIds = selectedIds.value;
    records = records
      .filter(r => !linkedIds.has(r['id'] as string))
      .map(r => ({ ...r, __selected: selIds.has(r['id'] as string) }));
  }
  return records;
});

const baseTableColumns = computed<ColumnsDefine>(() => {
  // 未注册实体无元数据可派生，不给删除
  const base = columnsCache.value.get(entityKey.value) ?? [
    actionsColumn(t('common.actions'), t('common.delete'), () => false, t('common.view'))
  ];
  if (isSelectMode.value) {
    const withoutActions = base.filter(c => (c as Record<string, unknown>)['field'] !== 'actions');
    return [{ field: '__selected', title: '', cellType: 'checkbox', width: 50 }, ...withoutActions];
  }
  return base;
});

const tableColumns = computed(() => applyListViewColumns(baseTableColumns.value, viewState.value));
const viewFields = computed(() =>
  getListViewFields(applyListViewColumns(baseTableColumns.value, { ...viewState.value, hiddenFields: [] }))
);
const tableRecords = computed(() => buildListViewRecords(sourceTableRecords.value, viewState.value));
const listTableOptions = computed(() => ({
  ...LIST_TABLE_OPTIONS,
  ...buildListViewTableOptions(viewState.value, baseTableColumns.value, modelI18n)
}));
const onViewSettingsChange = (value: ListViewState): void => {
  viewState.value = value;
  const first = value.sorts[0];
  sortState.value = first ? { field: first.field, order: first.sort } : { ...DEFAULT_SORT_STATE };
};

const createFormFieldConfigs = computed<FormFieldConfig[]>(() => {
  const cls = entityCls.value;
  if (!cls) return [];
  const meta = getEntityMetadata(cls);
  return buildFormFields(meta, 'create', modelI18n);
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
  deleteConfirmRecord.value = event.record;
};

/** 待确认删除的行；非空即弹层打开。 */
const deleteConfirmRecord = ref<EntityTableRecord | null>(null);

// 切实体时重置只属于旧实体的交互状态。
watch(entityKey, () => {
  filterQuery.value = { ...EMPTY_FILTER };
  pendingQuery.value = { ...EMPTY_FILTER };
  pendingQueryValid.value = true;
  sortState.value = { ...DEFAULT_SORT_STATE };
  viewState.value = createListViewState();
  selectedIds.value = new Set();
  localDraftItems.value = [];
  showFilterPopover.value = false;
  deleteConfirmRecord.value = null;
  m2mDialogOpen.value = false;
  deleteError.value = null;
  reorderError.value = null;
});

/** 确认弹层里的删除执行（与删除图标同一条路径）。 */
const confirmDelete = async (): Promise<void> => {
  const record = deleteConfirmRecord.value;
  deleteConfirmRecord.value = null;
  if (!record) return;
  deleteError.value = null;
  const id = record['id'] as string;

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
    // 确认弹层已关：存储层拒绝的原因（如仍被引用时外键 RESTRICT）留在列表上
    deleteError.value = errorMessage(e);
    handleError(e);
  }
};

const cancelDelete = (): void => {
  deleteConfirmRecord.value = null;
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

const saveToast = ref(false);
let saveToastTimer: ReturnType<typeof setTimeout> | null = null;
const showSaveToast = (): void => {
  if (saveToastTimer !== null) clearTimeout(saveToastTimer);
  saveToast.value = true;
  saveToastTimer = setTimeout(() => {
    saveToast.value = false;
  }, 2000);
};

const onCreateDialogClosed = (result?: unknown): void => {
  if (result === 'saved') {
    currentList.value?.refresh();
    showSaveToast();
  }
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
 * 单行拖放：允许时按界面上的邻居落库重排，不允许或失败时把表格恢复原顺序（US-028）。
 */
const onRowMoved = (move: RowMoveEvent): void => {
  const cls = entityCls.value;
  void commitRowMove(move, {
    enabled: rowDragEnabled.value && !!cls,
    reorder: ({ id, prevId, nextId }) =>
      rxdb.entityManager.getRepository(cls as EntityType).reorder(id as never, { prevId, nextId } as never),
    restore: () => queryTableRef.value?.restoreRecords(),
    setPending: pending => (reorderPending.value = pending),
    setError: error => (reorderError.value = error === null ? null : errorMessage(error))
  });
};

/**
 * 列头排序点击：驱动 cursor orderBy 重查（VTable 客户端排序已禁用）。
 */
const onSortClicked = (event: { field: unknown; order: unknown }): void => {
  const field = normalizeSortField(event.field);
  if (!field) return;
  const order = normalizeSortOrder(event.order);
  sortState.value = { field, order };
  viewState.value = { ...viewState.value, sorts: order === 'normal' ? [] : [{ field, sort: order }] };
};

// ── Private helpers ───────────────────────────────────────────────────

/**
 * 「查看」行 → 打开详情对话框：可写行走 edit 模式（内置弹窗修改），`_readonly` 行走 view 模式（无保存入口）。
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
  const formMode = record['_readonly'] === true ? 'view' : 'edit';
  const fields = buildFormFields(meta, formMode, modelI18n);

  viewDialogData.value = {
    metadata: meta,
    formFields: fields,
    formData: {},
    formMode,
    entityId: id,
    editChain: [...props.editChain, id],
    relatedEntityProvider: makeRelatedEntityProvider(null)
  } satisfies EntityDetailDialogData;
};

const onViewDialogClosed = (result?: unknown): void => {
  if (result === 'saved') {
    currentList.value?.refresh();
    showSaveToast();
  }
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
  const key = `${entityKey.value}:${recordId}`;
  const current = pendingChanges.get(key);
  const records = instances.value;
  const target = records.find(item => item.id === recordId) ?? localDraftItems.value.find(item => item.id === recordId);
  const entityClass = entityCls.value;
  if (!target || !entityClass) return;
  pendingChanges.set(key, {
    entityClass,
    target: current?.target ?? target,
    draft: current?.draft ?? !records.some(item => item.id === recordId),
    changes: { ...current?.changes, ...changes }
  });
  if (flushHandle) return;
  flushHandle = true;
  pendingEditBatches.value += 1;
  queueMicrotask(() => {
    flushHandle = false;
    const snapshot = [...pendingChanges.entries()];
    pendingChanges.clear();
    void flushPending(snapshot).finally(() => (pendingEditBatches.value -= 1));
  });
};

const flushPending = async (pending: [string, PendingEntityChange][]): Promise<void> => {
  if (!pending.length) return;
  const updateGroups = new Map<EntityType, Set<EntityInstance>>();
  const prevMap = new Map<EntityInstance, Record<string, unknown>>();
  const draftUpdated = new Set<EntityInstance>();
  for (const [, entry] of pending) {
    const inst = entry.target;
    const prev: Record<string, unknown> = {};
    const actual: Record<string, unknown> = {};
    let hasChange = false;
    for (const key of Object.keys(entry.changes)) {
      if (inst[key] !== entry.changes[key]) {
        prev[key] = inst[key];
        actual[key] = entry.changes[key];
        hasChange = true;
      }
    }
    if (!hasChange) continue;
    prevMap.set(inst, prev);
    Object.assign(inst as Record<string, unknown>, actual);
    if (entry.draft) {
      draftUpdated.add(inst);
    } else {
      const group = updateGroups.get(entry.entityClass) ?? new Set<EntityInstance>();
      group.add(inst);
      updateGroups.set(entry.entityClass, group);
    }
  }

  // 草稿实体直接更新列表触发重渲染（不写 DB）
  if (draftUpdated.size) {
    localDraftItems.value =
      localDraftItems.value.some(item => draftUpdated.has(item)) ? [...localDraftItems.value] : localDraftItems.value;
  }

  if (!updateGroups.size) return;

  const updateMap = new Map(
    [...updateGroups.entries()].map(([entityClass, items]) => [entityClass, items as Set<unknown>] as const)
  );
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
  undoHint,
  redoHint,
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
  rowDragEnabled,
  reorderError,
  deleteError,
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
  onRowMoved,
  onSortClicked
});
</script>

<template>
  <div
    class="rxdb-entity-list"
    style="display: flex; flex-direction: column; height: 100%; overflow: hidden"
    @keydown="onKeydown"
  >
    <div
      v-if="saveToast"
      class="toast toast-end z-[1100]"
      data-testid="save-toast"
      role="status"
    >
      <div class="alert alert-success py-2 text-sm">{{ t('text.1bd91a7d0c') }}</div>
    </div>

    <!-- 顶栏：实体名称 + 计数 + 筛选按钮 + 新增按钮 -->
    <div class="border-base-300 flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-1">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-medium">{{ displayName }}</span>
        <span
          v-if="$isFilterQuery"
          class="badge badge-ghost badge-sm"
          >{{ t('text.3a517ca2dd', { p0: filteredCount }) }}</span
        >
      </div>
      <div class="flex items-center gap-2">
        <template v-if="!isSelectMode">
          <!-- Undo / Redo -->
          <button
            class="btn btn-xs btn-ghost"
            :disabled="!canUndo"
            :title="undoHint ?? undefined"
            :aria-label="t('text.2b712a273d')"
            type="button"
            @click="undo"
          >
            <Undo2Icon
              class="h-3.5 w-3.5"
              :size="14"
            />
            <span
              v-if="undoCount"
              class="badge badge-xs"
              >{{ undoCount }}</span
            >
          </button>
          <button
            class="btn btn-xs btn-ghost"
            :disabled="!canRedo"
            :title="redoHint ?? undefined"
            :aria-label="t('text.e8f69d1ab3')"
            type="button"
            @click="redo"
          >
            <Redo2Icon
              class="h-3.5 w-3.5"
              :size="14"
            />
            <span
              v-if="redoCount"
              class="badge badge-xs"
              >{{ redoCount }}</span
            >
          </button>
          <div class="divider divider-horizontal mx-0.5 h-5 self-center" />
        </template>
        <ListViewSettings
          :fields="viewFields"
          :value="viewState"
          @change="onViewSettingsChange"
        />
        <!-- 筛选 popover 触发器 -->
        <button
          ref="filterTrigger"
          class="btn btn-ghost btn-sm gap-1"
          :class="{ 'btn-active': isQueryActive }"
          type="button"
          @click="toggleFilterPopover"
        >
          <FunnelIcon
            class="h-4 w-4"
            :size="16"
          />
          {{ t('text.b5f15473fd') }}
          <span
            v-if="isQueryActive"
            class="badge badge-primary badge-xs"
            >{{ filterQuery.rules.length }}</span
          >
        </button>
        <!-- 快捷清除筛选：有筛选时工具栏一键还原 -->
        <button
          v-if="isQueryActive && !isSelectMode"
          class="btn btn-ghost btn-sm gap-1"
          data-testid="clear-filter"
          type="button"
          @click="resetFilter"
        >
          <XIcon
            class="h-3.5 w-3.5"
            :size="14"
          />
          {{ t('text.657d9cbf45') }}
        </button>
        <button
          v-if="!isCreateBlocked && isSelectMode"
          class="btn btn-sm btn-outline"
          type="button"
          @click="openCreateDialog"
        >
          {{ t('text.e514cb19f5') }}
        </button>
        <button
          v-else-if="!isCreateBlocked && isM2m"
          class="btn btn-primary btn-sm"
          type="button"
          @click="openM2mSelectDialog"
        >
          {{ t('text.42bb5c118d') }}
        </button>
        <button
          v-else-if="!isCreateBlocked"
          class="btn btn-primary btn-sm"
          type="button"
          @click="openCreateDialog"
        >
          {{ t('text.a91e87b292') }}
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
          ref="filterPanel"
          class="border-base-300 bg-base-100 rxdb-filter-popover-panel max-h-[70dvh] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border p-3 shadow-lg"
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
              type="button"
              @click="resetFilter"
            >
              {{ t('text.cb5d682bac') }}
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!pendingQueryValid"
              type="button"
              @click="applyFilter"
            >
              {{ t('text.fac2a67ad8') }}
            </button>
          </div>
        </div>
      </template>
    </Teleport>

    <div
      v-if="reorderError"
      class="alert alert-error alert-soft mx-4 mt-2 py-2 text-sm"
      role="alert"
    >
      {{ t('text.10bbe3c44d', { p0: reorderError }) }}
    </div>

    <!-- 删除被存储层拒绝 -->
    <div
      v-if="deleteError"
      class="alert alert-error alert-soft mx-4 mt-2 py-2 text-sm"
      role="alert"
      data-testid="delete-error"
    >
      {{ t('text.9619d77cba', { p0: deleteError }) }}
    </div>

    <!-- 表格主体 -->
    <div class="min-h-0 flex-1">
      <QueryTable
        :key="namespace + ':' + name + ':' + viewState.groupBy"
        ref="queryTableRef"
        :columns="tableColumns"
        :filtered-count="filteredCount"
        :load-more="loadMore"
        :loading="isInitialLoading"
        :loading-more="isLoadingMore"
        :query-active="isQueryActive"
        :records="tableRecords"
        :row-drag-enabled="rowDragEnabled"
        :table-options="listTableOptions"
        @batch-updated="onBatchUpdated"
        @cell-changed="onCellChanged"
        @icon-clicked="onIconClicked"
        @row-deleted="onRowDeleted"
        @row-moved="onRowMoved"
        @sort-clicked="onSortClicked"
      >
        <template #emptyState>
          <div
            class="flex flex-col items-center gap-1 py-10"
            data-testid="entity-empty-state"
          >
            <span class="text-base-content/40 text-sm">{{ t('common.noData') }}</span>
            <span
              v-if="!isSelectMode && !isCreateBlocked"
              class="text-base-content/40 text-sm"
            >
              {{ t('text.0d4d0cde26', { p0: displayName }) }}
            </span>
          </div>
        </template>
      </QueryTable>
    </div>

    <!-- Select mode footer -->
    <div
      v-if="isSelectMode"
      class="border-base-300 flex shrink-0 items-center justify-between border-t px-4 py-3"
    >
      <span
        v-if="selectedCount > 0"
        class="text-base-content/70 text-sm"
        >{{ t('text.dfd3db5fee', { p0: selectedCount }) }}</span
      >
      <span
        v-else
        class="text-base-content/40 text-sm"
        >{{ t('text.f2baa39ff0', { p0: displayName }) }}</span
      >
      <div class="flex gap-2">
        <button
          class="btn btn-sm"
          type="button"
          @click="cancelSelection"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="selectedCount === 0"
          type="button"
          @click="confirmSelection"
        >
          {{ t('text.72dde8dfef') }}
        </button>
      </div>
    </div>

    <!-- 新增（create）详情对话框 -->
    <DialogPortal
      v-if="createDialogData"
      height="80vh"
      min-height="300px"
      min-width="min(400px, calc(100vw - 1rem))"
      panel-class="entity-detail-dialog"
      width="min(720px, calc(100vw - 1rem))"
      @closed="onCreateDialogClosed"
    >
      <EntityDetail
        v-bind="createDialogData"
        @form-submitted="onCreateFormSubmitted"
      />
    </DialogPortal>

    <!-- 查看（edit）详情对话框 -->
    <DialogPortal
      v-if="viewDialogData"
      height="80vh"
      min-height="300px"
      min-width="min(400px, calc(100vw - 1rem))"
      panel-class="entity-detail-dialog"
      width="min(720px, calc(100vw - 1rem))"
      @closed="onViewDialogClosed"
    >
      <EntityDetail v-bind="viewDialogData" />
    </DialogPortal>

    <!-- 删除确认弹层 -->
    <DialogPortal
      v-if="deleteConfirmRecord"
      panel-class="entity-delete-confirm-dialog"
      width="min(420px, calc(100vw - 1rem))"
      @closed="cancelDelete"
    >
      <EntityDialog
        :title="t('text.fe43bc43c2')"
        @close-requested="cancelDelete"
      >
        <p class="text-sm">{{ t('text.2ec52fff03', { p0: displayName }) }}</p>
        <div class="flex justify-end gap-2 pt-3">
          <button
            class="btn btn-sm"
            type="button"
            @click="cancelDelete"
            >{{ t('common.cancel') }}</button
          >
          <button
            class="btn btn-error btn-sm"
            data-testid="delete-confirm-submit"
            type="button"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </EntityDialog>
    </DialogPortal>

    <!-- M2M Selection Dialog -->
    <DialogPortal
      v-if="m2mDialogOpen"
      height="70vh"
      min-height="300px"
      min-width="min(400px, calc(100vw - 1rem))"
      panel-class="entity-m2m-select-dialog"
      width="min(720px, calc(100vw - 1rem))"
      @closed="m2mDialogOpen = false"
    >
      <EntityDialog
        :title="t('text.bdb86a1198', { p0: displayName })"
        @close-requested="m2mCancelSelection"
      >
        <EntityList
          :already-linked-ids="m2mAlreadyLinkedIds"
          :name="name"
          :namespace="namespace"
          mode="select"
          @selection-cancelled="m2mCancelSelection"
          @selection-confirmed="onM2mSelectionConfirmed"
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
