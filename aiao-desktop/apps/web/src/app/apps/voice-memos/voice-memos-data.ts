/** 一条初始语音备忘录的记录。`recorded` 是列表里写死的录制时间文字，`duration` 以秒计。 */
export interface MemoSeed {
  readonly title: string;
  readonly recorded: string;
  readonly duration: number;
}

/** 四条语音备忘录：现在没有真实的录音内容，只有标题、时间和时长。 */
export const MEMO_SEED_DATA: readonly MemoSeed[] = [
  { title: 'Standup notes', recorded: 'Today 4:02 PM', duration: 72 },
  { title: 'Dock easing idea', recorded: 'Today 11:40 AM', duration: 38 },
  { title: 'Call with Daniel', recorded: 'Yesterday', duration: 866 },
  { title: 'Guitar riff', recorded: 'Saturday', duration: 124 }
];
