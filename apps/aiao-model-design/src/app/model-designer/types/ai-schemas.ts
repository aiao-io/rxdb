/**
 * AI Schema 类型定义
 *
 * 与 apps/api/src/routes/ai/prompts/schema-definitions.ts 保持同步。
 * 此文件为 rxdb-model-designer 包提供本地类型定义，
 * 避免 ng-packagr 构建时跨 rootDir 引用 apps/api 文件。
 *
 * 所有对象均携带 UUID id，用于跨实体精确引用。
 */

/** AI 实体上下文 */
export interface AiEntityContext {
  id: string;
  name: string;
  displayName?: string;
  entityNamespace?: string | null;
  properties: {
    id: string;
    name: string;
    propertyType: string;
    displayName?: string;
    isRequired: boolean;
    isNullable: boolean;
    isUnique: boolean;
    defaultValue?: string | null;
    enumValues?: string[] | null;
  }[];
  relations: {
    id: string;
    name: string;
    relationKind: string;
    mappedEntityId: string;
    mappedPropertyId?: string;
    onDeleteAction?: string;
  }[];
  indexes: {
    id: string;
    propertyIds: string[];
    isUnique: boolean;
  }[];
}

/** 模型生成输出 */
export interface ModelGenerationOutput {
  thinking: string;
  entities: {
    id: string;
    name: string;
    displayName?: string;
    entityNamespace?: string | null;
    properties: {
      id: string;
      name: string;
      propertyType:
        | 'uuid'
        | 'string'
        | 'number'
        | 'integer'
        | 'boolean'
        | 'date'
        | 'stringArray'
        | 'numberArray'
        | 'keyValue'
        | 'json'
        | 'enum';
      displayName?: string;
      isRequired: boolean;
      isNullable: boolean;
      isUnique: boolean;
      defaultValue?: string | null;
      enumValues?: string[] | null;
    }[];
    relations: {
      id: string;
      name: string;
      relationKind: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
      mappedEntityId: string;
      mappedPropertyId?: string;
      onDeleteAction: 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'RESTRICT';
    }[];
    indexes: {
      id: string;
      propertyIds: string[];
      isUnique: boolean;
    }[];
  }[];
}

/** 验证建议 */
export interface ValidationSuggestion {
  dimension: 'naming' | 'relationship' | 'index' | 'normalization' | 'completeness';
  severity: 'error' | 'warning' | 'info';
  entityName: string;
  propertyName?: string;
  message: string;
  suggestedFix?: SuggestedFix;
}

/** 建议修复方案 */
export interface SuggestedFix {
  type: 'rename' | 'addProperty' | 'removeProperty' | 'addIndex' | 'changeType' | 'addRelation' | 'modifyRelation';
  details: Record<string, unknown>;
}

/** 对话式变更提案 */
export interface ChatChangeProposal {
  description: string;
  changes: ChatChange[];
}

/** 单条变更 */
export interface ChatChange {
  action:
    | 'addEntity'
    | 'modifyEntity'
    | 'removeEntity'
    | 'addProperty'
    | 'modifyProperty'
    | 'removeProperty'
    | 'addRelation'
    | 'modifyRelation'
    | 'removeRelation'
    | 'addIndex'
    | 'removeIndex';
  entityId: string;
  entityName: string;
  details: Record<string, unknown>;
}
