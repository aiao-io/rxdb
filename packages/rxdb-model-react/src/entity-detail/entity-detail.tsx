/**
 * @fileoverview Tab 式实体详情组件（Angular `EntityDetailComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：基础表单 Tab + 每个一对多/多对多关系一个表格 Tab；
 * create 模式先生成内存草稿实体，校验通过并保存时才落库；edit 模式按 `entityId`
 * 从 Repository 加载实例，保存时内部落库；关系 Tab 内嵌的实体列表可继续打开子实体
 * 详情对话框（套娃），由 `editChain` 阻断环。
 *
 * Angular 侧「路由输入 + DIALOG_DATA」两个通道在 React 合并为同一组 props
 * （对话框数据 = props）；`DialogRef.close(result)` 由 {@link DialogContext} 提供。
 * RxDB 经 `useRxDBOptional` 获取（Angular 侧 `inject(RxDB, {optional: true})` 等价物）。
 *
 * @module entity-detail
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
import { useRxDBOptional } from '@aiao/rxdb-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { DialogContext } from '../dialog/dialog';
import { EntityDialog } from '../entity-dialog/entity-dialog';
import { EntityForm } from '../entity-form/entity-form';
import { EntityList, type EntityInstance } from '../entity-list/entity-list';
import './entity-detail.css';

let nextDetailId = 0;

/** CDK Dialog 传入的数据结构（React 侧 = EntityDetail 的 props）。 */
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

/** {@link EntityDetail} 的 props（对话框数据 + 路由输入 + 事件回调）。 */
export interface EntityDetailProps extends Partial<EntityDetailDialogData> {
  /** 实体命名空间（路由输入通道；与 metadata 二选一）。 */
  namespace?: string;
  /** 实体名（路由输入通道）。 */
  name?: string;
  /** 表单提交。 */
  onFormSubmitted?: (data: EntityFormData) => void;
  /** 表单取消。 */
  onFormCancelled?: () => void;
  /** 字段变更。 */
  onFieldChanged?: (event: FormFieldChangeEvent) => void;
  /** 校验失败。 */
  onValidationErrors?: (result: FormValidationResult) => void;
}

/**
 * Tab 式实体详情组件：基础表单 Tab + 关系表格 Tab。
 */
export function EntityDetail({
  namespace,
  name,
  entityId,
  metadata,
  formFields,
  formData,
  formMode,
  relatedEntityProvider,
  fixedFormData,
  delegateSave,
  creationChain,
  editChain,
  onFormSubmitted,
  onFormCancelled,
  onFieldChanged,
  onValidationErrors
}: EntityDetailProps): JSX.Element {
  const rxdb = useRxDBOptional();
  const dialog = useContext(DialogContext);

  /** 唯一的 radio group name，避免多个 EntityDetail 实例之间的 radio 冲突。 */
  const [tabGroupName] = useState(() => `detail-tabs-${nextDetailId++}`);

  // 根据 namespace + name 查找对应实体类
  const entityCls = useMemo<EntityType | null>(() => {
    if (!rxdb) return null;
    if (!namespace || !name) return null;
    return (
      rxdb.config.entities.find(cls => {
        const meta = getEntityMetadata(cls);
        return meta.namespace === namespace && meta.name === name;
      }) ?? null
    );
  }, [rxdb, namespace, name]);

  // 对话框数据通道的实体类（根据 metadata 查找）
  const entityClsFromDialog = useMemo<EntityType | null>(() => {
    if (!rxdb || !metadata) return null;
    return (
      rxdb.config.entities.find(cls => {
        const m = getEntityMetadata(cls);
        return m.namespace === metadata.namespace && m.name === metadata.name;
      }) ?? null
    );
  }, [rxdb, metadata]);

  // 编辑模式：按 id 从 Repository 加载实体实例（Angular 侧 switchMap + toSignal 同语义）
  const [entityInstance, setEntityInstance] = useState<EntityInstance | null>(null);
  const loadCls = entityCls ?? entityClsFromDialog;

  // 无查询目标（缺实体类 / id）时渲染期立即清空实例（Angular 侧订阅链切到 null 同语义）
  const [prevLoad, setPrevLoad] = useState<{ cls: EntityType | null; id: string | undefined }>({
    cls: loadCls,
    id: entityId
  });
  if (prevLoad.cls !== loadCls || prevLoad.id !== entityId) {
    setPrevLoad({ cls: loadCls, id: entityId });
    if (!loadCls || !entityId) setEntityInstance(null);
  }

  useEffect(() => {
    if (!loadCls || !entityId || !rxdb) {
      return;
    }
    let active = true;
    const subscription = rxdb.entityManager
      .getRepository(loadCls)
      .get(entityId)
      .subscribe({
        next: inst => {
          if (active) setEntityInstance(inst as EntityInstance);
        },
        error: error => {
          console.error(error);
          if (active) setEntityInstance(null);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [rxdb, loadCls, entityId]);

  // create 模式（对话框数据通道）立即建内存草稿，不保存
  const [draftEntity, setDraftEntity] = useState<EntityInstance | null>(() => {
    if (formMode !== 'create' || delegateSave) return null;
    if (!metadata) return null;
    if (!rxdb) return null;
    const cls = entityClsFromDialog;
    if (!cls) return null;
    const fixed = fixedFormData;
    const merged = { ...(formData || {}), ...fixed };
    return new (cls as new (...args: unknown[]) => unknown)(merged) as EntityInstance;
  });

  /** 当前表单编辑数据（create 模式下跟踪用户输入）。 */
  const [draftFormData, setDraftFormData] = useState<EntityFormData>(() => {
    if (!draftEntity) return {};
    return entityToFormData(draftEntity as Record<string, unknown>, formFields ?? []);
  });

  const [activeTabKey, setActiveTabKey] = useState('basic');

  const formModeValue: FormMode = formMode ?? 'edit';
  const isCreateMode = formModeValue === 'create';

  const metadataValue: EntityMetadata | undefined = metadata ?? (entityCls ? getEntityMetadata(entityCls) : undefined);

  const formFieldsValue: FormFieldConfig[] = useMemo(() => {
    const fields =
      formFields ?? (entityCls && metadataValue ? buildFormFields(metadataValue, formModeValue) : undefined) ?? [];
    const fixed = fixedFormData;
    if (!fixed) return fields;
    return fields.map(f => (f.field in fixed ? { ...f, readonly: true } : f));
  }, [formFields, entityCls, metadataValue, formModeValue, fixedFormData]);

  const formDataValue: EntityFormData = useMemo(() => {
    if (isCreateMode) {
      const draft = draftFormData;
      const fixed = fixedFormData;
      return fixed ? { ...draft, ...fixed } : draft;
    }
    const inst = entityInstance;
    if (inst) return entityToFormData(inst as Record<string, unknown>, formFieldsValue ?? []);
    const base = formData ?? {};
    const fixed = fixedFormData;
    return fixed ? { ...base, ...fixed } : base;
  }, [isCreateMode, draftFormData, fixedFormData, entityInstance, formFieldsValue, formData]);

  /** 弹框标题。 */
  const dialogTitle = (() => {
    const meta = metadataValue;
    const mode = formModeValue;
    const title = meta?.displayName ?? meta?.name ?? '';
    return mode === 'create' ? `新建${title}` : title;
  })();

  /** 创建链路：当前实体 + 祖先链路，传递给子 entity-list 以阻断循环创建。 */
  const creationChainValue = useMemo<string[]>(() => {
    const parentChain = creationChain ?? [];
    if (!isCreateMode) return parentChain;
    if (!metadataValue) return parentChain;
    const key = `${metadataValue.namespace}:${metadataValue.name}`;
    return parentChain.includes(key) ? parentChain : [...parentChain, key];
  }, [creationChain, isCreateMode, metadataValue]);

  const editChainValue = editChain ?? [];

  /** 当前活动关系 tab 的 relationName（用于子实体注册关系）。 */
  const tabs = useMemo(() => {
    if (!metadataValue) return [];
    const chain = creationChainValue;
    return buildDetailTabs(metadataValue).filter(tab => {
      if (tab.type !== 'table') return true;
      const t = tab as DetailTableTab;
      const key = `${t.relatedNamespace}:${t.relatedEntityName}`;
      return !chain.includes(key);
    });
  }, [metadataValue, creationChainValue]);

  // tabs 变化时活动 tab 重置为首个（Angular 侧 linkedSignal 同语义；渲染期调整状态）
  const [prevTabs, setPrevTabs] = useState(tabs);
  if (prevTabs !== tabs) {
    setPrevTabs(tabs);
    setActiveTabKey(tabs[0]?.key ?? 'basic');
  }

  /** 父实体（草稿或已保存实例），用于关系 tab 的 entity-list。 */
  const parentEntityForRelation = draftEntity ?? entityInstance ?? null;

  /** 将表单数据同步到草稿实体。 */
  const syncDraftEntity = useCallback((): void => {
    if (!draftEntity) return;
    const data = draftFormData;
    const fixed = fixedFormData;
    const merged = fixed ? { ...data, ...fixed } : data;
    Object.assign(draftEntity, merged);
  }, [draftEntity, draftFormData, fixedFormData]);

  const syncDraftEntityRef = useRef(syncDraftEntity);
  useEffect(() => {
    syncDraftEntityRef.current = syncDraftEntity;
  }, [syncDraftEntity]);

  /** 切 tab：create 模式切到关系 tab 前先校验草稿并同步（Angular 侧同语义）。 */
  const selectTab = useCallback(
    (key: string): void => {
      const targetTab = tabs.find(t => t.key === key);
      if (isCreateMode && targetTab?.type === 'table') {
        const fields = formFieldsValue;
        const data = draftFormData;
        const fixed = fixedFormData;
        const merged = fixed ? { ...data, ...fixed } : data;
        const result = validateForm(fields, merged);
        if (!result.valid) {
          onValidationErrors?.(result);
          return;
        }
        syncDraftEntityRef.current();
      }
      setActiveTabKey(key);
    },
    [tabs, isCreateMode, formFieldsValue, draftFormData, fixedFormData, onValidationErrors]
  );

  /** 清理草稿实体缓存（Angular 侧 #cleanupDraftEntity 同语义：无 rxdb 时保留草稿）。 */
  const cleanupDraftEntity = useCallback((): void => {
    if (!draftEntity || !rxdb) return;
    rxdb.entityManager.removeEntityCache(draftEntity as never);
    setDraftEntity(null);
  }, [draftEntity, rxdb]);

  /** 表单提交：create 模式 delegate 语义只 emit；edit 模式内部保存并关闭（'saved'）。 */
  const handleFormSubmitted = useCallback(
    (data: EntityFormData): void => {
      if (isCreateMode) {
        onFormSubmitted?.(data);
        return;
      }
      const inst = entityInstance;
      if (!inst) {
        onFormSubmitted?.(data);
        return;
      }
      const changes = formDataToEntityChanges(inst as Record<string, unknown>, data, formFieldsValue);
      Object.assign(inst as Record<string, unknown>, changes);
      inst
        .save()
        .then(() => {
          dialog?.close('saved');
          onFormSubmitted?.(data);
        })
        .catch(error => console.error(error));
    },
    [isCreateMode, entityInstance, formFieldsValue, dialog, onFormSubmitted]
  );

  /** 表单取消：清理草稿缓存并 emit formCancelled。 */
  const handleFormCancelled = useCallback((): void => {
    cleanupDraftEntity();
    onFormCancelled?.();
    dialog?.close();
  }, [cleanupDraftEntity, onFormCancelled, dialog]);

  const handleFieldChanged = useCallback(
    (event: FormFieldChangeEvent): void => {
      if (isCreateMode) {
        setDraftFormData(d => ({ ...d, [event.field]: event.value }));
      }
      onFieldChanged?.(event);
    },
    [isCreateMode, onFieldChanged]
  );

  /** 外部保存按钮（create 模式）：校验 → 草稿落库（或 delegate emit）→ 关闭。 */
  const handleSave = useCallback((): void => {
    const fields = formFieldsValue;
    const data = draftFormData;
    const fixed = fixedFormData;
    const merged = fixed ? { ...data, ...fixed } : data;
    const result = validateForm(fields, merged);
    if (!result.valid) {
      onValidationErrors?.(result);
      return;
    }
    if (draftEntity) {
      syncDraftEntityRef.current();
      draftEntity
        .save()
        .then(() => {
          setDraftEntity(null);
          dialog?.close('saved');
        })
        .catch(error => console.error(error));
    } else {
      onFormSubmitted?.(merged);
      dialog?.close();
    }
  }, [formFieldsValue, draftFormData, fixedFormData, draftEntity, dialog, onFormSubmitted, onValidationErrors]);

  /** 取消按钮（create 模式页脚）。 */
  const handleCancel = useCallback((): void => {
    handleFormCancelled();
  }, [handleFormCancelled]);

  /** 关系 tab 的固定查询（O2M 外键 / M2M 映射属性）。 */
  const buildFixedQuery = useCallback(
    (tab: DetailTableTab): { combinator: 'and'; rules: unknown[] } | undefined => {
      const entityId = draftEntity?.id ?? (formDataValue as Record<string, unknown>)['id'];
      if (!entityId) return undefined;

      if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
        return { combinator: 'and', rules: [{ field: tab.foreignKeyField, operator: '=', value: entityId }] };
      }

      if (tab.relationKind === RelationKind.MANY_TO_MANY && tab.mappedProperty) {
        return { combinator: 'and', rules: [{ field: `${tab.mappedProperty}.id`, operator: '=', value: entityId }] };
      }

      return undefined;
    },
    [draftEntity, formDataValue]
  );

  /** 关系 tab 的固定表单数据（O2M 外键预填）。 */
  const buildFixedFormData = useCallback(
    (tab: DetailTableTab): EntityFormData | undefined => {
      const entityId = draftEntity?.id ?? (formDataValue as Record<string, unknown>)['id'];
      if (!entityId) return undefined;

      if (tab.relationKind === RelationKind.ONE_TO_MANY && tab.foreignKeyField) {
        return { [tab.foreignKeyField]: entityId };
      }

      return undefined;
    },
    [draftEntity, formDataValue]
  );

  return (
    <div className='rxdb-entity-detail'>
      <EntityDialog title={dialogTitle} onCloseRequested={handleCancel}>
        {/* Tab Bar */}
        <div className='tabs tabs-border min-h-0 flex-1' role='tablist'>
          {tabs.map(tab => (
            <div className='contents' key={tab.key}>
              <input
                className='tab'
                aria-label={tab.label}
                checked={tab.key === activeTabKey}
                name={tabGroupName}
                role='tab'
                type='radio'
                onChange={() => selectTab(tab.key)}
              />
              <div
                className={`tab-content border-base-300 bg-base-100 order-1 flex w-full flex-col${
                  tab.type === 'form' ? 'overflow-auto p-4' : 'overflow-hidden'
                }`}
                hidden={tab.key !== activeTabKey}
              >
                {tab.type === 'form' ?
                  <EntityForm
                    data={formDataValue}
                    fields={formFieldsValue}
                    mode={formModeValue}
                    relatedEntityProvider={relatedEntityProvider}
                    showActions={!isCreateMode}
                    onFieldChanged={handleFieldChanged}
                    onFormCancelled={handleFormCancelled}
                    onFormSubmitted={handleFormSubmitted}
                    onValidationErrors={onValidationErrors}
                  />
                : <EntityList
                    creationChain={creationChainValue}
                    draftParentEntity={draftEntity}
                    editChain={editChainValue}
                    fixedFormData={buildFixedFormData(tab)}
                    fixedQuery={buildFixedQuery(tab)}
                    name={tab.relatedEntityName}
                    namespace={tab.relatedNamespace}
                    parentEntity={parentEntityForRelation}
                    parentRelationName={tab.relationName}
                    relationKind={tab.relationKind}
                  />
                }
              </div>
            </div>
          ))}
        </div>

        {/* Save/Cancel buttons for create mode (below tabs) */}
        {isCreateMode && (
          <div className='border-base-300 flex shrink-0 justify-end gap-2 border-t px-4 py-3'>
            <button className='btn' data-detail-cancel='true' onClick={handleCancel} type='button'>
              取消
            </button>
            <button className='btn btn-primary' data-detail-save='true' onClick={handleSave} type='button'>
              保存
            </button>
          </div>
        )}
      </EntityDialog>
    </div>
  );
}
