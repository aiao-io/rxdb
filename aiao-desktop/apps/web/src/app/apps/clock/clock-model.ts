/** 世界时钟可添加的固定城市目录；时差沿用种子口径（与 Kolkata 的演示时差）。 */
export const WORLD_CLOCK_DIRECTORY = [
  { city: 'Cupertino', offsetHours: -12.5 },
  { city: 'Kolkata', offsetHours: 0 },
  { city: 'London', offsetHours: -4.5 },
  { city: 'Tokyo', offsetHours: 3.5 },
  { city: 'New York', offsetHours: -9.5 },
  { city: 'Paris', offsetHours: -3.5 },
  { city: 'Sydney', offsetHours: 4.5 },
  { city: 'Singapore', offsetHours: 2.5 }
] as const;

/** 新世界时钟城市排到末尾；空列表从 0 开始。 */
export const nextWorldClockPosition = (positions: readonly number[]): number =>
  positions.length ? Math.max(...positions) + 1 : 0;

/** 一座闹钟：几点几分，是否启用。 */
export interface Alarm {
  readonly id: string;
  readonly hour: number;
  readonly minute: number;
  readonly enabled: boolean;
}

/** `HH:MM`（或 `H:MM`）解析成闹钟时刻；越界或格式不符为 `null`。 */
export const parseAlarmTime = (value: string): { hour: number; minute: number } | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

/** 闹钟的显示时刻：`7:05 AM` 这种 12 小时写法。 */
export const alarmLabel = (time: { hour: number; minute: number }): string => {
  const hour = time.hour % 12 || 12;
  return `${hour}:${String(time.minute).padStart(2, '0')} ${time.hour < 12 ? 'AM' : 'PM'}`;
};

/** 某一分钟的键：同一分钟内只响一次。 */
export const minuteKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;

/** 这一秒该不该响：启用、时刻吻合、这一分钟还没响过。 */
export const shouldRing = (alarm: Alarm, now: Date, lastRung: string | undefined): boolean => {
  if (!alarm.enabled) return false;
  if (now.getHours() !== alarm.hour || now.getMinutes() !== alarm.minute) return false;
  return lastRung !== minuteKey(now);
};

/** 新增或覆盖一座闹钟：同 id 替换，不同 id 追加。 */
export const upsertAlarm = (alarms: readonly Alarm[], next: Alarm): readonly Alarm[] => {
  const index = alarms.findIndex(alarm => alarm.id === next.id);
  if (index < 0) return [...alarms, next];
  return alarms.map(alarm => (alarm.id === next.id ? next : alarm));
};

/** 移除一座闹钟。 */
export const removeAlarm = (alarms: readonly Alarm[], id: string): readonly Alarm[] =>
  alarms.filter(alarm => alarm.id !== id);

/** 偏好里存着的闹钟列表要逐项校验。 */
export const isAlarm = (value: unknown): value is Alarm => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const alarm = value as Record<string, unknown>;
  return (
    typeof alarm['id'] === 'string' &&
    typeof alarm['hour'] === 'number' &&
    Number.isInteger(alarm['hour']) &&
    alarm['hour'] >= 0 &&
    alarm['hour'] <= 23 &&
    typeof alarm['minute'] === 'number' &&
    Number.isInteger(alarm['minute']) &&
    alarm['minute'] >= 0 &&
    alarm['minute'] <= 59 &&
    typeof alarm['enabled'] === 'boolean'
  );
};

export const isAlarmList = (value: unknown): value is readonly Alarm[] =>
  Array.isArray(value) && value.every(isAlarm);

/** 秒表读数：累计值加上这段还没停的耗时。 */
export const stopwatchElapsed = (startedAt: number | null, accumulated: number, now: number): number =>
  accumulated + (startedAt === null ? 0 : Math.max(0, now - startedAt));

/** 秒表显示：`MM:SS.t`。 */
export const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
};

/** 计时器剩余时间；没在计时是 0。 */
export const timerRemaining = (endsAt: number | null, now: number): number =>
  endsAt === null ? 0 : Math.max(0, endsAt - now);

/** 计时器输入：`5`、`1:30` 这种分钟（:秒）写法，转成秒；非法或 0 为 `null`。 */
export const parseDurationSeconds = (value: string): number | null => {
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2] ?? 0);
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
};

/** 计时器显示：`M:SS`，倒计时最后一秒显示 0:01。 */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
