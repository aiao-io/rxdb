import { describe, expect, it } from 'vitest';

import {
  Alarm,
  WORLD_CLOCK_DIRECTORY,
  alarmLabel,
  formatDuration,
  formatElapsed,
  isAlarmList,
  minuteKey,
  nextWorldClockPosition,
  parseAlarmTime,
  parseDurationSeconds,
  removeAlarm,
  shouldRing,
  stopwatchElapsed,
  timerRemaining,
  upsertAlarm
} from './clock-model';

describe('WORLD_CLOCK_DIRECTORY / nextWorldClockPosition', () => {
  it('目录里没有重复城市，时差是有限数字', () => {
    const names = WORLD_CLOCK_DIRECTORY.map(entry => entry.city);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of WORLD_CLOCK_DIRECTORY) expect(Number.isFinite(entry.offsetHours)).toBe(true);
  });

  it('新城市排到末尾，空列表从 0 开始', () => {
    expect(nextWorldClockPosition([0, 1, 2])).toBe(3);
    expect(nextWorldClockPosition([])).toBe(0);
  });
});

describe('parseAlarmTime / alarmLabel', () => {
  it('HH:MM 与 H:MM 都解析', () => {
    expect(parseAlarmTime('7:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseAlarmTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('越界与格式不符返回 null', () => {
    expect(parseAlarmTime('24:00')).toBeNull();
    expect(parseAlarmTime('12:60')).toBeNull();
    expect(parseAlarmTime('7')).toBeNull();
    expect(parseAlarmTime('7:05 PM')).toBeNull();
  });

  it('显示成 12 小时写法', () => {
    expect(alarmLabel({ hour: 7, minute: 5 })).toBe('7:05 AM');
    expect(alarmLabel({ hour: 0, minute: 30 })).toBe('12:30 AM');
    expect(alarmLabel({ hour: 23, minute: 5 })).toBe('11:05 PM');
  });
});

describe('shouldRing', () => {
  const alarm: Alarm = { id: 'a', hour: 7, minute: 30, enabled: true };

  it('启用、时刻吻合、这一分钟还没响过才响', () => {
    const now = new Date(2026, 10, 24, 7, 30, 10);
    expect(shouldRing(alarm, now, undefined)).toBe(true);
    expect(shouldRing(alarm, now, minuteKey(now))).toBe(false);
    expect(shouldRing(alarm, now, minuteKey(new Date(2026, 10, 23, 7, 30)))).toBe(true);
  });

  it('停用或时刻不符不响', () => {
    const now = new Date(2026, 10, 24, 7, 31, 0);
    expect(shouldRing({ ...alarm, enabled: false }, now, undefined)).toBe(false);
    expect(shouldRing(alarm, now, undefined)).toBe(false);
  });
});

describe('upsertAlarm / removeAlarm / isAlarmList', () => {
  const alarms: Alarm[] = [
    { id: 'a', hour: 7, minute: 30, enabled: true },
    { id: 'b', hour: 8, minute: 0, enabled: false }
  ];

  it('同 id 替换，新 id 追加', () => {
    expect(upsertAlarm(alarms, { id: 'a', hour: 7, minute: 45, enabled: true })).toEqual([
      { id: 'a', hour: 7, minute: 45, enabled: true },
      { id: 'b', hour: 8, minute: 0, enabled: false }
    ]);
    expect(upsertAlarm(alarms, { id: 'c', hour: 9, minute: 0, enabled: true }).map(alarm => alarm.id)).toEqual([
      'a',
      'b',
      'c'
    ]);
  });

  it('移除一座闹钟，偏好校验逐项通过', () => {
    expect(removeAlarm(alarms, 'a').map(alarm => alarm.id)).toEqual(['b']);
    expect(isAlarmList(alarms)).toBe(true);
    expect(isAlarmList([{ id: 'x', hour: 99, minute: 0, enabled: true }])).toBe(false);
    expect(isAlarmList('no')).toBe(false);
  });
});

describe('stopwatchElapsed / formatElapsed', () => {
  it('运行中累计这段耗时，停止时只有累计值', () => {
    expect(stopwatchElapsed(1000, 500, 4000)).toBe(3500);
    expect(stopwatchElapsed(null, 500, 4000)).toBe(500);
  });

  it('显示成 MM:SS.t', () => {
    expect(formatElapsed(65_400)).toBe('01:05.4');
    expect(formatElapsed(0)).toBe('00:00.0');
  });
});

describe('timerRemaining / parseDurationSeconds / formatDuration', () => {
  it('剩余时间不回负，没在计时是 0', () => {
    expect(timerRemaining(5000, 4000)).toBe(1000);
    expect(timerRemaining(5000, 9000)).toBe(0);
    expect(timerRemaining(null, 4000)).toBe(0);
  });

  it('分钟（:秒）写法转成秒，非法或 0 为 null', () => {
    expect(parseDurationSeconds('5')).toBe(300);
    expect(parseDurationSeconds('1:30')).toBe(90);
    expect(parseDurationSeconds('0:45')).toBe(45);
    expect(parseDurationSeconds('0')).toBeNull();
    expect(parseDurationSeconds('1:60')).toBeNull();
    expect(parseDurationSeconds('abc')).toBeNull();
  });

  it('显示成 M:SS，最后一秒取整向上', () => {
    expect(formatDuration(90_000)).toBe('1:30');
    expect(formatDuration(100)).toBe('0:01');
    expect(formatDuration(0)).toBe('0:00');
  });
});
