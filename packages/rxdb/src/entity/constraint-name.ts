/**
 * @fileoverview 声明式存储约束的确定性命名（US-030）：`ck_` / `uq_` / `ex_` 三类共用。
 *
 * 约束名 = 前缀 + 表名 + 作者给的 `name` + 规范化定义的 8 位哈希。哈希让「改定义不改名」
 * 也成为可检出的漂移（AC#11）。作者 `name` 限 `[a-z][a-z0-9_]*`；整名按 UTF-8 字节数
 * ≤ 63（PG 标识符上限），超长在元数据期抛错、不截断——截断会让两个约束撞名（AC#15）。
 *
 * 表名段只允许字母、数字与下划线（任意文字的字母都算）：约束名要原样出现在 SQLite 的违约消息
 * （`CHECK constraint failed: <名>` 以空白为界、排他触发器的 `rxdb:exclusion_violation:<名>:` 以冒号为界）
 * 与建表 SQL（双引号定界）里，漂移扫描与违约归一都按这些边界取名；空白、冒号、逗号、引号会把名字截断。
 *
 * 规范化定义由各类约束自己给出：CHECK 是编译后的表达式（约束名只在表内唯一，两后端都是）；
 * 条件唯一索引与区间排他在 SQLite 上是**库级**对象（索引、触发器），所以它们的定义里带上
 * `namespace`——两个 namespace 下同名表、同名约束、同一定义不会撞成同一个名字。
 */

import { RxDBError } from '../RxDBError.js';
import type { EntityMetadata } from './metadata.interface.js';

/** 作者给的约束名形状：小写开头，只含小写字母、数字与下划线。 */
const CONSTRAINT_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** 约束名里的表名段：字母（任意文字）、数字与下划线，见本文件 @fileoverview。 */
const CONSTRAINT_TABLE_NAME_PATTERN = /^[\p{L}\p{N}_]+$/u;

/** 约束名总长上限（UTF-8 字节数）：PG 标识符上限 63 字节，SQLite 不受限但两边要对齐。 */
export const CONSTRAINT_NAME_MAX_BYTES = 63;

/** 规范化定义的 8 位哈希（FNV-1a 32 位，hex 小写）。 */
export const hashConstraintDefinition = (definition: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < definition.length; index++) {
    hash ^= definition.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * 生成确定性约束名：`<prefix><表名>_<作者 name>_<规范化定义 8 位哈希>`。
 *
 * @param prefix - `ck_` / `uq_` / `ex_`
 * @param metadata - 约束所在实体的元数据
 * @param name - 作者给的约束名
 * @param definition - 规范化定义（哈希输入）
 * @param kind - 错误消息里的约束种类，如 `CHECK`、`条件唯一索引`
 * @throws {@link RxDBError} 作者 `name` 不合 `[a-z][a-z0-9_]*`、表名含字母 / 数字 / 下划线以外的字符、
 *   或整名超 63 UTF-8 字节时（AC#15）
 */
export const storageConstraintName = (
  prefix: string,
  metadata: EntityMetadata,
  name: string,
  definition: string,
  kind: string
): string => {
  if (!CONSTRAINT_NAME_PATTERN.test(name)) {
    throw new RxDBError(
      `${kind} 约束名 '${name}' 非法：只允许 [a-z][a-z0-9_]*（小写字母开头，只含小写字母、数字与下划线）`
    );
  }
  if (!CONSTRAINT_TABLE_NAME_PATTERN.test(metadata.tableName)) {
    throw new RxDBError(
      `${kind} 约束名的表名 '${metadata.tableName}' 非法：声明了存储约束的实体，表名只允许字母、数字与下划线——` +
        '约束名要原样出现在 SQLite 的违约消息与建表 SQL 里，空白、冒号、逗号、引号会把它截断，违约就无法归一'
    );
  }
  const fullName = `${prefix}${metadata.tableName}_${name}_${hashConstraintDefinition(definition)}`;
  if (new TextEncoder().encode(fullName).length > CONSTRAINT_NAME_MAX_BYTES) {
    throw new RxDBError(
      `${kind} 约束名 '${fullName}' 超过 ${CONSTRAINT_NAME_MAX_BYTES} UTF-8 字节（PG 标识符上限），请缩短表名或约束 name；不截断，截断会让两个约束撞名`
    );
  }
  return fullName;
};
