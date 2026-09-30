/**
 * Entity Detail 类型定义
 * @module entity-detail/interfaces
 */
import type { RelationKind } from '@aiao/rxdb';

/**
 * 详情页标签类型
 */
export type DetailTabType = 'form' | 'table';

/**
 * 详情页标签基础配置
 */
export interface DetailTabBase {
  /** 标签唯一标识 */
  key: string;
  /** 标签显示名称 */
  label: string;
  /** 标签类型 */
  type: DetailTabType;
}

/**
 * 表单标签配置（展示实体的基本信息表单）
 */
export interface DetailFormTab extends DetailTabBase {
  /** 标签类型：表单 */
  type: 'form';
}

/**
 * 表格标签配置（展示关联实体的关系数据）
 */
export interface DetailTableTab extends DetailTabBase {
  /** 标签类型：表格 */
  type: 'table';
  /** 关系名 */
  relationName: string;
  /** 关联实体名 */
  relatedEntityName: string;
  /** 关联实体命名空间 */
  relatedNamespace: string;
  /** 关系类型 */
  relationKind: RelationKind;
  /** ONE_TO_MANY: 关联实体中指向当前实体的外键字段，如 'ownerId' */
  foreignKeyField?: string;
  /** MANY_TO_MANY: 关联实体中指向当前实体的关系属性名，如 'orderItems' */
  mappedProperty?: string;
}

/**
 * 详情页标签配置
 */
export type DetailTab = DetailFormTab | DetailTableTab;
