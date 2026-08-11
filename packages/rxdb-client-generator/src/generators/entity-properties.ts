/**
 * @fileoverview 实体属性生成器
 * 负责生成实体属性的 TypeScript 类型定义和初始化数据结构
 *
 * @module rxdb-client-generator/generators/entity-properties
 */

import { EntityMetadata, EntityPropertyMetadata, PropertyType } from '@aiao/rxdb';
import {
  getFlatMapInterfaceName,
  getKeyValueInterfaceProperties,
  getPropertyTypeConfig
} from '../core/RxDBClientGenerator.utils.js';
import type {
  AddedInterface,
  OptionalKind,
  PropertyDeclarationStructure,
  SourceFile
} from '../core/ts-morph-browser.js';

const getComputedPropertyFeatures = (metadata: EntityMetadata): unknown => {
  if (metadata.repository === 'GraphRepository' || metadata.extends.includes('GraphRepository')) {
    return metadata.features?.graph;
  }
  if (metadata.repository === 'TreeRepository' || metadata.extends.includes('TreeRepository')) {
    return metadata.features?.tree;
  }
  return metadata.features;
};

const isFeatureEnabled = (features: unknown, name: string): boolean => {
  if (typeof features !== 'object' || features === null) return false;
  return Reflect.get(features, name) === true;
};

export const isGeneratedComputedProperty = (metadata: EntityMetadata, property: EntityPropertyMetadata): boolean =>
  isFeatureEnabled(getComputedPropertyFeatures(metadata), property.name);

/**
 * 生成实体的属性
 */
export const generateEntityProperties = ({
  classProperties,
  metadata,
  file,
  rxdbNamedImports
}: {
  metadata: EntityMetadata;
  file: SourceFile;
  classProperties: OptionalKind<PropertyDeclarationStructure>[];
  rxdbNamedImports: Set<string>;
}): AddedInterface => {
  // 构造函数接口
  const initDataInterface = file.addInterface({
    name: `${metadata.name}InitData`,
    isExported: true,
    docs: ['初始化数据']
  });

  // 处理属性
  const property_handler = (property: EntityPropertyMetadata, isComputedProperty = false) => {
    // 如果是 keyValue 类型且有 properties，先生成独立的接口
    if (
      property.type === PropertyType.keyValue &&
      'properties' in property &&
      property.properties &&
      property.properties.length > 0
    ) {
      const interfaceName = getFlatMapInterfaceName(property, metadata);
      const keyValueInterface = file.addInterface({
        name: interfaceName,
        isExported: true,
        docs: [property.displayName || `${property.name} keyValue 类型`]
      });

      const keyValueProps = getKeyValueInterfaceProperties(property, metadata);
      keyValueProps.forEach(prop => keyValueInterface.addProperty(prop));
    }

    const config = getPropertyTypeConfig(property, metadata);
    const { initializer, ...otherConfig } = config;
    const docs: string[] = [];
    docs.push(property.displayName || property.name);
    if (initializer) {
      docs.push(`@default ${initializer}`);
    }

    switch (config.type) {
      case 'UUID':
        rxdbNamedImports.add('UUID');
        break;
    }

    // 计算属性不添加到初始化接口中
    if (!isComputedProperty) {
      initDataInterface.addProperty({
        name: config.name,
        type: config.type,
        hasQuestionToken: true,
        docs
      });
    }

    classProperties.push({
      ...otherConfig,
      hasExclamationToken: false,
      isReadonly: property.readonly || false,
      docs
    });
  };

  // 基本属性
  metadata.properties.forEach(property => property_handler(property));

  // 计算属性
  Array.from(metadata.computedPropertyMap.values()).forEach(property => {
    if (isGeneratedComputedProperty(metadata, property)) {
      property_handler(property, true);
    }
  });

  return initDataInterface;
};
