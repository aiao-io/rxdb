import type { UUID } from '@aiao/rxdb';
import {
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Signal,
  type TemplateRef
} from '@angular/core';
import type { CascadeAction, PropertyType } from '../constants/options';
import type { RelationKind } from '../constants/relation';

/** 视图模式：画布视图或表格视图 */
export type ViewMode = 'canvas' | 'table';

/** 交互模式：移动模式或选择模式 */
export type InteractionMode = 'move' | 'select';

/** 详情标签页类型 */
export type DetailTab = 'properties' | 'relations' | 'indexes';

/** 模型设计器外部配置 */
export interface ModelDesignerConfig {
  isDarkMode: Signal<boolean>;
  theme: Signal<string>;
}

/** 模型设计器配置注入令牌 */
export const MODEL_DESIGNER_CONFIG = new InjectionToken<ModelDesignerConfig>('MODEL_DESIGNER_CONFIG');

/** 提供模型设计器配置 */
export function provideModelDesignerConfig(config: ModelDesignerConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MODEL_DESIGNER_CONFIG, useValue: config }]);
}

/**
 * 属性变更类型
 * 用于更新属性时的可选字段
 */
export type DesignPropertyChanges = {
  name?: string;
  propertyType?: PropertyType;
  columnName?: string | null;
  displayName?: string | null;
  isUnique?: boolean;
  isNullable?: boolean;
  isRequired?: boolean;
  isReadonly?: boolean;
  isSortable?: boolean;
  defaultValue?: string | null;
  enumValues?: string[] | null;
  parentId?: UUID | null;
  sortOrder?: string;
};

/**
 * 关系变更类型
 * 用于更新关系时的可选字段
 */
export type DesignRelationChanges = {
  name?: string;
  displayName?: string | null;
  relationKind?: RelationKind;
  mappedEntityId?: string | null;
  mappedPropertyId?: string | null;
  mappedNamespace?: string | null;
  columnName?: string | null;
  onDeleteAction?: CascadeAction | null;
  onUpdateAction?: CascadeAction | null;
  sortOrder?: string;
};

/**
 * 索引变更类型
 * 用于更新索引时的可选字段
 */
export type DesignIndexChanges = {
  propertyIds?: string[];
  isUnique?: boolean;
  displayName?: string | null;
  sortOrder?: string;
};

/**
 * 实体变更类型
 * 用于更新实体时的可选字段
 */
export type DesignEntityChanges = {
  name?: string;
  tableName?: string | null;
  displayName?: string | null;
  entityNamespace?: string | null;
  extendsBase?: string;
  repositoryType?: string;
};

/**
 * 实体节点字段接口
 * 表示 ER 图中实体节点的字段信息（属性或关系）
 */
export interface EntityNodeField {
  /** 字段 ID（可选，用于标识） */
  id?: string;
  /** 字段名称 */
  name: string;
  /** 显示名称 */
  displayName?: string | null;
  /** 字段类型（如 string, number, boolean 等） */
  type: string;
  /** 键类型：primary(主键), foreign(外键), unique(唯一键) */
  keyType?: 'primary' | 'foreign' | 'unique';
  /** 引用关系：指向另一个实体的字段 */
  ref?: { entity: string; field: string };
  /** 是否继承自基类 */
  inherited?: boolean;
  /** 字段是否无效（校验失败时标记） */
  invalid?: boolean;
  /** 字段类别：property(属性) 或 relation(关系) */
  category?: 'property' | 'relation';
}

/**
 * 实体节点数据接口
 * 表示画布上实体节点的完整数据
 */
export interface EntityNodeData {
  /** 实体 ID */
  id: string;
  /** 实体名称 */
  name: string;
  /** 显示名称 */
  displayName: string | null;
  /** 继承的基类名称 */
  extendsBase: string;
  /** 字段列表（属性和关系） */
  fields: EntityNodeField[];
  /** 节点是否被选中 */
  selected: boolean;
}

/**
 * 生成文件接口
 * 表示代码生成器生成的单文件结果
 */
export interface GeneratedFile {
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
}

/**
 * 代码生成结果接口
 */
export interface GenerateResult {
  /** 是否生成成功 */
  success: boolean;
  /** 生成的文件列表 */
  files: GeneratedFile[];
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 校验结果接口
 * 用于单个实体或属性的校验
 */
export interface ValidationResult {
  /** 校验是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 模型校验结果接口
 * 包含整个模型的校验结果，按实体和关系分类
 */
export interface ModelValidationResult {
  /** 整体校验是否通过 */
  valid: boolean;
  /** 实体级别错误映射（实体ID -> 错误信息数组） */
  entityErrors: Map<string, string[]>;
  /** 属性级别错误映射（属性ID -> 错误信息数组） */
  propertyErrors: Map<string, string[]>;
  /** 关系级别错误映射（关系ID -> 错误信息数组） */
  relationErrors: Map<string, string[]>;
  /** 全局错误列表（不属于特定实体或关系） */
  globalErrors: string[];
}

/** 关系字段错误类型 */
export type RelationFieldError = 'name' | 'mappedEntityId' | 'mappedPropertyId';

/** 关系字段错误映射（关系ID -> 错误字段数组） */
export type RelationFieldErrors = Map<string, Set<RelationFieldError>>;

/** AI 抽屉适配器接口 */
export interface AiDrawerAdapter {
  toggle(): void;
  open(): void;
  registerContent(templateRef: TemplateRef<unknown>): void;
  clearContent(): void;
}

/** AI 抽屉适配器注入令牌 */
export const AI_DRAWER_ADAPTER = new InjectionToken<AiDrawerAdapter>('AI_DRAWER_ADAPTER');

/** 宿主提供的智能体配置：不可用时设计器禁用 AI 入口。 */
export type AgentConfig = { enabled: true; apiUrl: string; task: string } | { enabled: false };

/**
 * 智能体网关：查询配置、当前用户，为会话签发 Trigger.dev 令牌。
 *
 * 独立部署时由 Worker 的 `/api/agent/*` 与 `/bff/auth/session` 实现；未注入时设计器禁用 AI 入口。
 */
export interface AgentGateway {
  config(): Promise<AgentConfig>;
  /** 当前登录用户的 ID，未登录时为 `null`。 */
  currentUserId(): Promise<string | null>;
  /** 为本人的会话创建或刷新令牌。 */
  session(chatId: string): Promise<{ publicAccessToken: string }>;
}

/** 智能体网关注入令牌 */
export const AGENT_GATEWAY = new InjectionToken<AgentGateway>('AGENT_GATEWAY');
