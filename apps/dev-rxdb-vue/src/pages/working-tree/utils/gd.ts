/**
 * @fileoverview working-tree 面板的 GitHub Desktop 形态样式辅助（纯函数）。
 *
 * @remarks
 * 头像底色用 GitHub 的八色头像盘（`avatar-bg` 系列，白字对比度全部 ≥4.5:1——
 * 面板的 axe 门禁是零违规，浅蓝绿之类白字只有 ~3:1 的颜色不能进盘）。散列用
 * 31 进制的字符滚动，同一个作者名在三个列表里稳定同色：GitHub Desktop 里
 * 头像颜色就是作者的身份锚点。
 */

import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { CircleDot, MinusCircle, PlusCircle } from '@lucide/vue';
import type { Component } from 'vue';

/** GitHub 的八色头像盘：白字对比度均 ≥4.5:1。 */
const AVATAR_COLORS = ['#1f6feb', '#1f883d', '#6e40c9', '#a40e26', '#bc4c00', '#953800', '#4a2b9f', '#0a3069'] as const;

/** 作者名 → 头像底色：31 进制字符滚动散列，确定性取色。 */
export const gdAvatarColor = (name: string): string => {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

/** 作者名 → 头像里的首字符；空名兜底成 `?`。 */
export const gdAvatarInitial = (name: string): string => (name.trim().charAt(0) || '?').toUpperCase();

/** GitHub Desktop 的文件状态图标：新增 ＋ / 修改 • / 删除 －（Vue 侧返回 lucide-vue 组件）。 */
export const gdOpIcon = (operation: WorkingTreeDiffEntry['operation']): Component =>
  operation === 'insert' ? PlusCircle
  : operation === 'delete' ? MinusCircle
  : CircleDot;

/** 状态图标颜色：与 GitHub Desktop 同语义（绿新增 / 金修改 / 红删除）。 */
export const gdOpColor = (operation: WorkingTreeDiffEntry['operation']) =>
  operation === 'insert' ? 'var(--gd-add-fg)'
  : operation === 'delete' ? 'var(--gd-del-fg)'
  : '#d4a72c';

/**
 * demo 已知实体的表名（`@Entity` 的 `tableName`，如 Todo → todos）。
 * 路径**优先用表名**：表名才是数据真正落的位置；查不到（demo 没登记）回退实体名。
 */
const TABLE_NAME_BY_ENTITY: Readonly<Record<string, string>> = {
  Todo: 'todos'
};

/** 实体名 → 展示用表名：优先 `@Entity` 的 tableName，查不到回退实体名。 */
export const gdTableName = (entity: string): string => TABLE_NAME_BY_ENTITY[entity] ?? entity;

/** 条目的展示路径：`schema/表名/实体id`（schema 即命名空间；不写「entities」前缀——列表里全是 entities，没信息量）。 */
export const gdEntryPath = (entry: Pick<WorkingTreeDiffEntry, 'namespace' | 'entity' | 'entityId'>): string =>
  `${entry.namespace}/${gdTableName(entry.entity)}/${entry.entityId}`;

/** 状态名：图标上挂的 title / aria-label。 */
export const gdOpLabel = (operation: WorkingTreeDiffEntry['operation']) =>
  operation === 'insert' ? 'Added'
  : operation === 'delete' ? 'Deleted'
  : 'Modified';

/** 路径文本的状态色（GitHub Desktop 的 PathLabel 同款：新增绿 / 删除红 / 修改正文色）。 */
export const gdPathColor = (operation: WorkingTreeDiffEntry['operation']) =>
  operation === 'insert' ? 'var(--gd-path-add)'
  : operation === 'delete' ? 'var(--gd-path-del)'
  : 'var(--gd-fg)';

/**
 * GitHub Desktop 的 TimeAgo 口径的相对时间。
 *
 * 一分钟内 just now，之后按分钟 / 小时 / 天逐级；昨天单独一个词，一周以前回到
 * 「on Sep 15」式的绝对日期。历史列表行用（悬停 title 仍给完整时间戳）。
 */
export const gdRelativeTime = (date: Date, now: Date = new Date()): string => {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};
