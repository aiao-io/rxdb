/**
 * Schema 校验器（T052）。
 *
 * 运行时扫描全部已注册 entity，校验每个 `searchable` 字段类型确实是
 * `string` / `enum` / `stringArray`；若外部未类型化元数据带入非法组合
 * 则抛错。同时抽取实际会进入 FTS5 的字段计划概览，供 installer 消费。
 *
 * **纯函数**：不访问 RxDB runtime，不执行任何 SQL。
 *
 * @packageDocumentation
 */

import type { EntityMetadata } from '@aiao/rxdb';

const SEARCHABLE_TYPES = new Set(['string', 'enum', 'stringArray']);

/**
 * 合法的 searchable 字段类型集合。
 *
 * 公开对象是冻结的只读视图；校验器使用模块私有集合，避免消费方通过运行时
 * `Set.prototype.add` 改写全局 schema 规则。
 *
 * @public
 */
const SEARCHABLE_TYPES_SNAPSHOT = new Set(SEARCHABLE_TYPES);
Object.defineProperties(SEARCHABLE_TYPES_SNAPSHOT, {
  add: { value: undefined },
  delete: { value: undefined },
  clear: { value: undefined }
});
export const SEARCHABLE_PROPERTY_TYPES: ReadonlySet<string> = Object.freeze(SEARCHABLE_TYPES_SNAPSHOT);

/**
 * Schema 校验失败详情。
 *
 * @public
 */
export interface InvalidSearchableField {
  /** 实体名（如 `Article`） */
  readonly entity: string;
  /** 字段名（property 声明的 name，Uncapitalize） */
  readonly field: string;
  /** 实际类型字符串 */
  readonly type: string;
}

/**
 * 扫描 entity metadata 中所有被显式标注 `searchable: true` 的字段，
 * 收集类型不合法（非 string/enum/stringArray）的条目。
 *
 * @returns 非法字段列表；若全部合法返回空数组。
 * @public
 */
export const collectInvalidSearchableFields = (
  metadatas: readonly EntityMetadata[]
): readonly InvalidSearchableField[] => {
  const invalid: InvalidSearchableField[] = [];
  for (const meta of metadatas) {
    for (const prop of meta.properties) {
      if ('searchable' in prop && prop.searchable === true) {
        const type = String(prop.type);
        if (!SEARCHABLE_TYPES.has(type)) {
          invalid.push({ entity: meta.name, field: String(prop.name), type });
        }
      }
    }
  }
  return invalid;
};

/**
 * 汇总式校验：遇到任何非法字段即抛错，否则静默通过。
 *
 * 错误消息列出所有非法条目，避免开发者需多轮修复。
 *
 * @throws {Error} 当存在非法 `searchable` 声明
 * @public
 */
export const assertSearchableSchemaValid = (metadatas: readonly EntityMetadata[]): void => {
  const invalid = collectInvalidSearchableFields(metadatas);
  if (invalid.length === 0) return;
  const details = invalid.map(v => `  - ${v.entity}.${v.field} (type="${v.type}")`).join('\n');
  throw new Error(
    `[rxdb-plugin-search] Invalid "searchable" declarations — only string/enum/stringArray allowed:\n${details}`
  );
};
