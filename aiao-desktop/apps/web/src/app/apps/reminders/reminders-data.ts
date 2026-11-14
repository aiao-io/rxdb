/** 一条初始提醒：标题、时间说明、是否已完成、完成后圆圈的颜色。 */
export interface ReminderSeed {
  readonly title: string;
  readonly due: string;
  readonly done: boolean;
  readonly tint: string;
}

/** 初始提醒，顺序即列表顺序。 */
export const SEED_REMINDERS: readonly ReminderSeed[] = [
  { title: 'Send design review feedback', due: 'Today 5:00 PM', done: false, tint: '#ff375f' },
  { title: 'Review PR #142 — column view sizing', due: 'Today 6:30 PM', done: false, tint: '#0a84ff' },
  { title: 'Pick up dry cleaning', due: 'Today', done: false, tint: '#ff9f0a' },
  { title: 'Book the car for Saturday', due: 'Tomorrow', done: false, tint: '#0a84ff' },
  { title: 'Reply to Anna about the tray blur', due: 'Tomorrow 9:00 AM', done: false, tint: '#30d158' },
  { title: 'Fix unfocused window shadows', due: 'Done', done: true, tint: '#8e8e93' },
  { title: 'Write the neofetch ASCII by hand', due: 'Done', done: true, tint: '#8e8e93' }
];
