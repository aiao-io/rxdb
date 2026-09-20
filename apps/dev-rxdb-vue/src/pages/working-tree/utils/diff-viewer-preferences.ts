import { ref } from 'vue';

/** 右侧 diff 的两种显示（GitHub Desktop 的 Unified / Split 同义）。 */
export type WorkingTreeDiffViewMode = 'unified' | 'split';

/**
 * Diff 查看器的显示偏好（Vue 侧等价物：Angular 的 `WorkingTreeDiffDisplayPreferences`
 * 服务，改为模块级共享 ref —— 变更 / 历史两处查看器实例共享同一份偏好）。
 *
 * @remarks
 * 显示模式默认 Split（用户拍板）；隐藏只有空白差异的字段与自动换行的开关
 * 见 Diff Settings 菜单（GitHub Desktop 同款）。
 */
export const diffDisplayMode = ref<WorkingTreeDiffViewMode>('split');
/** 隐藏只有空白差异的字段（GitHub Desktop Diff Settings 的 Hide Whitespace Changes）。 */
export const diffHideWhitespace = ref(false);
/** 自动换行（GitHub Desktop Diff Settings 的 Show Word Wrap）。 */
export const diffWrap = ref(true);
