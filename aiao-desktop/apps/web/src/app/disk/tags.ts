import { DiskPath } from './disk-path';
import { FsNode } from './disk-tree';

/** Finder 标签的七种颜色，顺序即侧栏图例与选择菜单的顺序。 */
export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export const TAG_COLORS: readonly TagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

/** 标签映射：磁盘路径字符串 → 颜色集合。 */
export type TagsMap = Readonly<Record<string, readonly TagColor[]>>;

/** 偏好里存 `finder:tags` 的键。 */
export const TAGS_KEY = 'finder:tags';

/** 一个值是不是合法的标签颜色。 */
export const isTagColor = (value: unknown): value is TagColor =>
  typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value);

/** 校验偏好里读出的标签映射；格式不符时为 `null`。 */
export function parseTagsMap(value: unknown): TagsMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next: Record<string, readonly TagColor[]> = {};
  for (const [key, colors] of Object.entries(value as Record<string, unknown>)) {
    if (!key || !Array.isArray(colors) || !colors.every(isTagColor)) return null;
    next[key] = [...new Set(colors)];
  }
  return next;
}

/** 路径在映射里的键（`Users/…/Desktop/note.txt`）。 */
export const tagsKeyOf = (path: DiskPath): string => path.join('/');

/** 一个条目当前的标签颜色；没有标签或没有磁盘路径时为空数组。 */
export function tagsOf(map: TagsMap, node: FsNode): readonly TagColor[] {
  return (node.path && map[tagsKeyOf(node.path)]) ?? [];
}

/** 设置或清除（空数组）一个路径的标签，返回新映射。 */
export function withTags(map: TagsMap, path: DiskPath, colors: readonly TagColor[]): TagsMap {
  const next: Record<string, readonly TagColor[]> = { ...map };
  const key = tagsKeyOf(path);
  if (colors.length) next[key] = [...new Set(colors)];
  else delete next[key];
  return next;
}

/** 条目改名或移走之后迁移键：`from` 及其全部后代 → `to` 及其后代；没碰到键时原样返回。 */
export function migrateTags(map: TagsMap, from: DiskPath, to: DiskPath): TagsMap {
  const fromKey = tagsKeyOf(from);
  const toKey = tagsKeyOf(to);
  if (fromKey === toKey) return map;
  const next: Record<string, readonly TagColor[]> = {};
  let touched = false;
  for (const [key, colors] of Object.entries(map)) {
    if (key === fromKey) {
      next[toKey] = colors;
      touched = true;
    } else if (key.startsWith(`${fromKey}/`)) {
      next[`${toKey}/${key.slice(fromKey.length + 1)}`] = colors;
      touched = true;
    } else next[key] = colors;
  }
  return touched ? next : map;
}
