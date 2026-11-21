/**
 * 中间层 SQL schema：design 与 remote information_schema 的公共形状
 */

/** 单列定义 */
export interface SqlColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string | null;
  /** 可选 CHECK 表达式（不含 CHECK 关键字），如 `"status" IN ('a','b')` */
  check?: string | null;
}

/** 外键定义 */
export interface SqlForeignKey {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: string | null;
  onUpdate?: string | null;
}

/** 索引定义 */
export interface SqlIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/** 单表定义 */
export interface SqlTable {
  name: string;
  columns: SqlColumn[];
  foreignKeys: SqlForeignKey[];
  indexes: SqlIndex[];
}

/** 完整 schema 快照 */
export interface SqlSchema {
  tables: SqlTable[];
}

/** 生成 SQL 的结果 */
export interface GenerateSqlResult {
  sql: string;
  /** 已双引号转义的标识符（table 或 table.column） */
  escapedIdentifiers: string[];
}

/** design → schema 的输入快照（与 RxDB 实体字段对齐的最小集） */
export interface DesignSqlInputEntity {
  id: string;
  name: string;
  tableName?: string | null;
  extendsBase?: string | null;
}

export interface DesignSqlInputProperty {
  id: string;
  name: string;
  propertyType: string;
  columnName?: string | null;
  isNullable?: boolean;
  isUnique?: boolean;
  isRequired?: boolean;
  defaultValue?: string | null;
  enumValues?: string[] | null;
  sortOrder?: string;
}

export interface DesignSqlInputRelation {
  id: string;
  name: string;
  relationKind: string;
  mappedEntityId?: string | null;
  columnName?: string | null;
  onDeleteAction?: string | null;
  onUpdateAction?: string | null;
  /** 所属实体 id */
  designEntityId: string;
}

export interface DesignSqlInputIndex {
  id: string;
  propertyIds: string[];
  isUnique?: boolean;
  displayName?: string | null;
  designEntityId: string;
}

export interface DesignSqlInput {
  entities: DesignSqlInputEntity[];
  properties: DesignSqlInputProperty[];
  relations: DesignSqlInputRelation[];
  indexes: DesignSqlInputIndex[];
  /** property.designEntityId 映射：propertyId → entityId */
  propertyEntityIds: Record<string, string>;
}
