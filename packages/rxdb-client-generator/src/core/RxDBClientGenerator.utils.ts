/**
 * @fileoverview RxDB Client 生成器工具函数
 * 提供属性类型转换、元数据处理、代码生成辅助函数
 *
 * @module rxdb-client-generator/core/utils
 */

import {
  PropertyType,
  RelationKind,
  type EntityMetadata,
  type EntityPropertyMetadata,
  type KeyValuePropertyMetadata
} from '@aiao/rxdb';
import { isNil, kebabCase, omit } from '@aiao/utils';
import type { OptionalKind, PropertyDeclarationStructure } from './ts-morph-browser.js';

const IDENTIFIER_PATTERN = /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*$/u;
const NAMESPACE_PATTERN = /^[\p{L}\p{N}_$][\p{L}\p{N}_$-]*$/u;
const RESERVED_BINDINGS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

export const isGeneratedIdentifier = (value: string): boolean => IDENTIFIER_PATTERN.test(value);

export const assertGeneratedIdentifier = (value: string, label: string): void => {
  if (!isGeneratedIdentifier(value)) {
    throw new Error(`Invalid ${label} identifier: ${JSON.stringify(value)}`);
  }
};

export const assertGeneratedBindingIdentifier = (value: string, label: string): void => {
  assertGeneratedIdentifier(value, label);
  if (RESERVED_BINDINGS.has(value)) {
    throw new Error(`Invalid ${label} binding: ${JSON.stringify(value)}`);
  }
};

export const assertGeneratedNamespace = (value: string, label = 'namespace'): void => {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
};

type PropertyMetadata = EntityPropertyMetadata | KeyValuePropertyMetadata;

export const getPropertyTypeConfig = (property: EntityPropertyMetadata, metadata: EntityMetadata) => {
  const type = getEntityPropertyTsType(property, metadata);
  const hasQuestionToken = property.nullable ? true : false;

  let hasExclamationToken = true;
  if (!hasQuestionToken && Object.hasOwn(property, 'default')) {
    hasExclamationToken = false;
  }

  const result: Partial<OptionalKind<PropertyDeclarationStructure>> & {
    type: string;
    name: string;
  } = {
    type,
    name: property.name,
    hasQuestionToken,
    hasExclamationToken,
    isReadonly: property.readonly
  };

  if (!isNil(property.default)) {
    result.initializer = getEntityPropertyDefaultValue(property);
  }
  return result;
};

export const getFlatMapInterfaceName = (property: EntityPropertyMetadata, metadata: EntityMetadata) =>
  `${metadata.name}${property.name.charAt(0).toUpperCase() + property.name.slice(1)}KeyValue`;

export const getKeyValuePreciseType = (property: EntityPropertyMetadata, metadata: EntityMetadata): string => {
  if (property.type !== PropertyType.keyValue || property.properties.length === 0) {
    return 'KeyValue';
  }
  return getFlatMapInterfaceName(property, metadata);
};

export const getKeyValueInterfaceProperties = (property: EntityPropertyMetadata, metadata: EntityMetadata) => {
  if (property.type !== PropertyType.keyValue || property.properties.length === 0) {
    return [];
  }

  return property.properties.map(prop => ({
    name: prop.name,
    type: getEntityPropertyTsType(prop, metadata),
    hasQuestionToken: prop.nullable || false,
    docs: prop.displayName ? [prop.displayName] : undefined
  }));
};

export const getEntityPropertyTsType = (property: PropertyMetadata, metadata: EntityMetadata): string => {
  const propertyType = property.type as PropertyType;
  let type: string;

  switch (propertyType) {
    case PropertyType.uuid:
      type = 'UUID';
      break;
    case PropertyType.string:
      type = 'string';
      break;
    case PropertyType.enum:
      // `stringArray` 也可选携带 enum，`in` 判定不再蕴含值存在，必须同时检查值
      if (!('enum' in property) || property.enum === undefined) {
        throw new Error('Enum property is missing enum values');
      }
      type = property.enum.length > 0 ? property.enum.map(value => JSON.stringify(value)).join(' | ') : 'string';
      break;
    case PropertyType.number:
    case PropertyType.integer:
      type = 'number';
      break;
    case PropertyType.bigint:
      type = 'bigint';
      break;
    case PropertyType.binary:
      type = 'Uint8Array';
      break;
    case PropertyType.boolean:
      type = 'boolean';
      break;
    case PropertyType.date:
      type = 'Date';
      break;
    case PropertyType.stringArray:
      type = 'string[]';
      break;
    case PropertyType.numberArray:
      type = 'number[]';
      break;
    case PropertyType.keyValue:
      type = getKeyValuePreciseType(property as EntityPropertyMetadata, metadata);
      break;
    case PropertyType.json:
      type = 'Record<string, unknown>';
      break;
    default:
      throw new Error(`Unsupported property type: ${String(propertyType)}`);
  }

  return property.nullable ? `${type} | null` : type;
};

const escapeSingleQuoted = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0');

const getEntityPropertyDefaultValue = (property: EntityPropertyMetadata) => {
  switch (property.type) {
    case PropertyType.string:
    case PropertyType.enum:
      return `'${escapeSingleQuoted(String(property.default))}'`;
    case PropertyType.date:
      return property.default ? 'new Date()' : '';
    default:
      return '';
  }
};

const assertGeneratorPathMetadata = (metadata: EntityMetadata): void => {
  assertGeneratedBindingIdentifier(metadata.name, 'entity name');
  if (metadata.namespace) assertGeneratedNamespace(metadata.namespace);
};

export const getGeneratorEntityConfig = (metadata: EntityMetadata) => {
  assertGeneratorPathMetadata(metadata);
  let entityPath = 'entities/';
  const fileName = kebabCase(metadata.name) + '.ts';
  if (metadata.namespace) entityPath += metadata.namespace + '/';
  entityPath += fileName;
  return {
    entityPath,
    fileName
  };
};

export const getGeneratorEntityDefinitionConfig = (metadata: EntityMetadata) => {
  assertGeneratorPathMetadata(metadata);
  let entityPath = 'entities/';
  const fileName = kebabCase(metadata.name) + '.d.ts';
  if (metadata.namespace) entityPath += metadata.namespace + '/';
  entityPath += fileName;
  return {
    entityPath,
    fileName
  };
};

const propertyTypeMap = new Map<string, string>();
Object.keys(PropertyType).forEach(key => {
  const value = PropertyType[key as keyof typeof PropertyType];
  if (typeof value === 'string') propertyTypeMap.set(value, key);
});

const relationKindMap = new Map<string, string>();
Object.keys(RelationKind).forEach(key => {
  const value = RelationKind[key as keyof typeof RelationKind];
  if (typeof value === 'string') relationKindMap.set(value, key);
});

type RenderContext = 'metadata' | 'plain' | 'property' | 'relation';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getChildContext = (context: RenderContext, key: string): RenderContext => {
  if (context === 'metadata' && (key === 'properties' || key === 'computedProperties')) return 'property';
  if (context === 'metadata' && key === 'relations') return 'relation';
  if (context === 'property' && key === 'properties') return 'property';
  return 'plain';
};

const renderToken = (context: RenderContext, key: string, value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  if (context === 'property' && key === 'type') {
    const enumKey = propertyTypeMap.get(value);
    if (enumKey) return `PropertyType.${enumKey}`;
  }

  if (context === 'relation' && key === 'kind') {
    const enumKey = relationKindMap.get(value);
    if (enumKey) return `RelationKind.${enumKey}`;
  }

  return undefined;
};

/**
 * 渲染对象字面量的键。
 *
 * @remarks
 * `__proto__` 必须走计算属性：`{ __proto__: v }` 与 `{ "__proto__": v }` 在对象字面量里都是
 * **原型设置语法**，生成出来的代码会改掉对象原型并丢掉这个自有键；只有 `{ ["__proto__"]: v }`
 * 才定义成普通属性。`options` / `keyValueSchema` 的键是业务字符串，元数据里出现它并不违法。
 */
const renderKey = (key: string): string => {
  if (key === '__proto__') return `['${key}']`;
  return isGeneratedIdentifier(key) ? key : JSON.stringify(key);
};

const renderMetadataValue = (value: unknown, indentSize: number, context: RenderContext): string => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const indent = ' '.repeat(indentSize + 2);
    const values = value.map(item => `${indent}${renderMetadataValue(item, indentSize + 2, context)}`);
    return `[\n${values.join(',\n')}\n${' '.repeat(indentSize)}]`;
  }

  if (!isRecord(value)) {
    throw new Error(`Unsupported metadata value: ${String(value)}`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';

  const indent = ' '.repeat(indentSize + 2);
  const renderedEntries = entries.map(([key, childValue]) => {
    const renderedKey = renderKey(key);
    const token = renderToken(context, key, childValue);
    const renderedValue = token ?? renderMetadataValue(childValue, indentSize + 2, getChildContext(context, key));
    return `${indent}${renderedKey}: ${renderedValue}`;
  });
  return `{\n${renderedEntries.join(',\n')}\n${' '.repeat(indentSize)}}`;
};

export function transitionMetadata(metadata: EntityMetadata): string {
  const metadataOptions = omit(metadata, ['propertyMap', 'relationMap', 'indexMap']);
  const serialized = JSON.stringify(metadataOptions);
  if (serialized === undefined) throw new Error('Metadata cannot be serialized');

  const plainMetadata: unknown = JSON.parse(serialized);
  if (!isRecord(plainMetadata)) throw new Error('Metadata must serialize to an object');

  return renderMetadataValue(plainMetadata, 0, 'metadata');
}
