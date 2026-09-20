import type { EntityMetadata } from '@aiao/rxdb';
import type { EntityFormData, FormFieldConfig, FormMode, RelatedEntityProvider } from '@aiao/rxdb-model';

/**
 * 详情对话框传入的数据结构（对齐 Angular 侧 CDK Dialog 的 `EntityDetailDialogData`）。
 *
 * 在 Vue 中，对话框宿主把这些字段展开为 {@link EntityDetail} 的 props 传入。
 */
export interface EntityDetailDialogData {
  /** 实体元数据 */
  metadata: EntityMetadata;
  /** 表单字段配置 */
  formFields: FormFieldConfig[];
  /** 表单数据 */
  formData: EntityFormData;
  /** 表单模式 */
  formMode: FormMode;
  /** 编辑模式：按 id 从 Repository 加载实体实例；缺省时表单数据为纯透传 */
  entityId?: string;
  /** 已打开详情对话框的记录 id 栈（含当前记录），关系 tab 列表据此阻断无限套娃 */
  editChain?: string[];
  /** 关系实体候选提供者 */
  relatedEntityProvider?: RelatedEntityProvider;
  /** 预填充的外键数据（不可编辑），用于级联新增场景 */
  fixedFormData?: EntityFormData;
  /** 委托保存：不创建草稿实体，仅 emit formSubmitted 让调用方处理 */
  delegateSave?: boolean;
  /** 创建链路中的实体类型（namespace:name），用于阻断循环创建 */
  creationChain?: string[];
}
