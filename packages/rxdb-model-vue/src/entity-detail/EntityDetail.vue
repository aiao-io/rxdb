<script lang="ts" setup>
/**
 * Tab 式实体详情组件（对齐 Angular 侧 `EntityDetailComponent`）。
 *
 * 基础表单 Tab + 每个一对多/多对多关系一个表格 Tab；
 * create 模式先生成内存草稿实体，校验通过并保存时才落库；
 * edit 模式按 `entityId`（props 或对话框数据）从 Repository 加载实例，保存时内部落库。
 * 关系 Tab 内嵌的实体列表可继续打开子实体详情对话框（套娃），由 `editChain` 阻断环。
 *
 * 对话框关闭经注入的 {@link ENTITY_DIALOG_CONTEXT}（CDK `DialogRef` 的包内替代）：
 * 无对话框语境时组件以独立表单形态运行，不主动关闭任何宿主。
 */
import { getEntityMetadata, RelationKind, type EntityMetadata, type EntityType } from '@aiao/rxdb';
import type {
  DetailTableTab,
  EntityFormData,
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
import { useRxDBOptional } from '@aiao/rxdb-vue';
import type { Subscription } from 'rxjs';
import { computed, inject, ref, shallowRef, watch } from 'vue';
import { ENTITY_DIALOG_CONTEXT } from '../entity-dialog/dialog-context';
import EntityDialog from '../entity-dialog/EntityDialog.vue';
import EntityForm from '../entity-form/EntityForm.vue';
import EntityList from '../entity-list/EntityList.vue';

type EntityInstance = { [key: string]: unknown; readonly id: string; save(): Promise<void>; remove(): Promise<void> };

let nextDetailId = 0;

const props = withDefaults(
  defineProps<{
    /** 实体命名空间（路由输入；缺省时由 metadata / 对话框数据定位实体） */
    namespace?: string;
    /** 实体名（路由输入） */
    name?: string;
    /** 实体 id（路由输入） */
    entityId?: string;
    /** 直接绑定的实体元数据 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    metadata?: EntityMetadata;
    /** 直接绑定的表单字段 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    formFields?: FormFieldConfig[];
    /** 直接绑定的表单数据 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    formData?: EntityFormData;
    /** 直接绑定的表单模式 */
    formMode?: FormMode;
    /** 关系实体候选提供者 */
    relatedEntityProvider?: RelatedEntityProvider;
    /** 已打开详情对话框的记录 id 栈（含当前记录），关系 tab 列表据此阻断无限套娃 */
    editChain?: string[];
    /** 预填充的外键数据（不可编辑），用于级联新增场景 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    fixedFormData?: EntityFormData;
    /** 委托保存：不创建草稿实体，仅 emit formSubmitted 让调用方处理 */
    delegateSave?: boolean;
    /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
    creationChain?: string[];
  }>(),
  {
    namespace: undefined,
    name: undefined,
    entityId: undefined,
    formMode: undefined,
    relatedEntityProvider: undefined,
    editChain: () => [],
    delegateSave: false,
    creationChain: () => []
  }
);

const emit = defineEmits<{
  /** 表单提交（create / 无实例透传路径） */
  formSubmitted: [data: EntityFormData];
  /** 表单取消 */
  formCancelled: [];
  /** 字段变更 */
  fieldChanged: [event: FormFieldChangeEvent];
  /** 校验错误 */
  validationErrors: [result: FormValidationResult];
}>();

const dialogContext = inject(ENTITY_DIALOG_CONTEXT, undefined);

const rxdb = useRxDBOptional();

/** 统一错误处理（Angular ErrorHandler 的最小等价） */
const handleError = (error: unknown): void => {
  console.error('[EntityDetail]', error);
};

/** create 模式下的草稿实体实例（立即创建，不保存） */
const draftEntity = shallowRef<EntityInstance | null>(null);

// 根据 namespace + name 查找对应实体类
const entityCls = computed<EntityType | null>(() => {
  if (!rxdb) return null;
  const ns = props.namespace;
  const nm = props.name;
  if (!ns || !nm) return null;
  return (
    rxdb.config.entities.find(cls => {
      const meta = getEntityMetadata(cls);
      return meta.namespace === ns && meta.name === nm;
    }) ?? null
  );
});

/** 对话框传入的实体类（根据 metadata prop 查找） */
const entityClsFromDialog = computed<EntityType | null>(() => {
  const meta = props.metadata;
  if (!rxdb || !meta) return null;
  return (
    rxdb.config.entities.find(cls => {
      const m = getEntityMetadata(cls);
      return m.namespace === meta.namespace && m.name === meta.name;
    }) ?? null
  );
});

const metadataFromRouteInputs = computed<EntityMetadata | null>(() => {
  const cls = entityCls.value;
  return cls ? getEntityMetadata(cls) : null;
});

const formFieldsFromRouteInputs = computed<FormFieldConfig[] | null>(() => {
  const meta = metadataFromRouteInputs.value;
  if (!meta) return null;
  return buildFormFields(meta, formModeValue.value);
});

/** 编辑模式按 id 加载实体实例（等价 Angular 的 toSignal(switchMap(get(id)))） */
const entityInstance = shallowRef<EntityInstance | null>(null);
watch(
  () => [entityCls.value ?? entityClsFromDialog.value, props.entityId] as const,
  ([cls, id], _old, onCleanup) => {
    let cancelled = false;
    let subscription: Subscription | undefined;
    onCleanup(() => {
      cancelled = true;
      subscription?.unsubscribe();
    });
    if (!cls || !id || !rxdb) {
      entityInstance.value = null;
      return;
    }
    subscription = rxdb.entityManager
      .getRepository(cls)
      .get(id)
      .subscribe({
        next: inst => {
          if (!cancelled) entityInstance.value = inst as EntityInstance;
        },
        error: error => {
          if (!cancelled) handleError(error);
        }
      });
  },
  { immediate: true }
);

/** 唯一的 radio group name，避免多个 EntityDetail 实例之间的 radio 冲突 */
const tabGroupName = `detail-tabs-${nextDetailId++}`;

const formModeValue = computed<FormMode>(() => props.formMode ?? 'edit');

/** 是否使用外部保存模式（create 模式下，保存/取消按钮在 tabs 下面，而非 form 内） */
const isCreateMode = computed(() => formModeValue.value === 'create');

/** 当前表单编辑数据（create 模式下跟踪用户输入） */
const draftFormData = ref<EntityFormData>({});

/** 父实体（草稿或已保存实例），用于关系 tab 的 entity-list */
const parentEntityForRelation = computed<EntityInstance | null>(
  () => draftEntity.value ?? (entityInstance.value as EntityInstance | null) ?? null
);

/** 弹框标题 */
const dialogTitle = computed(() => {
  const meta = metadataValue.value;
  const mode = formModeValue.value;
  const name = meta?.displayName ?? meta?.name ?? '';
  return mode === 'create' ? `新建${name}` : name;
});

/** 创建链路：当前实体 + 祖先链路，传递给子 entity-list 以阻断循环创建 */
const creationChain = computed<string[]>(() => {
  const parentChain = props.creationChain;
  if (!isCreateMode.value) return parentChain;
  const meta = metadataValue.value;
  if (!meta) return parentChain;
  const key = `${meta.namespace}:${meta.name}`;
  return parentChain.includes(key) ? parentChain : [...parentChain, key];
});

/** 已打开详情对话框的记录 id 栈（props 透传，含当前记录） */
const editChain = computed<string[]>(() => props.editChain);

/** 当前活动关系 tab 的 relationName（用于子实体注册关系） */
const activeRelationName = computed<string | undefined>(() => {
  const tab = activeTab.value;
  return tab?.type === 'table' ? (tab as DetailTableTab).relationName : undefined;
});

const formFieldsValue = computed<FormFieldConfig[]>(() => {
  const fields = props.formFields ?? formFieldsFromRouteInputs.value ?? [];
  const fixed = props.fixedFormData;
  if (!fixed) return fields;
  return fields.map(f => (f.field in fixed ? { ...f, readonly: true } : f));
});

const formDataValue = computed<EntityFormData>(() => {
  if (isCreateMode.value) {
    const draft = draftFormData.value;
    const fixed = props.fixedFormData;
    return fixed ? { ...draft, ...fixed } : draft;
  }
  const inst = entityInstance.value;
  if (inst) return entityToFormData(inst as Record<string, unknown>, formFieldsValue.value);
  const base = props.formData ?? {};
  const fixed = props.fixedFormData;
  return fixed ? { ...base, ...fixed } : base;
});
const relatedEntityProviderValue = computed<RelatedEntityProvider | undefined>(() => props.relatedEntityProvider);

// 公开访问器 - 优先级：直接 props > 路由推导
const metadataValue = computed<EntityMetadata | undefined>(
  () => props.metadata ?? metadataFromRouteInputs.value ?? undefined
);

const tabs = computed(() => {
  const meta = metadataValue.value;
  if (!meta) return [];
  const chain = creationChain.value;
  return buildDetailTabs(meta).filter(tab => {
    if (tab.type !== 'table') return true;
    const t = tab as DetailTableTab;
    const key = `${t.relatedNamespace}:${t.relatedEntityName}`;
    return !chain.includes(key);
  });
});

const activeTabKey = ref<string>('basic');
watch(
  tabs,
  nextTabs => {
    activeTabKey.value = nextTabs[0]?.key ?? 'basic';
  },
  { immediate: true }
);

const activeTab = computed(() => tabs.value.find(t => t.key === activeTabKey.value));

// ── create 模式草稿实体生命周期（等价 Angular 构造器） ────────────────

watch(
  () => [props.metadata, formModeValue.value, props.delegateSave, entityClsFromDialog.value, rxdb] as const,
  ([meta, mode, delegateSave, cls]) => {
    if (draftEntity.value) return;
    if (mode !== 'create') return;
    if (delegateSave) return;
    if (!meta || !cls || !rxdb) return;
    const merged = { ...(props.formData || {}), ...props.fixedFormData };
    const inst = new (cls as new (...args: unknown[]) => unknown)(merged) as EntityInstance;
    draftEntity.value = inst;
    draftFormData.value = entityToFormData(inst as Record<string, unknown>, props.formFields ?? []);
  },
  { immediate: true }
);

/** 切换 tab：create 模式下切到表格 tab 前校验草稿 */
const selectTab = (key: string): void => {
  const targetTab = tabs.value.find(t => t.key === key);
  if (isCreateMode.value && targetTab?.type === 'table') {
    const fields = formFieldsValue.value;
    const data = draftFormData.value;
    const fixed = props.fixedFormData;
    const merged = fixed ? { ...data, ...fixed } : data;
    const result = validateForm(fields, merged);
    if (!result.valid) {
      emit('validationErrors', result);
      return;
    }
    syncDraftEntity();
  }
  activeTabKey.value = key;
};

const onFormDataChanged = (data: EntityFormData): void => {
  draftFormData.value = data;
};

const onFormSubmitted = (data: EntityFormData): void => {
  // create 模式与无实例（纯表单数据透传）保持 delegate 语义：只 emit 由宿主处理
  if (isCreateMode.value) {
    emit('formSubmitted', data);
    return;
  }
  const inst = entityInstance.value;
  if (!inst) {
    emit('formSubmitted', data);
    return;
  }
  // edit 模式内部保存：变更应用到已加载实例并落库，成功后关闭对话框并通知宿主
  const changes = formDataToEntityChanges(inst as Record<string, unknown>, data, formFieldsValue.value);
  Object.assign(inst as Record<string, unknown>, changes);
  inst
    .save()
    .then(() => {
      dialogContext?.close('saved');
      emit('formSubmitted', data);
    })
    .catch(handleError);
};

const onFormCancelled = (): void => {
  cleanupDraftEntity();
  emit('formCancelled');
  dialogContext?.close();
};

const onFieldChanged = (event: FormFieldChangeEvent): void => {
  if (isCreateMode.value) {
    draftFormData.value = { ...draftFormData.value, [event.field]: event.value };
  }
  emit('fieldChanged', event);
};

const onValidationErrors = (result: FormValidationResult): void => {
  emit('validationErrors', result);
};

/** 外部保存按钮（create 模式） */
const onSave = (): void => {
  const fields = formFieldsValue.value;
  const data = draftFormData.value;
  const fixed = props.fixedFormData;
  const merged = fixed ? { ...data, ...fixed } : data;
  const result = validateForm(fields, merged);
  if (!result.valid) {
    emit('validationErrors', result);
    return;
  }
  if (draftEntity.value) {
    syncDraftEntity();
    draftEntity.value
      .save()
      .then(() => {
        draftEntity.value = null;
        dialogContext?.close('saved');
      })
      .catch(handleError);
  } else {
    emit('formSubmitted', merged);
    dialogContext?.close();
  }
};

const onCancel = (): void => {
  onFormCancelled();
};

const buildFixedQuery = (tab: DetailTableTab): { combinator: 'and'; rules: unknown[] } | undefined => {
  const entityId = draftEntity.value?.id ?? (formDataValue.value as Record<string, unknown>)['id'];
  if (!entityId) return undefined;

  if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
    return { combinator: 'and', rules: [{ field: tab.foreignKeyField, operator: '=', value: entityId }] };
  }

  if (tab.relationKind === RelationKind.MANY_TO_MANY && tab.mappedProperty) {
    return { combinator: 'and', rules: [{ field: `${tab.mappedProperty}.id`, operator: '=', value: entityId }] };
  }

  return undefined;
};

const buildFixedFormData = (tab: DetailTableTab): EntityFormData | undefined => {
  const entityId = draftEntity.value?.id ?? (formDataValue.value as Record<string, unknown>)['id'];
  if (!entityId) return undefined;

  if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
    return { [tab.foreignKeyField]: entityId };
  }

  return undefined;
};

/** 将表单数据同步到草稿实体 */
const syncDraftEntity = (): void => {
  if (!draftEntity.value) return;
  const data = draftFormData.value;
  const fixed = props.fixedFormData;
  const merged = fixed ? { ...data, ...fixed } : data;
  Object.assign(draftEntity.value, merged);
};

/** 清理草稿实体缓存 */
const cleanupDraftEntity = (): void => {
  if (!draftEntity.value || !rxdb) return;
  rxdb.entityManager.removeEntityCache(draftEntity.value);
  draftEntity.value = null;
};

defineExpose({
  dialogTitle,
  isCreateMode,
  draftEntity,
  draftFormData,
  metadataValue,
  formFieldsValue,
  formDataValue,
  formModeValue,
  relatedEntityProviderValue,
  tabs,
  activeTabKey,
  activeTab,
  activeRelationName,
  creationChain,
  editChain,
  parentEntityForRelation,
  tabGroupName,
  selectTab,
  onFormDataChanged,
  onFormSubmitted,
  onFormCancelled,
  onFieldChanged,
  onValidationErrors,
  onSave,
  onCancel,
  buildFixedQuery,
  buildFixedFormData,
  entityInstance
});
</script>

<template>
  <div class="rxdb-entity-detail">
    <EntityDialog
      :title="dialogTitle ?? ''"
      @close-requested="onCancel"
    >
      <!-- Tab Bar -->
      <div
        class="tabs tabs-border min-h-0 flex-1"
        role="tablist"
      >
        <template
          v-for="tab in tabs"
          :key="tab.key"
        >
          <input
            class="tab"
            :aria-label="tab.label"
            :checked="tab.key === activeTabKey"
            :name="tabGroupName"
            @change="selectTab(tab.key)"
            role="tab"
            type="radio"
          />
          <div
            class="tab-content border-base-300 bg-base-100 order-1 flex w-full flex-col"
            :class="tab.type === 'form' ? ['overflow-auto', { 'p-4': true }] : 'overflow-hidden'"
            :hidden="tab.key !== activeTabKey"
          >
            <EntityForm
              v-if="tab.type === 'form'"
              :data="formDataValue"
              :fields="formFieldsValue"
              :mode="formModeValue"
              :related-entity-provider="relatedEntityProviderValue"
              :show-actions="!isCreateMode"
              @field-changed="onFieldChanged"
              @form-cancelled="onFormCancelled"
              @form-submitted="onFormSubmitted"
              @validation-errors="onValidationErrors"
            />
            <EntityList
              v-if="tab.type === 'table'"
              :creation-chain="creationChain"
              :draft-parent-entity="draftEntity"
              :edit-chain="editChain"
              :fixed-form-data="buildFixedFormData(tab as DetailTableTab)"
              :fixed-query="buildFixedQuery(tab as DetailTableTab)"
              :name="(tab as DetailTableTab).relatedEntityName"
              :namespace="(tab as DetailTableTab).relatedNamespace"
              :parent-entity="parentEntityForRelation"
              :parent-relation-name="(tab as DetailTableTab).relationName"
              :relation-kind="(tab as DetailTableTab).relationKind"
            />
          </div>
        </template>
      </div>

      <!-- Save/Cancel buttons for create mode (below tabs) -->
      <div
        class="border-base-300 flex shrink-0 justify-end gap-2 border-t px-4 py-3"
        v-if="isCreateMode"
      >
        <button
          class="btn"
          @click="onCancel"
          type="button"
        >
          取消
        </button>
        <button
          class="btn btn-primary"
          @click="onSave"
          type="button"
        >
          保存
        </button>
      </div>
    </EntityDialog>
  </div>
</template>

<style scoped>
.rxdb-entity-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
