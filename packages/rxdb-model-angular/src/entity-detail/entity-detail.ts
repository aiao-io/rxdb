import { getEntityMetadata, RelationKind, RxDB, type EntityMetadata, type EntityType } from '@aiao/rxdb';
import type {
  DetailTab,
  DetailTableTab,
  EntityFormData,
  FormFieldChangeEvent,
  FormFieldConfig,
  FormMode,
  FormValidationResult,
  RelatedEntityProvider
} from '@aiao/rxdb-model';
import { buildDetailTabs, buildFormFields, entityToFormData, validateForm } from '@aiao/rxdb-model';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ErrorHandler,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  type InputSignal
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { EntityDialogComponent } from '../entity-dialog/entity-dialog.component';
import { EntityFormComponent } from '../entity-form/rxdb-entity-form-angular';
import { EntityListComponent } from '../entity-list/entity-list.component';

type EntityInstance = { [key: string]: unknown; readonly id: string; save(): Promise<void>; remove(): Promise<void> };

/** CDK Dialog 传入的数据结构 */
export interface EntityDetailDialogData {
  metadata: EntityMetadata;
  formFields: FormFieldConfig[];
  formData: EntityFormData;
  formMode: FormMode;
  relatedEntityProvider?: RelatedEntityProvider;
  /** 预填充的外键数据（不可编辑），用于级联新增场景 */
  fixedFormData?: EntityFormData;
  /** 委托保存：不创建草稿实体，仅 emit formSubmitted 让调用方处理 */
  delegateSave?: boolean;
  /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
  creationChain?: string[];
}

let nextDetailId = 0;

/**
 * Tab 式实体详情组件：基础表单 Tab + 每个一对多/多对多关系一个表格 Tab；
 * create 模式先生成内存草稿实体，校验通过并保存时才落库。
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

  /** Dialog 传入的实体类（根据 metadata 查找） */
  readonly #entityClsFromDialog = computed<EntityType | null>(() => {
    const rxdb = this.#rxdb;
    const meta = this.#dialogData?.metadata;
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

  readonly #entityInstance = toSignal(
    toObservable(computed(() => ({ cls: this.#entityCls(), id: this.entityId() }))).pipe(
      switchMap(({ cls, id }) => {
        if (!cls || !id || !this.#rxdb) return of(null);
        return this.#rxdb.entityManager.getRepository(cls).get(id);
      })
    ),
    { initialValue: null }
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

  /** 父实体（草稿或已保存实例），用于关系 tab 的 entity-list */
  readonly parentEntityForRelation = computed<EntityInstance | null>(() => {
    return this.draftEntitySignal() ?? (this.#entityInstance() as EntityInstance | null) ?? null;
  });

  /** 弹框标题 */
  readonly dialogTitle = computed(() => {
    const meta = this.metadataValue;
    const mode = this.formModeValue;
    const name = meta?.displayName ?? meta?.name ?? '';
    return mode === 'create' ? `新建${name}` : name;
  });

  /** 创建链路：当前实体 + 祖先链路，传递给子 entity-list 以阻断循环创建 */
  readonly creationChain = computed<string[]>(() => {
    const parentChain = this.#dialogData?.creationChain ?? [];
    if (!this.isCreateMode()) return parentChain;
    const meta = this.metadataValue;
    if (!meta) return parentChain;
    const key = `${meta.namespace}:${meta.name}`;
    return parentChain.includes(key) ? parentChain : [...parentChain, key];
  });

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

  // 公开访问器 - 优先级：直接 input > 路由推导 > dialog data
  get metadataValue(): EntityMetadata {
    return this.metadata() ?? this.#metadataFromRouteInputs() ?? this.#dialogData!.metadata;
  }

  get formFieldsValue(): FormFieldConfig[] {
    const fields = this.formFields() ?? this.#formFieldsFromRouteInputs() ?? this.#dialogData!.formFields;
    const fixed = this.#dialogData?.fixedFormData;
    if (!fixed) return fields;
    return fields.map(f => (f.field in fixed ? { ...f, readonly: true } : f));
  }

  get formDataValue(): EntityFormData {
    if (this.isCreateMode()) {
      const draft = this.draftFormData();
      const fixed = this.#dialogData?.fixedFormData;
      return fixed ? { ...draft, ...fixed } : draft;
    }
    const inst = this.#entityInstance();
    if (inst) return entityToFormData(inst as Record<string, unknown>, this.formFieldsValue ?? []);
    const base = this.formData() ?? this.#dialogData?.formData ?? {};
    const fixed = this.#dialogData?.fixedFormData;
    return fixed ? { ...base, ...fixed } : base;
  }

  get formModeValue(): FormMode {
    return this.formMode() ?? this.#dialogData?.formMode ?? 'edit';
  }

  get relatedEntityProviderValue(): RelatedEntityProvider | undefined {
    return this.relatedEntityProvider() ?? this.#dialogData?.relatedEntityProvider;
  }

  constructor() {
    if (this.#dialogData?.formMode === 'create' && !this.#dialogData.delegateSave) {
      const cls = this.#entityClsFromDialog();
      if (cls) {
        const fixed = this.#dialogData.fixedFormData;
        const merged = { ...(this.#dialogData.formData || {}), ...fixed };
        this.#draftEntity = new (cls as new (...args: unknown[]) => unknown)(merged) as EntityInstance;
        this.draftEntitySignal.set(this.#draftEntity);
        this.draftFormData.set(
          entityToFormData(this.#draftEntity as Record<string, unknown>, this.#dialogData.formFields)
        );
      }
    }
  }

  selectTab(key: string): void {
    const targetTab = this.tabs().find(t => t.key === key);
    if (this.isCreateMode() && targetTab?.type === 'table') {
      const fields = this.formFieldsValue;
      const data = this.draftFormData();
      const fixed = this.#dialogData?.fixedFormData;
      const merged = fixed ? { ...data, ...fixed } : data;
      const result = validateForm(fields, merged);
      if (!result.valid) {
        this.validationErrors.emit(result);
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
    this.formSubmitted.emit(data);
  }

  onFormCancelled(): void {
    this.#cleanupDraftEntity();
    this.formCancelled.emit();
    this.#dialogRef?.close();
  }

  onFieldChanged(event: FormFieldChangeEvent): void {
    if (this.isCreateMode()) {
      this.draftFormData.update(d => ({ ...d, [event.field]: event.value }));
    }
    this.fieldChanged.emit(event);
  }

  onValidationErrors(result: FormValidationResult): void {
    this.validationErrors.emit(result);
  }

  /** 外部保存按钮（create 模式） */
  onSave(): void {
    const fields = this.formFieldsValue;
    const data = this.draftFormData();
    const fixed = this.#dialogData?.fixedFormData;
    const merged = fixed ? { ...data, ...fixed } : data;
    const result = validateForm(fields, merged);
    if (!result.valid) {
      this.validationErrors.emit(result);
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
        .catch(e => this.#errorHandler.handleError(e));
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

  /** 将表单数据同步到草稿实体 */
  #syncDraftEntity(): void {
    if (!this.#draftEntity) return;
    const data = this.draftFormData();
    const fixed = this.#dialogData?.fixedFormData;
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
}
