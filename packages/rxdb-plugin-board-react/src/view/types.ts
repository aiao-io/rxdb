import type { UUID } from '@aiao/rxdb';
import type { BoardGridDirection, BoardMoveDirection, DeletePlan, LabelDeletePlan } from '@aiao/rxdb-plugin-board';

/** 弹层种类：菜单（板 / 列 / 卡片）与选择器（移到列 / 详情所在列 / 详情标签）。 */
export type BoardPopoverKind =
  'board-menu' | 'column-menu' | 'task-menu' | 'move-picker' | 'detail-column-picker' | 'detail-label-picker';

/** 打开中的弹层：种类、目标与根层 fixed 坐标。 */
export interface PopoverState {
  readonly kind: BoardPopoverKind;
  readonly targetId: UUID | null;
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/** 模态对话框。 */
export type DialogState =
  | { readonly kind: 'confirm-delete'; readonly plan: DeletePlan }
  | { readonly kind: 'confirm-label-delete'; readonly plan: LabelDeletePlan }
  | { readonly kind: 'board-composer' }
  | { readonly kind: 'labels' }
  | { readonly kind: 'search' }
  | { readonly kind: 'shortcuts' };

/** 标签编辑器（新建时 `labelId` 为 `null`）。 */
export interface LabelEditorState {
  readonly labelId: UUID | null;
  readonly name: string;
  readonly color: string;
}

/** 选择器选项（列或标签）。 */
export interface PickerOption {
  readonly id: UUID;
  readonly label: string;
  readonly color: string | null;
  readonly selected: boolean;
}

/** 操作提示（带撤销与否）。 */
export interface ToastState {
  readonly message: string;
  readonly undoable: boolean;
}

/** 拖拽源。 */
export interface DragState {
  readonly kind: 'task' | 'column';
  readonly id: UUID;
}

/** 拖拽落点反馈：卡片前后 / 列尾 / 列前后。 */
export type DropFeedback =
  | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
  | { readonly kind: 'task-end'; readonly columnId: UUID }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' };

/** 搜索句柄状态。 */
export type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/** 键盘导航 / 菜单移动用的列视图。 */
export interface ColumnTaskIds {
  readonly columnId: UUID;
  readonly taskIds: readonly UUID[];
}

export const POPOVER_WIDTH: Readonly<Record<BoardPopoverKind, number>> = {
  'board-menu': 240,
  'column-menu': 240,
  'task-menu': 240,
  'move-picker': 280,
  'detail-column-picker': 280,
  'detail-label-picker': 280
};

/** 弹层高度估算（定位用；超出视口时 CSS max-height 兜住滚动）。 */
export const POPOVER_HEIGHT: Readonly<Record<BoardPopoverKind, number>> = {
  'board-menu': 140,
  'column-menu': 340,
  'task-menu': 280,
  'move-picker': 320,
  'detail-column-picker': 320,
  'detail-label-picker': 360
};

export const FOCUS_KEYS: Readonly<Record<string, BoardGridDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'first',
  End: 'last'
};

export const MOVE_KEYS: Readonly<Record<string, BoardMoveDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

export const SHORTCUT_GROUPS = [
  {
    title: '导航',
    items: [
      { label: '在卡片间移动', keys: ['↑', '↓', '←', '→'] },
      { label: '本列第一张 / 最后一张', keys: ['Home', 'End'] },
      { label: '聚焦筛选', keys: ['/'] },
      { label: '搜索任务', keys: ['⌘/Ctrl', 'K'] },
      { label: '显示快捷键', keys: ['?'] }
    ]
  },
  {
    title: '卡片',
    items: [
      { label: '打开详情', keys: ['Enter'] },
      { label: '编辑标题', keys: ['F2'] },
      { label: '上移 / 下移', keys: ['⌥', '↑', '↓'] },
      { label: '移到相邻列', keys: ['⌥', '←', '→'] },
      { label: '删除', keys: ['Del'] },
      { label: '更多操作', keys: ['⇧', 'F10'] }
    ]
  },
  {
    title: '编辑',
    items: [
      { label: '撤销', keys: ['⌘/Ctrl', 'Z'] },
      { label: '重做', keys: ['⇧', '⌘/Ctrl', 'Z'] },
      { label: '关闭菜单 / 对话框 / 详情', keys: ['Esc'] }
    ]
  }
] as const;

/** 事件目标是否为可编辑元素（输入框内不响应全局单键快捷键）。 */
export const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** ⌘（macOS）或 Ctrl。 */
export const isModifier = (event: { readonly metaKey: boolean; readonly ctrlKey: boolean }): boolean =>
  event.metaKey || event.ctrlKey;

/** 错误转提示文字。 */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 拼接类名（`false` 项跳过），对应模板里的 `[class.is-*]` 条件类。 */
export const cx = (...names: readonly (string | false)[]): string => names.filter(Boolean).join(' ');
