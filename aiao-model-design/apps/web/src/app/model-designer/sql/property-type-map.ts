/**
 * PropertyType → PostgreSQL 类型映射
 */

/** 映射结果 */
export interface PgTypeMapping {
  type: string;
  /** 可选 CHECK 表达式主体（不含 CHECK 关键字与外层括号） */
  check?: string;
}

/**
 * 将设计属性类型映射为 PostgreSQL 列类型
 * @param propertyType - DesignProperty.propertyType
 * @param enumValues - enum 选项（可选）
 * @param quotedColumn - 已 quote 的列名（用于 CHECK）
 */
export function mapPropertyTypeToPg(
  propertyType: string,
  enumValues?: readonly string[] | null,
  quotedColumn?: string
): PgTypeMapping {
  switch (propertyType) {
    case 'uuid':
      return { type: 'uuid' };
    case 'string':
      return { type: 'text' };
    case 'enum': {
      const values = (enumValues ?? []).filter(v => v.length > 0);
      if (values.length === 0 || !quotedColumn) return { type: 'text' };
      const list = values.map(v => `'${v.replaceAll("'", "''")}'`).join(', ');
      return { type: 'text', check: `${quotedColumn} IN (${list})` };
    }
    case 'number':
      return { type: 'double precision' };
    case 'integer':
      return { type: 'integer' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'timestamptz' };
    case 'stringArray':
      return { type: 'text[]' };
    case 'numberArray':
      return { type: 'double precision[]' };
    case 'keyValue':
    case 'json':
      return { type: 'jsonb' };
    default:
      return { type: 'text' };
  }
}
