import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';

/**
 * @fileoverview working-tree 面板的补丁排版纯函数。
 *
 * @remarks
 * `WorkingTreeDiffEntry` 的 `patch` / `inversePatch` 是**字段级**的「旧值 → 新值」映射
 * （不是 RFC 6902 操作数组，见插件包 `diff.ts` 的 TSDoc），本模块把它们摊成界面能画的
 * 两种形态：列表行的一行摘要（`formatPatchSummary`），详情区的逐字段 - / + 行
 * （`buildFieldDiff` / `buildDiffRows`）。两份排版共用同一组取值规则——分写两个文件，
 * 迟早「列表说 A、详情说 B」。
 */

/** 一个字段在 diff 详情里的差异。 */
export interface FieldDiffLine {
  /** 字段名 */
  readonly key: string;
  /** 旧值；`undefined` 表示这个字段是新增的 */
  readonly before: unknown;
  /** 新值；`undefined` 表示这个字段被删除 */
  readonly after: unknown;
}

/** 详情区一行；`sign` 是画出来的 - 或 +。 */
export interface DiffRow {
  /** 字段名 */
  readonly key: string;
  readonly sign: '-' | '+';
  readonly value: unknown;
}

/** `undefined` 无法 JSON 序列化，缺失侧用一个看得见的占位符而不是「undefined」字样。 */
const MISSING = '—';

/** 字段值 → 展示文本：与列表摘要、详情行共用同一口味。 */
export const formatFieldValue = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** 缺失侧（`undefined`）的展示文本。 */
const formatSide = (value: unknown): string => (value === undefined ? MISSING : formatFieldValue(value));

/**
 * 把一条 diff 条目摊成逐字段差异。
 *
 * insert 只有新值、delete 只有旧值、update 取两侧键的并集——一个字段只在补丁里就是
 * 「新增」，只在逆向补丁里就是「删除」，两边都有才是「修改」。
 */
export const buildFieldDiff = (entry: WorkingTreeDiffEntry): FieldDiffLine[] => {
  if (entry.operation === 'insert') {
    const patch = entry.patch ?? {};
    return Object.keys(patch).map(key => ({ key, before: undefined, after: patch[key] }));
  }
  if (entry.operation === 'delete') {
    const inversePatch = entry.inversePatch ?? {};
    return Object.keys(inversePatch).map(key => ({ key, before: inversePatch[key], after: undefined }));
  }
  const inversePatch = entry.inversePatch ?? {};
  const patch = entry.patch ?? {};
  const keys = [...new Set([...Object.keys(inversePatch), ...Object.keys(patch)])];
  return keys.map(key => ({
    key,
    before: key in inversePatch ? inversePatch[key] : undefined,
    after: key in patch ? patch[key] : undefined
  }));
};

/**
 * 把字段差异摊平成详情区的 - / + 行：旧值先画成 `-`，新值后画成 `+`，
 * 与 GitHub Desktop 的行序一致。
 */
export const buildDiffRows = (entry: WorkingTreeDiffEntry): DiffRow[] =>
  buildFieldDiff(entry).flatMap(line => {
    const rows: DiffRow[] = [];
    if (line.before !== undefined) rows.push({ key: line.key, sign: '-', value: line.before });
    if (line.after !== undefined) rows.push({ key: line.key, sign: '+', value: line.after });
    return rows;
  });

const MAX_SUMMARY_LENGTH = 200;

/**
 * diff 条目的一行补丁摘要，列表行用；与 branch-manager 的变更摘要同一个「旧 → 新」口味。
 */
export const formatPatchSummary = (entry: WorkingTreeDiffEntry): string => {
  let text: string;
  if (entry.operation === 'insert') {
    text = entry.patch ? JSON.stringify(entry.patch) : '';
  } else if (entry.operation === 'delete') {
    text = entry.inversePatch ? JSON.stringify(entry.inversePatch) : '';
  } else {
    const inversePatch = (entry.inversePatch ?? {}) as Record<string, unknown>;
    const patch = (entry.patch ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(inversePatch), ...Object.keys(patch)])];
    text = keys.map(key => `${key}: ${formatSide(inversePatch[key])} → ${formatSide(patch[key])}`).join(', ');
  }
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '…' : text;
};

/** 列表行的选中键：同一事务里的多实体条目也互不相同。 */
export const diffEntryKey = (entry: WorkingTreeDiffEntry): string => `${entry.unitId}:${entry.entityId}`;
