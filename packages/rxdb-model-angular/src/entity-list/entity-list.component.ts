import { getEntityMetadata, RelationKind, RxDB, type EntityType, type FindByCursorOptions } from '@aiao/rxdb';
import { InfiniteScrollingList } from '@aiao/rxdb-angular';
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
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ErrorHandler,
  forwardRef,
  HostListener,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  runInInjectionContext,
  signal,
  TemplateRef,
  viewChild,
  type WritableSignal
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { LucideFunnel as Funnel, LucideDynamicIcon, LucideRedo2 as Redo2, LucideUndo2 as Undo2 } from '@lucide/angular';
import type { ColumnsDefine } from '@visactor/vtable';
import { of } from 'rxjs';
import type { EntityDetailDialogData } from '../entity-detail/entity-detail';
import { EntityDialogComponent } from '../entity-dialog/entity-dialog.component';
import { QueryTableComponent } from '../entity-table/query-table/query-table.component';
import { QueryBuilderComponent } from '../query-builder/query-builder/query-builder.component';

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

/**
 * 实体列表组件
 *
 * 封装了实体列表的完整 UI：工具栏（显示名称、筛选、撤销/重做、新增）+ 数据表格。
 * 通过 `namespace` 和 `name` 输入定位 RxDB 实体，实现懒加载分页和 CRUD 操作。
 *
 * @example
 * ```html
 * <rxdb-entity-list [namespace]="namespace()" [name]="name()" />
 * ```
 */
@Component({
  selector: 'rxdb-entity-list',
  templateUrl: './entity-list.component.html',
  host: {
    style: 'display:flex;flex-direction:column;height:100%;overflow:hidden'
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QueryTableComponent,
    QueryBuilderComponent,
    LucideDynamicIcon,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    forwardRef(() => EntityListComponent),
    forwardRef(() => EntityDialogComponent)
  ]
})
/**
 * 实体列表组件：以 namespace + name 定位实体元数据，提供无限滚动表格、行内编辑、
 * 撤销/重做（依赖 @aiao/rxdb-plugin-history）、筛选弹层（内嵌查询构建器）、
 * 级联新增与多对多选择模式。
 */
export class EntityListComponent {
  #m2mDialogRef: DialogRef<unknown, void> | null = null;
  // ── Service injections ────────────────────────────────────────────────
  readonly #rxdb = inject(RxDB);
  readonly #injector = inject(Injector);
  readonly #dialog = inject(Dialog);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #destroyRef = inject(DestroyRef);

  // ── Save coalescing ───────────────────────────────────────────────────
  readonly #pendingChanges = new Map<string, Record<string, unknown>>();
  #flushHandle = false;

  // ── Entity registry ───────────────────────────────────────────────────
  readonly #entityClsMap = new Map<string, EntityType>(
    this.#rxdb.config.entities.map(cls => {
      const meta = getEntityMetadata(cls);
      return [`${meta.namespace}:${meta.name}`, cls] as const;
    })
  );

  readonly #modelInfoMap = new Map<string, ModelInfo>(
    this.#rxdb.config.entities.map(cls => {
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

  readonly #scrollListMap = new Map<string, InfiniteScrollingList<EntityType>>();

  readonly #columnsCache = new Map<string, ColumnsDefine>(
    this.#rxdb.config.entities.map(cls => {
      const meta = getEntityMetadata(cls);
      return [
        `${meta.namespace}:${meta.name}`,
        buildEditableColumns(meta, {
          relatedItemsProviderFactory: (fkField, relatedEntityName) => {
            const relCls = [...this.#entityClsMap.values()].find(c => {
              const m = getEntityMetadata(c);
              return m.name === relatedEntityName;
            });
            if (!relCls) return undefined;
            const relKey = (() => {
              const m = getEntityMetadata(relCls);
              return `${m.namespace}:${m.name}`;
            })();
            const list = this.#getOrCreateList(relKey, relCls);
            const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
            return () => {
              return (list.value() as Record<string, unknown>[]).map(inst => ({
                id: String(inst['id'] ?? ''),
                displayName: strVal(inst['displayName']) ?? strVal(inst['name']) ?? String(inst['id'] ?? '')
              }));
            };
          }
        })
      ] as const;
    })
  );

  readonly #vHistory = (this.#rxdb as unknown as { versionManager?: VersionManager }).versionManager?.history() ?? {
    undoCount$: of(0),
    redoCount$: of(0),
    undo: async () => undefined,
    redo: async () => undefined
  };
  readonly #entityKey = computed(() => `${this.namespace()}:${this.name()}`);
  readonly #currentList = signal<InfiniteScrollingList<EntityType> | undefined>(undefined);

  readonly #instances = computed<EntityInstance[]>(() => {
    const list = this.#currentList();
    return list ? (list.value() as EntityInstance[]) : [];
  });

  readonly #entityCls = computed(() => this.#entityClsMap.get(this.#entityKey()));

  /** 级联新增模式下本地草稿子实体（未保存到DB，由父实体级联保存） */
  readonly #localDraftItems = signal<EntityInstance[]>([]);

  /** 列头排序；切实体时重置为默认 id desc */
  readonly #sortState: WritableSignal<ListSortState> = linkedSignal(() => {
    this.namespace();
    this.name();
    return { ...DEFAULT_SORT_STATE };
  });

  // ── Protected view bindings ───────────────────────────────────────────
  protected readonly Undo2 = Undo2;
  protected readonly Redo2 = Redo2;
  protected readonly Funnel = Funnel;

  /** CDK Overlay 定位策略：优先下方右对齐，其次上方右对齐 */
  protected readonly overlayPositions = [
    {
      originX: 'end' as const,
      originY: 'bottom' as const,
      overlayX: 'end' as const,
      overlayY: 'top' as const,
      offsetY: 4
    },
    {
      originX: 'end' as const,
      originY: 'top' as const,
      overlayX: 'end' as const,
      overlayY: 'bottom' as const,
      offsetY: -4
    }
  ];

  protected readonly loadMore = computed(() => {
    const list = this.#currentList();
    return list ? () => list.loadMore() : undefined;
  });

  // ── Route inputs ──────────────────────────────────────────────────────
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();

  /** 固定查询条件，与用户筛选条件做 AND 合并（用于关系属性过滤，如 ownerId = currentId） */
  readonly fixedQuery = input<FilterQuery | undefined>(undefined);

  /** 外部导航传入的初始筛选条件（JSON 字符串），如 Query Builder「应用到实体浏览」 */
  readonly initialFilter = input<string | undefined>(undefined);

  /** 预填充的外键数据（级联新增时传递给子实体对话框） */
  readonly fixedFormData = input<EntityFormData | undefined>(undefined);

  /** 草稿父实体（用于级联新增场景，子实体通过关系API注册到父实体） */
  readonly draftParentEntity = input<EntityInstance | null>(null);

  /** 父实体上关系属性名（如 'children'），用于调用 parent.children$.add(child) */
  readonly parentRelationName = input<string | undefined>(undefined);

  /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
  readonly creationChain = input<string[]>([]);

  /** 已打开详情对话框的记录 id 栈（含祖先记录），「查看」前检查以防无限套娃 */
  readonly editChain = input<string[]>([]);

  /** 关系类型（MANY_TO_MANY 时启用选择模式） */
  readonly relationKind = input<RelationKind | undefined>(undefined);

  /** 父实体实例（用于 M2M 关系操作，包含 draft 和已保存实体） */
  readonly parentEntity = input<EntityInstance | null>(null);

  /** 列表模式：default=普通列表, select=选择模式（带 checkbox 列） */
  readonly mode = input<'default' | 'select'>('default');

  /** 已关联的实体 ID 集合（选择模式下过滤掉，不再展示） */
  readonly alreadyLinkedIds = input<Set<string>>(new Set());

  /** 点击「查看」按钮时触发，携带对应行记录；组件同时打开内置编辑对话框（记录已在 editChain 中或为未保存草稿时仅 emit） */
  readonly viewEntity = output<EntityTableRecord>();

  /** 选择模式：确认选择时触发，携带选中的实体实例 */
  readonly selectionConfirmed = output<EntityInstance[]>();

  /** 选择模式：取消选择时触发 */
  readonly selectionCancelled = output<void>();

  // ── Reactive state ────────────────────────────────────────────────────
  readonly filterQuery: WritableSignal<FilterQuery> = linkedSignal(() => {
    this.namespace();
    this.name();
    return { ...EMPTY_FILTER };
  });

  readonly $isFilterQuery = computed(() => this.filterQuery().rules.length > 0);

  readonly showFilterPopover = signal(false);

  readonly pendingQuery: WritableSignal<FilterQuery> = linkedSignal(() => {
    this.namespace();
    this.name();
    return { ...EMPTY_FILTER };
  });

  readonly pendingQueryValid = signal(true);

  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly displayName = computed(() => {
    const cls = this.#entityCls();
    if (!cls) return this.name();
    const meta = getEntityMetadata(cls);
    return meta.displayName ?? meta.name;
  });

  /** 当前实体是否存在于祖先创建链路中（循环创建检测） */
  readonly isCreateBlocked = computed(() => this.creationChain().includes(this.#entityKey()));

  readonly isQueryActive = computed(() => this.filterQuery().rules.length > 0);
  readonly filteredCount = computed(() => this.#instances().length + this.#localDraftItems().length);

  readonly isInitialLoading = computed(() => {
    const list = this.#currentList();
    return list ? list.isLoading() && list.value().length === 0 : false;
  });

  readonly isLoadingMore = computed(() => {
    const list = this.#currentList();
    return list ? list.isLoading() && list.value().length > 0 : false;
  });

  readonly undoCount = toSignal(this.#vHistory.undoCount$, { initialValue: 0 });
  readonly redoCount = toSignal(this.#vHistory.redoCount$, { initialValue: 0 });
  readonly canUndo = computed(() => this.undoCount() > 0);
  readonly canRedo = computed(() => this.redoCount() > 0);

  readonly queryBuilderFields = computed<FieldMetadata[]>(() => {
    const cls = this.#entityCls();
    if (!cls) return [];
    return organizeFields(extractFieldsFromMetadata(getEntityMetadata(cls), this.#modelInfoMap));
  });

  readonly tableRecords = computed<EntityTableRecord[]>(() => {
    const dbRecords = this.#instances().map(inst => ({ ...(inst as Record<string, unknown>) }));
    const draftRecords = this.#localDraftItems().map(inst => ({ ...(inst as Record<string, unknown>) }));
    let records: EntityTableRecord[] = [...draftRecords, ...dbRecords];
    if (this.isSelectMode()) {
      const linkedIds = this.alreadyLinkedIds();
      const selIds = this.selectedIds();
      records = records
        .filter(r => !linkedIds.has(r['id'] as string))
        .map(r => ({ ...r, __selected: selIds.has(r['id'] as string) }));
    }
    return records;
  });

  readonly tableColumns = computed<ColumnsDefine>(() => {
    const base = this.#columnsCache.get(this.#entityKey()) ?? [actionsColumn('操作', '删除', '查看')];
    if (this.isSelectMode()) {
      const withoutActions = base.filter(c => (c as Record<string, unknown>)['field'] !== 'actions');
      return [{ field: '__selected', title: '', cellType: 'checkbox', width: 50 }, ...withoutActions];
    }
    return base;
  });

  readonly createFormFieldConfigs = computed<FormFieldConfig[]>(() => {
    const cls = this.#entityCls();
    if (!cls) return [];
    const meta = getEntityMetadata(cls);
    return buildFormFields(meta, 'create');
  });

  // ── Select mode ───────────────────────────────────────────────────────
  readonly isSelectMode = computed(() => this.mode() === 'select');
  readonly isM2m = computed(() => this.relationKind() === RelationKind.MANY_TO_MANY);

  readonly m2mSelectTpl = viewChild<TemplateRef<void>>('m2mSelectTpl');

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly m2mAlreadyLinkedIds = computed<Set<string>>(() => {
    const dbIds = this.#instances().map(e => e.id);
    const draftIds = this.#localDraftItems().map(e => e.id);
    return new Set([...dbIds, ...draftIds]);
  });

  // ── Constructor ───────────────────────────────────────────────────────

  constructor() {
    toObservable(this.#entityKey)
      .pipe(takeUntilDestroyed())
      .subscribe(key => {
        const cls = this.#entityClsMap.get(key);
        if (!cls) {
          this.#currentList.set(undefined);
          return;
        }
        this.#currentList.set(this.#getOrCreateList(key, cls));
      });

    effect(() => {
      const parsed = parseInitialFilter(this.initialFilter());
      if (!parsed) return;
      this.pendingQuery.set(parsed);
      this.filterQuery.set(parsed);
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────

  toggleFilterPopover(): void {
    this.showFilterPopover.update(v => !v);
  }

  applyFilter(): void {
    this.filterQuery.set({ ...this.pendingQuery() });
    this.showFilterPopover.set(false);
  }

  resetFilter(): void {
    this.pendingQuery.set({ ...EMPTY_FILTER });
    this.filterQuery.set({ ...EMPTY_FILTER });
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      if (e.shiftKey) {
        if (this.canRedo()) {
          e.preventDefault();
          void this.redo();
        }
      } else {
        if (this.canUndo()) {
          e.preventDefault();
          void this.undo();
        }
      }
    }
  }

  onQueryChange(query: { combinator: 'and' | 'or'; rules: unknown[] } | undefined): void {
    this.pendingQuery.set(query ?? { ...EMPTY_FILTER });
  }

  onValidationChange(result: ValidationResult): void {
    this.pendingQueryValid.set(result.valid);
  }

  onCellChanged(event: CellChangeEvent): void {
    if (!event.field || event.field === 'actions') return;
    if (event.field === '__selected') {
      const id = event.record['id'] as string;
      this.selectedIds.update(set => {
        const next = new Set(set);
        if (event.value) next.add(id);
        else next.delete(id);
        return next;
      });
      return;
    }
    const id = event.record['id'] as string;
    const entityCls = this.#entityCls();
    let value = event.value;
    if (entityCls) {
      const prop = getEntityMetadata(entityCls).propertyMap.get(event.field);
      if (prop) value = parsePropertyColumnValue(prop.type, event.value);
    }
    this.#enqueue(id, { [event.field]: value });
  }

  undo(): void {
    this.#vHistory.undo();
  }

  redo(): void {
    this.#vHistory.redo();
  }

  async onIconClicked(event: { name: string; record: EntityTableRecord }): Promise<void> {
    if (event.name === 'view-action') {
      this.viewEntity.emit(event.record);
      await this.#openViewDialog(event.record);
      return;
    }
    if (event.name !== 'delete-action') return;
    const id = event.record['id'] as string;

    const draftInst = this.#localDraftItems().find(i => i.id === id);
    if (draftInst) {
      this.#localDraftItems.update(items => items.filter(i => i.id !== id));
      return;
    }

    const inst = this.#instances().find(i => i.id === id);
    if (!inst) return;
    try {
      await inst.remove();
    } catch (e) {
      this.#errorHandler.handleError(e);
    }
  }

  async onRowDeleted(event: EntityTableRecord): Promise<void> {
    await this.onIconClicked({ name: 'delete-action', record: event });
  }

  onBatchUpdated(mutations: BatchChangeItem[]): void {
    for (const { recordId, changes } of mutations) {
      const filtered = Object.fromEntries(Object.entries(changes).filter(([k]) => k && k !== 'actions'));
      if (Object.keys(filtered).length) this.#enqueue(recordId, filtered);
    }
  }

  async openCreateDialog(): Promise<void> {
    if (this.isCreateBlocked()) return;

    const fields = this.createFormFieldConfigs();
    const cls = this.#entityCls();
    if (!cls || fields.length === 0) return;

    const meta = getEntityMetadata(cls);
    const relatedEntityProvider = this.#makeRelatedEntityProvider(this.draftParentEntity());

    const { EntityDetailComponent } = await import('../entity-detail/entity-detail');
    // 懒加载 chunk 期间组件可能已被销毁（如测试 teardown），销毁后不再打开对话框
    if (this.#destroyRef.destroyed) return;

    const dialogRef = this.#dialog.open(EntityDetailComponent, {
      width: '720px',
      minWidth: '400px',
      height: '80vh',
      minHeight: '300px',
      panelClass: 'entity-detail-dialog',
      data: {
        metadata: meta,
        formFields: fields,
        formData: {},
        formMode: 'create' as const,
        relatedEntityProvider,
        fixedFormData: this.fixedFormData(),
        delegateSave: !!this.draftParentEntity(),
        creationChain: this.creationChain()
      } satisfies EntityDetailDialogData
    });

    dialogRef.componentInstance!.formSubmitted.subscribe((result: EntityFormData) => {
      this.#handleCreateSubmit(result);
      dialogRef.close();
    });

    dialogRef.closed.subscribe(result => {
      if (result === 'saved') this.#currentList()?.refresh();
    });
  }

  // ── M2M / Select mode methods ─────────────────────────────────────────

  openM2mSelectDialog(): void {
    if (this.#m2mDialogRef) return;
    const tpl = this.m2mSelectTpl();
    if (!tpl) return;

    const ref = this.#dialog.open(tpl, {
      width: '720px',
      minWidth: '400px',
      height: '70vh',
      minHeight: '300px',
      panelClass: 'entity-m2m-select-dialog'
    });
    this.#m2mDialogRef = ref;

    ref.closed.subscribe(() => {
      this.#m2mDialogRef = null;
    });
  }

  onM2mSelectionConfirmed(entities: EntityInstance[]): void {
    const parent = this.parentEntity();
    const relName = this.parentRelationName();

    if (parent && relName) {
      const relation = (parent as Record<string, unknown>)[relName + '$'];
      if (relation && typeof (relation as Record<string, unknown>)['add'] === 'function') {
        (relation as { add(...args: unknown[]): void }).add(...entities);
      }

      if (!this.draftParentEntity()) {
        parent
          .save()
          .then(() => this.#currentList()?.refresh())
          .catch(e => this.#errorHandler.handleError(e));
      } else {
        this.#localDraftItems.update(items => [...items, ...entities]);
      }
    }

    this.#m2mDialogRef?.close();
  }

  m2mCancelSelection(): void {
    this.#m2mDialogRef?.close();
  }

  confirmSelection(): void {
    const ids = this.selectedIds();
    if (ids.size === 0) {
      this.selectionCancelled.emit();
      return;
    }
    const entities = this.#instances().filter(e => ids.has(e.id));
    this.selectionConfirmed.emit(entities);
  }

  cancelSelection(): void {
    this.selectionCancelled.emit();
  }

  /**
   * 列头排序点击：驱动 cursor orderBy 重查（VTable 客户端排序已禁用）。
   */
  onSortClicked(event: { field: unknown; order: unknown }): void {
    const field = normalizeSortField(event.field);
    if (!field) return;
    this.#sortState.set({ field, order: normalizeSortOrder(event.order) });
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * 「查看」行 → 打开 edit 详情对话框（内置弹窗修改）。
   * 关系 Tab 内嵌的列表同样走这里，套娃下钻；`editChain` 命中或未落库草稿时只 emit 不打开。
   */
  async #openViewDialog(record: EntityTableRecord): Promise<void> {
    const id = record['id'];
    if (typeof id !== 'string' || !id) return;
    if (this.editChain().includes(id)) return;
    if (this.#localDraftItems().some(i => i.id === id)) return;
    const cls = this.#entityCls();
    if (!cls) return;

    const meta = getEntityMetadata(cls);
    const fields = buildFormFields(meta, 'edit');

    const { EntityDetailComponent } = await import('../entity-detail/entity-detail');
    // 懒加载 chunk 期间组件可能已被销毁（如测试 teardown），销毁后不再打开对话框
    if (this.#destroyRef.destroyed) return;

    const dialogRef = this.#dialog.open(EntityDetailComponent, {
      width: '720px',
      minWidth: '400px',
      height: '80vh',
      minHeight: '300px',
      panelClass: 'entity-detail-dialog',
      data: {
        metadata: meta,
        formFields: fields,
        formData: {},
        formMode: 'edit' as const,
        entityId: id,
        editChain: [...this.editChain(), id],
        relatedEntityProvider: this.#makeRelatedEntityProvider(null)
      } satisfies EntityDetailDialogData
    });

    dialogRef.closed.subscribe(result => {
      if (result === 'saved') this.#currentList()?.refresh();
    });
  }

  /**
   * 关系字段下拉的数据源：按关联实体名（+可选 namespace）解析实体类并读出当前列表。
   * `draftParent` 存在时把草稿父实体并入候选（级联新增自引用场景）。
   */
  #makeRelatedEntityProvider(draftParent: EntityInstance | null): RelatedEntityProvider {
    const strVal = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
    return (entityName, namespace) => {
      const relCls = [...this.#entityClsMap.values()].find(c => {
        const m = getEntityMetadata(c);
        return m.name === entityName && (!namespace || m.namespace === namespace);
      });
      if (!relCls) return [];
      const relMeta = getEntityMetadata(relCls);
      const list = this.#getOrCreateList(`${relMeta.namespace}:${relMeta.name}`, relCls);
      const items = (list.value() as Record<string, unknown>[]).map(inst => ({
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
  }

  async #handleCreateSubmit(data: EntityFormData): Promise<void> {
    const cls = this.#entityCls();
    if (!cls) return;

    const parent = this.draftParentEntity();
    const relName = this.parentRelationName();

    if (parent && relName) {
      const child = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
      const relation = parent[relName + '$'] as { add(child: EntityInstance): void } | undefined;
      if (relation && typeof relation.add === 'function') {
        relation.add(child);
      }
      this.#localDraftItems.update(items => [...items, child]);
      return;
    }

    try {
      const inst = new (cls as new (...args: unknown[]) => unknown)(data) as EntityInstance;
      await inst.save();
      this.#currentList()?.refresh();
    } catch (e) {
      this.#errorHandler.handleError(e);
    }
  }

  #getOrCreateList(key: string, cls: EntityType): InfiniteScrollingList<EntityType> {
    const cached = this.#scrollListMap.get(key);
    if (cached) return cached;
    const options = computed<FindByCursorOptions<EntityType>>(() => {
      const userFilter = this.filterQuery();
      const fixed = this.fixedQuery();
      let where: FilterQuery;
      if (!fixed || fixed.rules.length === 0) {
        where = userFilter;
      } else if (userFilter.rules.length === 0) {
        where = fixed;
      } else {
        where = { combinator: 'and', rules: [...fixed.rules, ...userFilter.rules] };
      }
      // 关联实体下拉的 list 不跟主表列头排序，避免外键侧字段缺失
      const sortState = key === this.#entityKey() ? this.#sortState() : DEFAULT_SORT_STATE;
      return {
        where: where as never,
        orderBy: buildCursorOrderBy(sortState) as FindByCursorOptions<EntityType>['orderBy']
      };
    });
    const list = runInInjectionContext(this.#injector, () => new InfiniteScrollingList(this.#rxdb, cls, options));
    this.#scrollListMap.set(key, list);
    return list;
  }

  #enqueue(recordId: string, changes: Record<string, unknown>): void {
    const cur = this.#pendingChanges.get(recordId) ?? {};
    this.#pendingChanges.set(recordId, { ...cur, ...changes });
    if (this.#flushHandle) return;
    this.#flushHandle = true;
    queueMicrotask(() => {
      this.#flushHandle = false;
      const snapshot = [...this.#pendingChanges.entries()];
      this.#pendingChanges.clear();
      void this.#flushPending(snapshot);
    });
  }

  async #flushPending(pending: [string, Record<string, unknown>][]): Promise<void> {
    if (!pending.length) return;
    const EntityClass = this.#entityCls();
    if (!EntityClass) return;
    const toUpdate = new Set<EntityInstance>();
    const prevMap = new Map<EntityInstance, Record<string, unknown>>();
    const draftUpdated = new Set<EntityInstance>();
    for (const [id, changes] of pending) {
      let inst = this.#instances().find(i => i.id === id);
      const isDraft = !inst;
      if (!inst) {
        inst = this.#localDraftItems().find(i => i.id === id);
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

    // 草稿实体直接更新 signal 触发重渲染（不写DB）
    if (draftUpdated.size) {
      this.#localDraftItems.update(items => [...items]);
    }

    if (!toUpdate.size) return;

    const updateMap = new Map([[EntityClass, toUpdate as unknown as Set<unknown>]]);
    try {
      await this.#rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
    } catch (e) {
      this.#errorHandler.handleError(e);
      for (const [inst, prev] of prevMap) Object.assign(inst as Record<string, unknown>, prev);
    }
  }
}
