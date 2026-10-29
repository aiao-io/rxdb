import { getEntityMetadata, RelationKind, RxDB, type EntityMetadata, type EntityType } from '@aiao/rxdb';
import type {
  DetailTab,
  DetailTableTab,
  EntityFormData,
  EntityInstance,
  FormFieldChangeEvent,
  FormFieldConfig,
  FormMode,
  FormValidationResult,
  RelatedEntityProvider
} from '@aiao/rxdb-model';
import {
  buildDetailTabs,
  buildFormFields,
  entityToFormData,
  formDataToEntityChanges,
  validateForm
} from '@aiao/rxdb-model';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ErrorHandler,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  type EffectCleanupRegisterFn,
  type InputSignal
} from '@angular/core';
import { EntityDialogComponent } from '../entity-dialog/entity-dialog.component';
import { EntityFormComponent } from '../entity-form/rxdb-entity-form-angular';
import { EntityListComponent } from '../entity-list/entity-list.component';

/** CDK Dialog 传入的数据结构 */
export interface EntityDetailDialogData {
  metadata: EntityMetadata;
  formFields: FormFieldConfig[];
  formData: EntityFormData;
  formMode: FormMode;
  /** 编辑模式：按 id 从 Repository 加载实体实例；缺省时表单数据为纯透传 */
  entityId?: string;
  /** 已打开详情对话框的记录 id 栈（含当前记录），关系 tab 列表据此阻断无限套娃 */
  editChain?: string[];
  relatedEntityProvider?: RelatedEntityProvider;
  /** 预填充的外键数据（不可编辑），用于级联新增场景 */
  fixedFormData?: EntityFormData;
  /** 委托保存：不创建草稿实体，仅 emit formSubmitted 让调用方处理 */
  delegateSave?: boolean;
  /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
  creationChain?: string[];
}

let nextDetailId = 0;

/** 编辑目标：实体类、id、表单模式任一变化都是新目标（数据库经 DI 注入，组件生命周期内不变）。 */
interface EditTarget {
  readonly cls: EntityType | null;
  readonly id: string | undefined;
  readonly mode: FormMode;
}

/** 编辑目标的加载结果：实例与失败原因都只属于 `target`，目标一换即失效。 */
interface EditLoad {
  readonly target: EditTarget;
  readonly instance: EntityInstance | null;
  readonly error: string | null;
}

const sameEditTarget = (a: EditTarget, b: EditTarget): boolean => a.cls === b.cls && a.id === b.id && a.mode === b.mode;

/** 加载失败：可读原因进错误面板（与保存失败同形）。 */
const loadErrorMessage = (error: unknown): string =>
  `加载失败：${error instanceof Error ? error.message : String(error)}`;

/**
 * Tab 式实体详情组件：基础表单 Tab + 每个一对多/多对多关系一个表格 Tab；
 * create 模式先生成内存草稿实体，校验通过并保存时才落库；
 * edit 模式按 `entityId`（路由输入或 DIALOG_DATA）从 Repository 加载实例，保存时内部落库。
 * 关系 Tab 内嵌的实体列表可继续打开子实体详情对话框（套娃），由 `editChain` 阻断环。
 */
@Component({
  selector: 'rxdb-entity-detail',
  imports: [EntityFormComponent, EntityListComponent, EntityDialogComponent],
  templateUrl: './entity-detail.html',
  styleUrl: './entity-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityDetailComponent {
  readonly #dialogRef = inject(DialogRef, { optional: true });
  readonly #dialogData = inject(DIALOG_DATA, { optional: true }) as EntityDetailDialogData | null;
  readonly #rxdb = inject(RxDB, { optional: true }) as RxDB | null;
  readonly #errorHandler = inject(ErrorHandler);

  /** 创建模式下的草稿实体实例（立即创建，不保存） */
  #draftEntity: EntityInstance | null = null;

  // 根据 namespace + name 查找对应实体类
  readonly #entityCls = computed<EntityType | null>(() => {
    const rxdb = this.#rxdb;
    if (!rxdb) return null;
    const ns = this.namespace();
    const nm = this.name();
    if (!ns || !nm) return null;
    return (
      rxdb.config.entities.find(cls => {
        const meta = getEntityMetadata(cls);
        return meta.namespace === ns && meta.name === nm;
      }) ?? null
    );
  });

  /** Dialog / metadata input 传入的实体类（根据 metadata 查找） */
  readonly #entityClsFromDialog = computed<EntityType | null>(() => {
    const rxdb = this.#rxdb;
    const meta = this.metadata() ?? this.#dialogData?.metadata;
    if (!rxdb || !meta) return null;
    return (
      rxdb.config.entities.find(cls => {
        const m = getEntityMetadata(cls);
        return m.namespace === meta.namespace && m.name === meta.name;
      }) ?? null
    );
  });

  readonly #metadataFromRouteInputs = computed<EntityMetadata | null>(() => {
    const cls = this.#entityCls();
    return cls ? getEntityMetadata(cls) : null;
  });

  readonly #formFieldsFromRouteInputs = computed<FormFieldConfig[] | null>(() => {
    const meta = this.#metadataFromRouteInputs();
    if (!meta) return null;
    return buildFormFields(meta, this.formModeValue);
  });

  /** 当前编辑目标；字段都没变时保持同一个对象，加载结果凭对象身份认领目标。 */
  readonly #editTarget = computed<EditTarget>(
    () => ({
      cls: this.#entityCls() ?? this.#entityClsFromDialog(),
      id: this.entityId() ?? this.#dialogData?.entityId,
      mode: this.formModeValue
    }),
    { equal: sameEditTarget }
  );

  /** 最近一次加载结果（带着所属目标），由加载 effect 写入。 */
  readonly #editLoad = signal<EditLoad | null>(null);

  /** 属于当前目标的加载结果：目标一变立即为空，不等旧查询退订、新查询发射。 */
  readonly #currentLoad = computed<EditLoad | null>(() => {
    const load = this.#editLoad();
    return load?.target === this.#editTarget() ? load : null;
  });

  readonly #entityInstance = computed<EntityInstance | null>(() => this.#currentLoad()?.instance ?? null);

  /**
   * 编辑代次：目标切换与组件销毁（加载 effect 清理）、取消都推进。
   * 异步保存收尾时代次未变、当前实例仍是提交的那一个，才关闭对话框、发事件、写错误面板；
   * 目标切换后 effect 尚未重跑的空档里，`#entityInstance` 已经为空，同样判为过期。
   */
  #editGeneration = 0;

  /** 加载失败原因（编辑实体查询报错）：实体未就绪期间只剩取消可用，原因需可见。 */
  protected readonly loadError = computed<string | null>(() => this.#currentLoad()?.error ?? null);

  /**
   * 编辑目标未就绪（查询未发射或已失败）：拦截提交，表单内部动作隐藏，tabs 下方只留取消。
   * 没有注入数据库时无从加载，`entityId` 只随表单数据透传，不算等待。
   */
  protected readonly isEditPending = computed(
    () => this.#rxdb !== null && !this.isCreateMode() && !!this.#editTarget().id && this.#entityInstance() === null
  );

  // 路由参数输入（与 namespace/name/entityId 路由参数绑定）
  readonly namespace = input<string>();
  readonly name = input<string>();
  readonly entityId = input<string>();

  /** 唯一的 radio group name，避免多个 EntityDetailComponent 实例之间的 radio 冲突 */
  readonly tabGroupName = `detail-tabs-${nextDetailId++}`;

  // 直接绑定输入
  readonly metadata: InputSignal<EntityMetadata | undefined> = input<EntityMetadata | undefined>(undefined);
  readonly formFields = input<FormFieldConfig[]>();
  readonly formData = input<EntityFormData>();
  readonly formMode = input<FormMode | undefined>(undefined);
  readonly relatedEntityProvider = input<RelatedEntityProvider>();

  /**
   * 已打开详情对话框的记录 id 栈（含当前记录）的 input。
   *
   * @remarks 绑定名是 `editChain`，与 React / Vue 的同名 prop 对齐；同名类成员 `editChain`
   * 是 input 与 DIALOG_DATA 合并后的有效值（main 起就公开），所以 input 以别名声明。
   */
  readonly editChainInput = input<string[] | undefined>(undefined, { alias: 'editChain' });

  /** 预填充的外键数据（不可编辑），用于级联新增场景 */
  readonly fixedFormData = input<EntityFormData>();

  /** 委托保存：不创建草稿实体，仅 emit formSubmitted 让调用方处理 */
  readonly delegateSave = input<boolean>();

  /**
   * 祖先创建链路（实体类型 `namespace:name`）的 input，用于阻断循环创建。
   *
   * @remarks 绑定名是 `creationChain`，与 React / Vue 的同名 prop 对齐；同名类成员 `creationChain`
   * 是追加了当前实体之后的有效链路（main 起就公开），所以 input 以别名声明。
   */
  readonly creationChainInput = input<string[] | undefined>(undefined, { alias: 'creationChain' });

  readonly formSubmitted = output<EntityFormData>();
  readonly formCancelled = output<void>();
  readonly fieldChanged = output<FormFieldChangeEvent>();
  readonly validationErrors = output<FormValidationResult>();

  /** 是否使用外部保存模式（create 模式下，保存/取消按钮在 tabs 下面，而非 form 内） */
  readonly isCreateMode = computed(() => this.formModeValue === 'create');

  /** 当前表单编辑数据（create 模式下跟踪用户输入） */
  readonly draftFormData = signal<EntityFormData>({});

  /** 暴露草稿实体给模板（关系 tab 的 entity-list 需要） */
  readonly draftEntitySignal = signal<EntityInstance | null>(null);

  /** 校验错误面板：最近一次提交的校验结果（React/Vue 同语义，US-104）。 */
  readonly formErrors = signal<FormValidationResult | null>(null);
  /** 保存失败原因（校验错误以外的落库错误）。 */
  readonly saveError = signal<string | null>(null);

  /** 父实体（草稿或已保存实例），用于关系 tab 的 entity-list */
  readonly parentEntityForRelation = computed<EntityInstance | null>(() => {
    return this.draftEntitySignal() ?? this.#entityInstance();
  });

  /** 弹框标题 */
  readonly dialogTitle = computed(() => {
    const meta = this.metadataValue;
    const mode = this.formModeValue;
    const name = meta?.displayName ?? meta?.name ?? '';
    return mode === 'create' ? `新建${name}` : name;
  });

  /** 创建链路：当前实体 + 祖先链路，传递给子 entity-list 以阻断循环创建（祖先链路 input 优先，缺省回退 DIALOG_DATA） */
  readonly creationChain = computed<string[]>(() => {
    const parentChain = this.creationChainInput() ?? this.#dialogData?.creationChain ?? [];
    if (!this.isCreateMode()) return parentChain;
    const meta = this.metadataValue;
    if (!meta) return parentChain;
    const key = `${meta.namespace}:${meta.name}`;
    return parentChain.includes(key) ? parentChain : [...parentChain, key];
  });

  /** 已打开详情对话框的记录 id 栈（input 优先，缺省回退 DIALOG_DATA，含当前记录），关系 tab 列表据此阻断无限套娃 */
  readonly editChain = computed<string[]>(() => this.editChainInput() ?? this.#dialogData?.editChain ?? []);

  /** 当前活动关系 tab 的 relationName（用于子实体注册关系） */
  readonly activeRelationName = computed<string | undefined>(() => {
    const tab = this.activeTab();
    return tab?.type === 'table' ? (tab as DetailTableTab).relationName : undefined;
  });

  readonly tabs = computed(() => {
    const meta = this.metadataValue;
    if (!meta) return [];
    const chain = this.creationChain();
    return buildDetailTabs(meta).filter(tab => {
      if (tab.type !== 'table') return true;
      const t = tab as DetailTableTab;
      const key = `${t.relatedNamespace}:${t.relatedEntityName}`;
      return !chain.includes(key);
    });
  });
  readonly activeTabKey = linkedSignal<DetailTab[], string>({
    source: this.tabs,
    computation: tabs => tabs[0]?.key ?? 'basic'
  });

  readonly activeTab = computed(() => this.tabs().find(t => t.key === this.activeTabKey()));

  // 公开访问器 - 优先级：直接 input > 路由推导 > dialog data。
  // 三者都缺（独立使用且路由参数解析不到实体）时与 React / Vue 一致降级为 undefined / []，
  // 不在模板变更检测里抛 TypeError
  get metadataValue(): EntityMetadata | undefined {
    return this.metadata() ?? this.#metadataFromRouteInputs() ?? this.#dialogData?.metadata;
  }

  get formFieldsValue(): FormFieldConfig[] {
    const fields = this.formFields() ?? this.#formFieldsFromRouteInputs() ?? this.#dialogData?.formFields ?? [];
    const fixed = this.fixedFormDataValue;
    if (!fixed) return fields;
    return fields.map(f => (f.field in fixed ? { ...f, readonly: true } : f));
  }

  get formDataValue(): EntityFormData {
    if (this.isCreateMode()) {
      const draft = this.draftFormData();
      const fixed = this.fixedFormDataValue;
      return fixed ? { ...draft, ...fixed } : draft;
    }
    const inst = this.#entityInstance();
    if (inst) return entityToFormData(inst as Record<string, unknown>, this.formFieldsValue ?? []);
    const base = this.formData() ?? this.#dialogData?.formData ?? {};
    const fixed = this.fixedFormDataValue;
    return fixed ? { ...base, ...fixed } : base;
  }

  get formModeValue(): FormMode {
    return this.formMode() ?? this.#dialogData?.formMode ?? 'edit';
  }

  get relatedEntityProviderValue(): RelatedEntityProvider | undefined {
    return this.relatedEntityProvider() ?? this.#dialogData?.relatedEntityProvider;
  }

  /** 预填充外键数据（input 优先，缺省回退 DIALOG_DATA） */
  get fixedFormDataValue(): EntityFormData | undefined {
    return this.fixedFormData() ?? this.#dialogData?.fixedFormData;
  }

  /** 是否委托保存（input 优先，缺省回退 DIALOG_DATA） */
  get delegateSaveValue(): boolean {
    return this.delegateSave() ?? this.#dialogData?.delegateSave ?? false;
  }

  constructor() {
    // create 模式草稿实体生命周期。DIALOG_DATA 在构造期就齐了：同步建草稿，
    // Dialog.open() 返回时调用方即可读到（React 端 useState 初始化同一时机）。
    this.#ensureDraftEntity(this.formModeValue, this.delegateSaveValue, this.#entityClsFromDialog());
    // 独立使用语境的 inputs 要到首次变更检测才写入，由 effect 补建。只追踪与 Vue 端 watch 相同的
    // 触发源（metadata 及其实体类 / formMode / delegateSave），且先读触发源再进 untracked：
    // 草稿存续期间的重跑不会丢依赖；formData / fixedFormData / formFields 只在建草稿那一刻取值，
    // 改动它们不会再建草稿。保存或取消后，触发源再变（换实体、切模式）才开始新一轮创建。
    effect(() => {
      const mode = this.formModeValue;
      const delegateSave = this.delegateSaveValue;
      const cls = this.#entityClsFromDialog();
      untracked(() => this.#ensureDraftEntity(mode, delegateSave, cls));
    });
    // edit 模式按目标加载实例：目标一变（或组件销毁）先作废旧会话、退订旧查询，再订阅新目标
    effect(onCleanup => {
      const target = this.#editTarget();
      untracked(() => this.#loadEditTarget(target, onCleanup));
    });
  }

  selectTab(key: string): void {
    const targetTab = this.tabs().find(t => t.key === key);
    if (this.isCreateMode() && targetTab?.type === 'table') {
      const fields = this.formFieldsValue;
      const data = this.draftFormData();
      const fixed = this.fixedFormDataValue;
      const merged = fixed ? { ...data, ...fixed } : data;
      const result = validateForm(fields, merged);
      if (!result.valid) {
        this.onValidationErrors(result);
        return;
      }
      this.#syncDraftEntity();
    }
    this.activeTabKey.set(key);
  }

  onFormDataChanged(data: EntityFormData): void {
    this.draftFormData.set(data);
  }

  onFormSubmitted(data: EntityFormData): void {
    // 表单内部动作已隐藏，回车仍会提交：目标未就绪时既不能写旧实例，也不能当成透传成功
    if (this.isEditPending()) return;
    // create 模式与无实例（纯表单数据透传）保持 delegate 语义：只 emit 由宿主处理
    if (this.isCreateMode()) {
      this.formSubmitted.emit(data);
      return;
    }
    const inst = this.#entityInstance();
    if (!inst) {
      this.formSubmitted.emit(data);
      return;
    }
    // edit 模式内部保存：变更应用到已加载实例并落库，成功后关闭对话框并通知宿主
    const changes = formDataToEntityChanges(inst as Record<string, unknown>, data, this.formFieldsValue);
    Object.assign(inst as Record<string, unknown>, changes);
    const generation = this.#editGeneration;
    // 保存期间切了目标、取消或销毁：迟到的结果属于旧视图，不再关闭对话框、发事件或写错误面板
    const isCurrent = (): boolean => generation === this.#editGeneration && this.#entityInstance() === inst;
    inst
      .save()
      .then(() => {
        if (!isCurrent()) return;
        this.#dialogRef?.close('saved');
        this.formSubmitted.emit(data);
      })
      .catch(e => {
        if (!isCurrent()) return;
        this.saveError.set(this.#saveErrorMessage(e));
      });
  }

  onFormCancelled(): void {
    this.#editGeneration++;
    this.#cleanupDraftEntity();
    this.formCancelled.emit();
    this.#dialogRef?.close();
  }

  onFieldChanged(event: FormFieldChangeEvent): void {
    if (this.isCreateMode()) {
      this.draftFormData.update(d => ({ ...d, [event.field]: event.value }));
    }
    this.formErrors.set(null);
    this.saveError.set(null);
    this.fieldChanged.emit(event);
  }

  onValidationErrors(result: FormValidationResult): void {
    this.formErrors.set(result);
    this.saveError.set(null);
    this.validationErrors.emit(result);
  }

  /** 外部保存按钮（create 模式） */
  onSave(): void {
    const fields = this.formFieldsValue;
    const data = this.draftFormData();
    const fixed = this.fixedFormDataValue;
    const merged = fixed ? { ...data, ...fixed } : data;
    const result = validateForm(fields, merged);
    if (!result.valid) {
      this.onValidationErrors(result);
      return;
    }
    if (this.#draftEntity) {
      this.#syncDraftEntity();
      this.#draftEntity
        .save()
        .then(() => {
          this.#draftEntity = null;
          this.draftEntitySignal.set(null);
          this.#dialogRef?.close('saved');
        })
        .catch(e => this.saveError.set(this.#saveErrorMessage(e)));
    } else {
      this.formSubmitted.emit(merged);
      this.#dialogRef?.close();
    }
  }

  onCancel(): void {
    this.onFormCancelled();
  }

  buildFixedQuery(tab: DetailTableTab): { combinator: 'and'; rules: unknown[] } | undefined {
    const entityId = this.#draftEntity?.id ?? (this.formDataValue as Record<string, unknown>)['id'];
    if (!entityId) return undefined;

    if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
      return { combinator: 'and', rules: [{ field: tab.foreignKeyField, operator: '=', value: entityId }] };
    }

    if (tab.relationKind === RelationKind.MANY_TO_MANY && tab.mappedProperty) {
      return { combinator: 'and', rules: [{ field: `${tab.mappedProperty}.id`, operator: '=', value: entityId }] };
    }

    return undefined;
  }

  buildFixedFormData(tab: DetailTableTab): EntityFormData | undefined {
    const entityId = this.#draftEntity?.id ?? (this.formDataValue as Record<string, unknown>)['id'];
    if (!entityId) return undefined;

    if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
      return { [tab.foreignKeyField]: entityId };
    }

    return undefined;
  }

  /**
   * create 模式按需建内存草稿实体（不落库）。
   *
   * @remarks 草稿只认 metadata（input 或 DIALOG_DATA）对应的实体类，与 React / Vue 一致：
   * 只给 namespace + name 的路由输入用法不建草稿，保存走 formSubmitted。字段配置先于实例化
   * 求值，它抛错时不会留下半初始化、又因已有草稿而永不重建的状态。
   */
  #ensureDraftEntity(mode: FormMode, delegateSave: boolean, cls: EntityType | null): void {
    if (this.#draftEntity || mode !== 'create' || delegateSave || !cls) return;
    const fields = this.formFieldsValue;
    const merged = { ...(this.formData() ?? this.#dialogData?.formData ?? {}), ...this.fixedFormDataValue };
    const draft = new (cls as new (...args: unknown[]) => unknown)(merged) as EntityInstance;
    this.#draftEntity = draft;
    this.draftEntitySignal.set(draft);
    this.draftFormData.set(entityToFormData(draft as Record<string, unknown>, fields));
  }

  /**
   * 订阅编辑目标的实体查询，结果带着目标写回。
   *
   * @remarks 目标切换或组件销毁时由 effect 清理推进代次并退订；迟到的旧结果即便写回，
   * 也因目标身份不符不会显示或被保存。查询失败只记在本目标名下，已加载的实例保留（与 Vue 端一致），
   * 原因进错误面板。
   */
  #loadEditTarget(target: EditTarget, onCleanup: EffectCleanupRegisterFn): void {
    onCleanup(() => this.#editGeneration++);
    const rxdb = this.#rxdb;
    const { cls, id } = target;
    if (!rxdb || !cls || !id) return;
    const subscription = rxdb.entityManager
      .getRepository(cls)
      .get(id)
      .subscribe({
        next: instance => this.#editLoad.set({ target, instance: instance as EntityInstance, error: null }),
        error: (error: unknown) => {
          this.#errorHandler.handleError(error);
          this.#editLoad.update(load => ({
            target,
            instance: load?.target === target ? load.instance : null,
            error: loadErrorMessage(error)
          }));
        }
      });
    onCleanup(() => subscription.unsubscribe());
  }

  /** 将表单数据同步到草稿实体 */
  #syncDraftEntity(): void {
    if (!this.#draftEntity) return;
    const data = this.draftFormData();
    const fixed = this.fixedFormDataValue;
    const merged = fixed ? { ...data, ...fixed } : data;
    Object.assign(this.#draftEntity, merged);
  }

  /** 清理草稿实体缓存 */
  #cleanupDraftEntity(): void {
    if (!this.#draftEntity || !this.#rxdb) return;
    this.#rxdb.entityManager.removeEntityCache(this.#draftEntity);
    this.#draftEntity = null;
    this.draftEntitySignal.set(null);
  }

  /** 落库失败：可读原因进错误面板（不再只进 ErrorHandler，US-104）。 */
  #saveErrorMessage(error: unknown): string {
    return `保存失败：${error instanceof Error ? error.message : String(error)}`;
  }
}
