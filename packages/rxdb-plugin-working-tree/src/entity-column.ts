/**
 * @fileoverview 拼 SQL 时取实体列名的共用工厂。
 *
 * @remarks
 * 六处单语句 CAS/状态转移各自需要把字段名翻成真实列名再加引号，规则完全相同：
 * 取不到列名就抛，**绝不用字段名兜底**。兜底拼出来的是一条语法正确、却永远匹配不到
 * 任何行的 UPDATE——`rowsAffected` 恒为 0，症状是「提交总是冲突」这种查起来最贵的假故障。
 *
 * 之所以做成工厂而不是一个多传一个实体名参数的函数：调用点一处平均出现十几次，
 * 每次都重复传实体名，迟早有一处传错，而错了的表现只是一条错误文案指向别的实体。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { getEntityColumnName, quoteSqlIdentifier, RxDBError } from '@aiao/rxdb';

/**
 * 造一个「取列名并加引号」的取数器。
 *
 * @param entityName - 实体名，只用于组装错误文案
 * @returns 取数器；传入元数据与字段名，返回已加引号的列名
 *
 * @example
 * ```ts
 * const columnOf = createColumnOf<WorkingTreeStateColumn>('WorkingTreeState');
 * const sql = `UPDATE ${tableRef} SET ${columnOf(metadata, 'entryCount')} = 0`;
 * ```
 */
export const createColumnOf =
  <F extends string>(entityName: string) =>
  (metadata: EntityMetadata, field: F): string => {
    const columnName = getEntityColumnName(metadata, field);
    if (!columnName) throw new RxDBError(`${entityName} 元数据里没有 '${field}' 对应的列`);
    return quoteSqlIdentifier(columnName);
  };
