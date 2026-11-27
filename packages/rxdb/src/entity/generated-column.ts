import { RxDBError } from '../RxDBError.js';
import { CONSTRAINT_NAME_MAX_BYTES, hashConstraintDefinition } from './constraint-name.js';
import type { EntityMetadata } from './metadata.interface.js';
import {
  compileStorageExpression,
  type JsonScalarDataType,
  type JsonScalarStorageExpression,
  type StorageDialect
} from './storage-expression.js';

/** 独立于可写实体属性的只读 JSON 标量生成列声明。 */
export interface EntityGeneratedColumnMetadataOptions {
  name: string;
  expression: JsonScalarStorageExpression;
}

/** 生成列的物理定义；名称包含定义哈希，便于只读漂移检查。 */
export interface CompiledGeneratedColumn {
  name: string;
  columnName: string;
  sourceProperty: string;
  sourceColumn: string;
  dataType: JsonScalarDataType;
  sqlType: string;
  expression: string;
  storage: 'virtual' | 'stored';
  nullable: true;
  definition: string;
}

/** 读取生效的只读生成列声明；原型链合并由元数据规范化负责。 */
export const generatedColumnsOf = (metadata: EntityMetadata): readonly EntityGeneratedColumnMetadataOptions[] => {
  if (!(metadata.generatedColumnMap instanceof Map))
    throw new RxDBError('生成列元数据尚未规范化：缺少 generatedColumnMap');
  return [...metadata.generatedColumnMap.values()];
};

const generatedName = (name: string, definition: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new RxDBError(`生成列名称非法：${name}`);
  const columnName = `gc_${name}_${hashConstraintDefinition(definition)}`;
  if (new TextEncoder().encode(columnName).length > CONSTRAINT_NAME_MAX_BYTES) {
    throw new RxDBError(`生成列名称超过 ${CONSTRAINT_NAME_MAX_BYTES} UTF-8 字节：${columnName}`);
  }
  return columnName;
};

const assertColumnDeclaration = (metadata: EntityMetadata, column: EntityGeneratedColumnMetadataOptions): void => {
  if (column === null || typeof column !== 'object' || Array.isArray(column) || typeof column.name !== 'string') {
    throw new RxDBError('生成列必须声明名称与 JSON 标量表达式');
  }
  if (Object.keys(column).some(key => key !== 'name' && key !== 'expression')) {
    throw new RxDBError(`生成列 ${column.name} 是数据库只读值，不能声明默认值或可写属性`);
  }
  const conflicts = [...metadata.propertyMap.values(), ...metadata.computedPropertyMap.values()].some(
    property => property.name === column.name || property.columnName === column.name
  );
  if (
    conflicts ||
    metadata.foreignKeyNames.includes(column.name) ||
    metadata.foreignKeyColumnNames.includes(column.name)
  ) {
    throw new RxDBError(`生成列 ${column.name} 与既有可写列、计算属性或关系字段冲突`);
  }
};

const sqlTypes: Record<StorageDialect, Record<JsonScalarDataType, string>> = {
  sqlite: { string: 'TEXT', number: 'REAL', boolean: 'INTEGER' },
  postgres: { string: 'TEXT', number: 'NUMERIC', boolean: 'BOOLEAN' }
};

/** 编译生成列，验证只读边界、命名和允许的 JSON 标量来源。 */
export const compileGeneratedColumn = (
  metadata: EntityMetadata,
  column: EntityGeneratedColumnMetadataOptions,
  dialect: StorageDialect
): CompiledGeneratedColumn => {
  assertColumnDeclaration(metadata, column);
  const expression = compileStorageExpression(metadata, column.expression, dialect);
  if (expression.kind !== 'jsonScalar' || expression.dataType === 'json') {
    throw new RxDBError(`生成列 ${column.name} 仅支持 JSON 标量表达式`);
  }
  const storage = dialect === 'sqlite' ? 'virtual' : 'stored';
  const sqlType = sqlTypes[dialect][expression.dataType];
  const definition = JSON.stringify({
    version: 1,
    namespace: metadata.namespace,
    tableName: metadata.tableName,
    name: column.name,
    source: expression.definition,
    sqlType,
    storage,
    nullable: true
  });
  const columnName = generatedName(column.name, definition);
  const physicalConflict = [...metadata.propertyMap.values()].some(property => property.columnName === columnName);
  if (physicalConflict || metadata.foreignKeyColumnNames.includes(columnName)) {
    throw new RxDBError(`生成列 ${column.name} 的物理名称与既有字段冲突：${columnName}`);
  }
  return {
    name: column.name,
    columnName,
    sourceProperty: expression.sourceProperty,
    sourceColumn: expression.sourceColumn,
    dataType: expression.dataType,
    sqlType,
    expression: expression.sql,
    storage,
    nullable: true,
    definition
  };
};
