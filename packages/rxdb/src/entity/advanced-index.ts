import { RxDBError } from '../RxDBError.js';
import { storageConstraintName } from './constraint-name.js';
import { compileGeneratedColumn } from './generated-column.js';
import type { EntityIndexMetadata, EntityMetadata } from './metadata.interface.js';
import { PropertyType } from './property-types.interface.js';
import { compileStorageExpression, type CompiledStorageExpression, type StorageDialect } from './storage-expression.js';

/** 声明式索引方法；SQLite 只支持 B-tree。 */
export type StorageIndexMethod = 'btree' | 'gin' | 'gist';

/** 高级索引的物理定义，与普通索引使用不同的托管命名范围。 */
export interface CompiledAdvancedIndex {
  name: string;
  columns: readonly string[];
  expression?: string;
  method: StorageIndexMethod;
  unique: boolean;
  operatorClass?: 'jsonb_ops';
  requiredExtensions: readonly string[];
  definition: string;
}

/** 判断索引是否使用表达式、显式方法或只读生成列。 */
export const isAdvancedIndex = (metadata: EntityMetadata, index: EntityIndexMetadata): boolean => {
  if (index.expression !== undefined || index.method !== undefined || index.dialects !== undefined) return true;
  if (!(metadata.generatedColumnMap instanceof Map))
    throw new RxDBError('高级索引元数据尚未规范化：缺少 generatedColumnMap');
  const properties = index.properties === undefined ? [index.name] : index.properties;
  return Array.isArray(properties) && properties.some(property => metadata.generatedColumnMap.has(property));
};

/** 读取需要生成列、表达式或索引方法支持的声明，不接管旧普通/条件唯一索引。 */
export const advancedIndexesOf = (metadata: EntityMetadata): readonly EntityIndexMetadata[] => {
  return [...metadata.indexMap.values()].filter(index => isAdvancedIndex(metadata, index));
};

const scalarPropertyTypes = new Set<PropertyType | `${PropertyType}`>([
  PropertyType.uuid,
  PropertyType.string,
  PropertyType.enum,
  PropertyType.number,
  PropertyType.integer,
  PropertyType.bigint,
  PropertyType.boolean,
  PropertyType.date
]);

const dialectsOf = (index: EntityIndexMetadata, dialect: StorageDialect): readonly StorageDialect[] | undefined => {
  if (dialect !== 'sqlite' && dialect !== 'postgres') throw new RxDBError(`不支持的存储方言：${String(dialect)}`);
  const dialects = index.dialects;
  if (dialects === undefined) return undefined;
  if (
    !Array.isArray(dialects) ||
    dialects.length === 0 ||
    dialects.some(value => value !== 'sqlite' && value !== 'postgres')
  ) {
    throw new RxDBError(`索引 ${index.name} 的 dialects 必须是非空的 sqlite/postgres 范围`);
  }
  if (new Set(dialects).size !== dialects.length) throw new RxDBError(`索引 ${index.name} 的 dialects 不能重复`);
  return [...dialects].sort();
};

const methodOf = (index: EntityIndexMetadata): StorageIndexMethod => {
  const method = index.method === undefined ? 'btree' : index.method;
  if (method !== 'btree' && method !== 'gin' && method !== 'gist') {
    throw new RxDBError(`索引 ${index.name} 不支持方法 ${String(method)}`);
  }
  if ((index.normalized !== undefined && index.normalized !== false) || index.where !== undefined) {
    throw new RxDBError(`高级索引 ${index.name} 不接受 normalized 或 where，原有索引继续使用既有路径`);
  }
  if (index.unique !== undefined && typeof index.unique !== 'boolean') {
    throw new RxDBError(`索引 ${index.name} 的 unique 必须是布尔值`);
  }
  if (method !== 'btree' && index.unique === true) throw new RxDBError(`索引方法 ${method} 不支持 UNIQUE`);
  return method;
};

const propertyColumn = (metadata: EntityMetadata, field: string, dialect: StorageDialect): string => {
  if (!(metadata.generatedColumnMap instanceof Map))
    throw new RxDBError('高级索引元数据尚未规范化：缺少 generatedColumnMap');
  const generated = metadata.generatedColumnMap.get(field);
  if (generated !== undefined) return compileGeneratedColumn(metadata, generated, dialect).columnName;
  const property = metadata.propertyMap.get(field);
  if (property === undefined) throw new RxDBError(`高级索引引用的标量字段不存在：${field}`);
  if (property.encrypted === true) throw new RxDBError(`高级索引不能引用加密字段：${field}`);
  if (!scalarPropertyTypes.has(property.type)) throw new RxDBError(`高级索引字段 ${field} 不支持类型 ${property.type}`);
  return property.columnName;
};

const columnsOf = (metadata: EntityMetadata, index: EntityIndexMetadata, dialect: StorageDialect): string[] => {
  if (index.expression !== undefined) {
    if (index.properties !== undefined) throw new RxDBError(`索引 ${index.name} 的 expression 与 properties 互斥`);
    return [];
  }
  const properties = index.properties === undefined ? [index.name] : index.properties;
  if (!Array.isArray(properties) || properties.length === 0 || properties.some(field => typeof field !== 'string')) {
    throw new RxDBError(`高级索引 ${index.name} 必须引用非空的标量字段数组`);
  }
  const columns = properties.map(field => propertyColumn(metadata, field, dialect));
  if (new Set(columns).size !== columns.length) throw new RxDBError(`高级索引 ${index.name} 不能重复引用同一列`);
  return columns;
};

const assertMethodExpression = (
  method: StorageIndexMethod,
  expression: CompiledStorageExpression | undefined
): void => {
  if (method === 'gin' && expression?.kind !== 'jsonDocument') {
    throw new RxDBError('GIN 索引只接受 JSON 文档表达式');
  }
  if (method !== 'gin' && expression?.kind === 'jsonDocument') {
    throw new RxDBError(`${method} 索引不接受 JSON 文档表达式`);
  }
};

/** 编译并验证高级索引；明确排除当前方言时返回 null，生效声明不支持则抛错。 */
export const compileAdvancedIndex = (
  metadata: EntityMetadata,
  index: EntityIndexMetadata,
  dialect: StorageDialect
): CompiledAdvancedIndex | null => {
  if (index === null || typeof index !== 'object' || Array.isArray(index) || typeof index.name !== 'string') {
    throw new RxDBError('高级索引必须是包含名称的声明对象');
  }
  const dialects = dialectsOf(index, dialect);
  const method = methodOf(index);
  const columns = columnsOf(metadata, index, dialect);
  const expression =
    index.expression === undefined ? undefined : compileStorageExpression(metadata, index.expression, dialect);
  assertMethodExpression(method, expression);
  const requiredExtensions = method === 'gist' ? ['btree_gist'] : [];
  const definition = JSON.stringify({
    version: 1,
    namespace: metadata.namespace,
    tableName: metadata.tableName,
    columns,
    expression: expression?.definition ?? null,
    method,
    unique: index.unique === true,
    dialects: dialects ?? null,
    operatorClass: method === 'gin' ? 'jsonb_ops' : null,
    requiredExtensions
  });
  const name = storageConstraintName('sx_', metadata, index.name, definition, '高级索引');
  if (dialects !== undefined && !dialects.includes(dialect)) return null;
  if (dialect === 'sqlite' && method !== 'btree') throw new RxDBError(`SQLite 不支持索引方法 ${method}`);
  return {
    name,
    columns,
    ...(expression === undefined ? {} : { expression: expression.sql }),
    method,
    unique: index.unique === true,
    ...(method === 'gin' ? { operatorClass: 'jsonb_ops' as const } : {}),
    requiredExtensions,
    definition
  };
};
