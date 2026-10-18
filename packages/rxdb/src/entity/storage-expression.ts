import { RxDBError } from '../RxDBError.js';
import { quoteSqlIdentifier, sqlStringLiteral } from '../system/sql-literal.js';
import type { EntityMetadata } from './metadata.interface.js';
import { PropertyType, type EntityPropertyMetadata } from './property-types.interface.js';

/** 声明式存储表达式支持的两个方言家族。 */
export type StorageDialect = 'sqlite' | 'postgres';

/** 可以稳定生成列与建立标量索引的 JSON 值类型。 */
export type JsonScalarDataType = 'string' | 'number' | 'boolean';

/** 同一行 JSON 对象的单个字面键；字符串列必须明确声明 JSON 文本编码。 */
export interface JsonScalarStorageExpression {
  kind: 'jsonScalar';
  property: string;
  key: string;
  dataType: JsonScalarDataType;
  jsonText?: true;
}

/** 完整 JSON 文档表达式，供 PostgreSQL GIN 包含查询使用。 */
export interface JsonDocumentStorageExpression {
  kind: 'jsonDocument';
  property: string;
  jsonText?: true;
}

/** 白名单表达式，不接受原始 SQL、函数回调或跨表引用。 */
export type StorageExpression = JsonScalarStorageExpression | JsonDocumentStorageExpression;

/** 已解析物理源列、表达式 SQL 与稳定定义的编译结果。 */
export interface CompiledStorageExpression {
  kind: StorageExpression['kind'];
  dataType: JsonScalarDataType | 'json';
  sourceProperty: string;
  sourceColumn: string;
  sql: string;
  definition: string;
}

const expressionOf = (value: unknown): StorageExpression => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RxDBError('存储表达式必须是白名单 JSON 声明，不接受 SQL 字符串或回调');
  }
  const expression = value as Record<string, unknown>;
  if (expression['kind'] !== 'jsonScalar' && expression['kind'] !== 'jsonDocument') {
    throw new RxDBError('存储表达式只支持 jsonScalar / jsonDocument');
  }
  const allowed =
    expression['kind'] === 'jsonScalar' ?
      ['kind', 'property', 'key', 'dataType', 'jsonText']
    : ['kind', 'property', 'jsonText'];
  if (Object.keys(expression).some(key => !allowed.includes(key))) {
    throw new RxDBError('存储表达式包含白名单以外的字段');
  }
  if (
    typeof expression['property'] !== 'string' ||
    expression['property'].length === 0 ||
    expression['property'].includes('.')
  ) {
    throw new RxDBError('存储表达式来源必须是同实体的直接属性，不能是关系路径');
  }
  if (expression['jsonText'] !== undefined && expression['jsonText'] !== true) {
    throw new RxDBError('JSON 文本来源只接受 jsonText: true');
  }
  if (expression['kind'] === 'jsonScalar') return scalarExpressionOf(expression);
  return expression as unknown as JsonDocumentStorageExpression;
};

const scalarExpressionOf = (expression: Record<string, unknown>): JsonScalarStorageExpression => {
  if (typeof expression['key'] !== 'string' || expression['key'].includes('\u0000')) {
    throw new RxDBError('JSON 标量表达式的 key 必须是不含 NUL 的字面字符串');
  }
  if (typeof expression['dataType'] !== 'string' || !['string', 'number', 'boolean'].includes(expression['dataType'])) {
    throw new RxDBError('JSON 标量表达式只支持 string / number / boolean，不支持日期或复合值提升');
  }
  return expression as unknown as JsonScalarStorageExpression;
};

const sourceOf = (metadata: EntityMetadata, expression: StorageExpression): EntityPropertyMetadata => {
  const source = metadata.propertyMap.get(expression.property);
  if (source === undefined) throw new RxDBError(`存储表达式来源字段不存在：${expression.property}`);
  if (source.encrypted === true) throw new RxDBError(`存储表达式不能引用加密来源：${expression.property}`);
  if (source.type === PropertyType.string && expression.jsonText === true) return source;
  if (source.type === PropertyType.json || source.type === PropertyType.keyValue) {
    if (expression.jsonText === true) throw new RxDBError(`原生 JSON 来源 ${expression.property} 不能标记为 JSON 文本`);
    return source;
  }
  throw new RxDBError(`存储表达式来源 ${expression.property} 必须是 JSON 属性或显式 jsonText: true 的字符串列`);
};

const sqliteScalarSql = (column: string, expression: JsonScalarStorageExpression): string => {
  const path = sqlStringLiteral(`$.${JSON.stringify(expression.key)}`);
  const type = `json_type(${column}, ${path})`;
  const types = { string: "= 'text'", number: "IN ('integer', 'real')", boolean: "IN ('true', 'false')" };
  return `CASE WHEN ${type} ${types[expression.dataType]} THEN json_extract(${column}, ${path}) ELSE NULL END`;
};

const postgresScalarSql = (document: string, expression: JsonScalarStorageExpression): string => {
  const key = sqlStringLiteral(expression.key);
  const value = `${document}->${key}`;
  const values = {
    string: `${document}->>${key}`,
    number: `(${value})::numeric`,
    boolean: `(${value})::boolean`
  };
  return `CASE WHEN jsonb_typeof(${value}) = '${expression.dataType}' THEN ${values[expression.dataType]} ELSE NULL END`;
};

/** 按方言编译白名单 JSON 表达式，并拒绝无效来源或类型。 */
export const compileStorageExpression = (
  metadata: EntityMetadata,
  expression: StorageExpression,
  dialect: StorageDialect
): CompiledStorageExpression => {
  if (dialect !== 'sqlite' && dialect !== 'postgres') throw new RxDBError(`不支持的存储方言：${String(dialect)}`);
  const declaration = expressionOf(expression);
  const source = sourceOf(metadata, declaration);
  const column = quoteSqlIdentifier(source.columnName);
  const document = dialect === 'postgres' && source.type === PropertyType.string ? `(${column})::jsonb` : column;
  const sql =
    declaration.kind === 'jsonDocument' ? document
    : dialect === 'sqlite' ? sqliteScalarSql(column, declaration)
    : postgresScalarSql(document, declaration);
  const dataType = declaration.kind === 'jsonScalar' ? declaration.dataType : 'json';
  const definition = JSON.stringify({
    version: 1,
    kind: declaration.kind,
    sourceProperty: source.name,
    sourceColumn: source.columnName,
    sourceType: source.type,
    jsonText: declaration.jsonText === true,
    key: declaration.kind === 'jsonScalar' ? declaration.key : null,
    dataType
  });
  return {
    kind: declaration.kind,
    dataType,
    sourceProperty: source.name,
    sourceColumn: source.columnName,
    sql,
    definition
  };
};
