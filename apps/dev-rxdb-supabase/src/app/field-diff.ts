import type { RxDBChange } from '@aiao/rxdb';

/** 一个字段的改之前与改之后 */
export interface FieldDiffLine {
  /** 字段名 */
  readonly key: string;
  /** 改之前；`undefined` 表示这个字段是新出现的 */
  readonly before: unknown;
  /** 改之后；`undefined` 表示这个字段被删掉了 */
  readonly after: unknown;
}

/** 每次写入都会变的主键与记账字段：列出来只会盖住真正的修改 */
const BOOKKEEPING_FIELDS: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

/**
 * 一条变更逐字段的改之前与改之后
 *
 * @param change - 变更的类型与前后补丁
 * @returns 新建只有改之后、删除只有改之前、修改取两侧字段的并集；不含主键与记账字段
 *
 * @remarks
 * 与 dev-rxdb-angular working-tree 页的 `buildFieldDiff` 同一套取值规则；应用之间不互相引用，按同一规则在这里写一份。
 */
export function fieldDiffOf(change: Pick<RxDBChange, 'type' | 'patch' | 'inversePatch'>): FieldDiffLine[] {
  const before = change.type === 'INSERT' ? {} : (change.inversePatch ?? {});
  const after = change.type === 'DELETE' ? {} : (change.patch ?? {});
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    key => !BOOKKEEPING_FIELDS.has(key)
  );
  return keys.map(key => ({
    key,
    before: key in before ? (before as Record<string, unknown>)[key] : undefined,
    after: key in after ? (after as Record<string, unknown>)[key] : undefined
  }));
}

/**
 * 字段值的显示文本
 *
 * @param value - 字段值
 * @returns 缺失的一侧是破折号，其余按 JSON
 */
export function formatFieldValue(value: unknown): string {
  return value === undefined ? '—' : JSON.stringify(value);
}
