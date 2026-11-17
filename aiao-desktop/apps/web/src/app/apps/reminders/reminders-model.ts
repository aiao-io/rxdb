/** 点圆圈勾选时统一染成强调蓝，与提醒原来的颜色无关。 */
export const DONE_TINT = '#0a84ff';

/** 「+」新建的提醒默认的时间说明。 */
export const NEW_REMINDER_DUE = 'Today';

/** 侧栏支持的提醒列表。 */
export const REMINDER_LISTS = [
  { id: 'today', name: 'Today', color: '#0a84ff' },
  { id: 'scheduled', name: 'Scheduled', color: '#ff375f' },
  { id: 'all', name: 'All', color: '#1d1d1f' },
  { id: 'flagged', name: 'Flagged', color: '#ff9f0a' },
  { id: 'completed', name: 'Completed', color: '#8e8e93' }
] as const;

export type ReminderList = (typeof REMINDER_LISTS)[number]['id'];

/** 库里一条提醒的字段（实体 `Reminder` 满足它，测试里用普通对象）。 */
export interface ReminderFields {
  readonly id: string;
  readonly title: string;
  /** 时间说明，原样显示（例如 `Today 5:00 PM`、`Tomorrow`、`Done`），不是可计算的日期。 */
  readonly due: string;
  readonly done: boolean;
  readonly flagged: boolean;
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
  readonly flagged: boolean;
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
  flagged: reminder.flagged,
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
  flagged: false,
  tint: DONE_TINT,
  fresh: true,
  editing: draft.editing
});

/** 新提醒的 `position`：比现有的都小，排到最前；列表为空时从 0 开始。 */
export const nextPosition = (positions: readonly number[]): number =>
  positions.length ? Math.min(...positions) - 1 : 0;

/** 时间说明写着 `Today` 的提醒；列表会保留今天已经完成的项目。 */
const hasTodayDue = (reminder: Pick<ReminderFields, 'due'>): boolean =>
  reminder.due === NEW_REMINDER_DUE || reminder.due.startsWith(`${NEW_REMINDER_DUE} `);

/** 还没完成、时间说明写着 `Today` 的提醒（通知中心「今天」小组件的口径）。 */
export const dueToday = (reminder: Pick<ReminderFields, 'due' | 'done'>): boolean =>
  !reminder.done && hasTodayDue(reminder);

/** 还没完成但不是今天的提醒。 */
export const scheduled = (reminder: Pick<ReminderFields, 'due' | 'done'>): boolean =>
  !reminder.done && !hasTodayDue(reminder);

/** 判断提醒属于哪个侧栏列表；Today 列表保留当天已完成项目，数量仍只算未完成。 */
export const reminderMatchesList = (
  reminder: Pick<ReminderFields, 'due' | 'done' | 'flagged'>,
  list: ReminderList
): boolean => {
  switch (list) {
    case 'today':
      return hasTodayDue(reminder);
    case 'scheduled':
      return scheduled(reminder);
    case 'all':
      return !reminder.done;
    case 'flagged':
      return reminder.flagged;
    case 'completed':
      return reminder.done;
  }
};

/** 计算侧栏列表数量，数量来自本地库而不是固定展示值。 */
export const reminderListCount = (
  reminders: readonly Pick<ReminderFields, 'due' | 'done' | 'flagged'>[],
  list: ReminderList
): number => (list === 'today' ? reminders.filter(dueToday).length : reminders.filter(reminder => reminderMatchesList(reminder, list)).length);

/** 勾选一行时写回库的字段：完成的变回未完成，未完成的变完成并染成强调蓝。 */
export const togglePatch = (reminder: Pick<ReminderFields, 'done'>): { done: boolean; tint?: string } =>
  reminder.done ? { done: false } : { done: true, tint: DONE_TINT };
