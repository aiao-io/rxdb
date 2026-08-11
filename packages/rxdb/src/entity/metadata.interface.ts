/**
 * @fileoverview 实体元数据接口定义
 * 定义实体元数据的类型和接口，用于描述实体的结构、属性、关系和索引
 */

import { SetRequired } from 'type-fest';
import {
  EntityForeignKeyMetadata,
  EntityIndexMetadataOptions,
  EntityMetadataOptions,
  EntityPropertyMetadata,
  EntityRelationMetadata
} from './metadata-options.interface.js';

export type EntityIndexMetadata = EntityIndexMetadataOptions;

/**
 * 实体元数据类型
 * 包含实体的所有元数据信息，如属性、关系、索引等
 */
export interface EntityMetadataType extends SetRequired<
  EntityMetadataOptions,
  'namespace' | 'displayName' | 'tableName' | 'repository' | 'extends'
> {
  properties: EntityPropertyMetadata[];
  computedProperties: EntityPropertyMetadata[];
  relations: EntityRelationMetadata[];
  indexes: EntityIndexMetadata[];
  foreignKeys: EntityForeignKeyMetadata[];

  /**
   * 实体所有属性的映射
   * 键为属性名，值为属性元数据
   */
  propertyMap: Map<string, EntityPropertyMetadata>;

  /**
   * 实体所有计算属性的映射
   * 键为属性名，值为属性元数据
   */
  computedPropertyMap: Map<string, EntityPropertyMetadata>;

  /**
   * 有默认值的属性列表
   * 包含所有设置了默认值的属性元数据
   */
  defaultValueProperties: EntityPropertyMetadata[];

  /**
   * 实体所有关系的映射
   * 键为关系属性名，值为关系元数据
   */
  relationMap: Map<string, EntityRelationMetadata>;

  /**
   * 实体外键关系的映射
   */
  foreignKeyRelationMap: Map<string, EntityRelationMetadata>;

  /**
   * 实体外键关系列表
   * 包含所有涉及外键的关系元数据
   */
  foreignKeyRelations: EntityRelationMetadata[];

  /**
   * 实体外键名称列表（JS 属性名）
   * 包含所有外键字段的 JS 属性名
   */
  foreignKeyNames: string[];

  /**
   * 实体外键列名列表（数据库列名）
   * 包含所有外键字段的数据库列名
   */
  foreignKeyColumnNames: string[];

  /**
   * 列名到属性名的反向映射
   * 用于将数据库列名映射回 JS 属性名
   */
  columnNameToPropertyName: Map<string, string>;

  /**
   * 实体所有索引的映射
   * 键为索引名，值为索引元数据
   */
  indexMap: Map<string, EntityIndexMetadata>;

  /**
   * 加密属性映射 (新增于 004-local-field-encryption)
   * 仅包含 `encrypted: true` 的 property，键为属性名。
   * 若实体没有加密属性，size 为 0。
   */
  encryptedPropertyMap: Map<string, EntityPropertyMetadata>;

  /**
   * 判断属性名是否是外键
   *
   * @param name - 要检查的属性名
   */
  isForeignKey(name: string): boolean;
}

/**
 * 实体元数据（只读版本）
 * 实体元数据的只读深度副本，防止元数据被修改
 */
export type EntityMetadata = Readonly<EntityMetadataType>;
