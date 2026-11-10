import { PropertyType, type EntityMetadata } from '@aiao/rxdb';
import { isFunction } from '@aiao/utils';

/**
 * 默认值是否是数据库侧的「当前时刻」：`CURRENT_TIMESTAMP` 与 `now()` 两种写法。
 *
 * @remarks
 * 建表 DDL 把两种写法都写成 `DEFAULT now()`（见 `create_table_sql`）；加密列没有 DDL 默认值，
 * {@link fillEncryptedDefaults} 要认同一组写法，两处共用这一个判据才不会漂移。
 */
export const isCurrentTimestampDefault = (value: unknown): boolean =>
  value === 'CURRENT_TIMESTAMP' || value === 'now()';

/**
 * 补上缺省的加密列默认值。
 *
 * @param metadata - 实体元数据
 * @param columns - 以物理列名为键的待写入字段（`normalizeCreateEntity` 的产物），就地补齐
 * @param now - 本次写入的时刻，`CURRENT_TIMESTAMP` / `now()` 取它
 *
 * @remarks
 * 加密列不在 DDL 里写 DEFAULT（那是明文，会留在 pg catalog，缺省时还会让库端把明文落进密文列，读取即解密失败），
 * 而 INSERT 只写定义了的列、批量 INSERT 对缺省的行写 `DEFAULT`：缺省的加密列只能在这里按元数据补上，
 * 随整行封成信封。补的正是 DDL 原先会写的那类默认值（非函数、非 binary），单条与批量 INSERT 共用这一处，
 * 两条路径才不会各补各的。显式给了值（含 `null`）的列不动。
 */
export const fillEncryptedDefaults = (metadata: EntityMetadata, columns: Record<string, unknown>, now: Date): void => {
  for (const property of metadata.propertyMap.values()) {
    if (property.encrypted !== true || columns[property.columnName] !== undefined) continue;
    const value = property.default;
    if (value === undefined || isFunction(value) || property.type === PropertyType.binary) continue;
    columns[property.columnName] = isCurrentTimestampDefault(value) ? now : value;
  }
};
