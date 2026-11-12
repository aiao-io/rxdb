/** 点圆圈勾选时统一染成强调蓝，与提醒原来的颜色无关。 */
export const DONE_TINT = '#0a84ff';

/** 「+」新建的提醒默认的时间说明。 */
export const NEW_REMINDER_DUE = 'Today';

/** 库里一条提醒的字段（实体 `Reminder` 满足它，测试里用普通对象）。 */
export interface ReminderFields {
  readonly id: string;
  readonly title: string;
  /** 时间说明，原样显示（例如 `Today 5:00 PM`、`Tomorrow`、`Done`），不是可计算的日期。 */
  readonly due: string;
  readonly done: boolean;
  /** 完成后圆圈的颜色；未完成时圆圈一律是灰色描边。 */
  readonly tint: string;
  /** 列表里的顺序，数值小的在前；新建的排到最前。 */
  readonly position: number;
}

/** 列表里的一行：库里的提醒，或「+」新建、还没写入的草稿。 */
export interface ReminderRow {
  readonly id: string;
  readonly title: string;
  readonly due: string;
  readonly done: boolean;
  readonly tint: string;
  /** 草稿行：标题直接写在 contenteditable 里，Angular 不接管它的文字。 */
  readonly fresh: boolean;
  readonly editing: boolean;
}

/**
 * 「+」新建的草稿。输入完成（失焦且有内容）时才写进库：`createdId` 记下那一行的 id，
 * 活查询把它带回来的同一刻，草稿行让位给库里的行。
 */
export interface ReminderDraft {
  readonly id: string;
  readonly done: boolean;
  readonly editing: boolean;
  readonly title: string;
  readonly createdId: string | null;
}

/** 库里的提醒转成列表行。 */
export const rowOf = (reminder: ReminderFields): ReminderRow => ({
  id: reminder.id,
  title: reminder.title,
  due: reminder.due,
  done: reminder.done,
  tint: reminder.tint,
  fresh: false,
  editing: false
});

/** 草稿转成列表行。 */
export const draftRow = (draft: ReminderDraft): ReminderRow => ({
  id: draft.id,
  title: draft.title,
  due: NEW_REMINDER_DUE,
  done: draft.done,
  tint: DONE_TINT,
  fresh: true,
  editing: draft.editing
});

/** 新提醒的 `position`：比现有的都小，排到最前；列表为空时从 0 开始。 */
export const nextPosition = (positions: readonly number[]): number =>
  positions.length ? Math.min(...positions) - 1 : 0;

/** 还没完成、时间说明写着 `Today` 的提醒（通知中心「今天」小组件的口径）。 */
export const dueToday = (reminder: Pick<ReminderFields, 'due' | 'done'>): boolean =>
  !reminder.done && (reminder.due === NEW_REMINDER_DUE || reminder.due.startsWith(`${NEW_REMINDER_DUE} `));

/** 勾选一行时写回库的字段：完成的变回未完成，未完成的变完成并染成强调蓝。 */
export const togglePatch = (reminder: Pick<ReminderFields, 'done'>): { done: boolean; tint?: string } =>
  reminder.done ? { done: false } : { done: true, tint: DONE_TINT };
