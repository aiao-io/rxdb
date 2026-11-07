import type { PreferenceOption } from '../preferences/schema/index.js';

/** 时区地理分组。 */
export type TimezoneRegion = 'utc' | 'americas' | 'europe' | 'africa-mideast' | 'asia' | 'oceania';

/** 分组的展示顺序。 */
export const TIMEZONE_REGIONS: readonly TimezoneRegion[] = [
  'utc',
  'americas',
  'europe',
  'africa-mideast',
  'asia',
  'oceania'
];

/** 常用时区，按地理分组、组内偏移升序。 */
export const TIMEZONE_ZONES: ReadonlyArray<{ readonly zone: string; readonly region: TimezoneRegion }> = [
  { zone: 'UTC', region: 'utc' },
  { zone: 'Pacific/Honolulu', region: 'americas' },
  { zone: 'America/Anchorage', region: 'americas' },
  { zone: 'America/Los_Angeles', region: 'americas' },
  { zone: 'America/Denver', region: 'americas' },
  { zone: 'America/Chicago', region: 'americas' },
  { zone: 'America/New_York', region: 'americas' },
  { zone: 'America/Toronto', region: 'americas' },
  { zone: 'America/Sao_Paulo', region: 'americas' },
  { zone: 'America/Argentina/Buenos_Aires', region: 'americas' },
  { zone: 'Europe/London', region: 'europe' },
  { zone: 'Europe/Paris', region: 'europe' },
  { zone: 'Europe/Berlin', region: 'europe' },
  { zone: 'Europe/Madrid', region: 'europe' },
  { zone: 'Europe/Moscow', region: 'europe' },
  { zone: 'Africa/Cairo', region: 'africa-mideast' },
  { zone: 'Asia/Dubai', region: 'africa-mideast' },
  { zone: 'Asia/Karachi', region: 'asia' },
  { zone: 'Asia/Kolkata', region: 'asia' },
  { zone: 'Asia/Dhaka', region: 'asia' },
  { zone: 'Asia/Bangkok', region: 'asia' },
  { zone: 'Asia/Singapore', region: 'asia' },
  { zone: 'Asia/Shanghai', region: 'asia' },
  { zone: 'Asia/Hong_Kong', region: 'asia' },
  { zone: 'Asia/Tokyo', region: 'asia' },
  { zone: 'Asia/Seoul', region: 'asia' },
  { zone: 'Australia/Perth', region: 'oceania' },
  { zone: 'Australia/Sydney', region: 'oceania' },
  { zone: 'Pacific/Auckland', region: 'oceania' }
];

/** 时区列表条目。 */
export interface TimezoneEntry {
  /** IANA 名。 */
  readonly zone: string;
  /** 地理分组。 */
  readonly region: TimezoneRegion;
  /** 城市名（取自 IANA 名）。 */
  readonly city: string;
  /** 当前时刻的 UTC 偏移，如 `GMT+8`。 */
  readonly offset: string;
}

/**
 * 浏览器所在时区。
 * @returns IANA 名。
 */
export function systemTimezone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * 解析时区偏好：空串表示浏览器时区。
 * @param preference - 偏好值。
 * @returns IANA 名。
 */
export function resolveTimezone(preference: string): string {
  return preference === '' ? systemTimezone() : preference;
}

/**
 * 城市名：取 IANA 名最后一段，下划线换空格。
 * @param zone - IANA 名。
 * @returns 城市名。
 */
export function cityOf(zone: string): string {
  return (zone.split('/').at(-1) ?? zone).replace(/_/g, ' ');
}

/**
 * 给定时刻、给定时区相对 UTC 的偏移（含夏令时）。
 * @param zone - IANA 名。
 * @param date - 时刻。
 * @returns 形如 `GMT+8`、`GMT+5:30`、`GMT`；不同 ICU 版本对零偏移的写法不一致（`GMT` / `GMT+0`），统一为 `GMT`。
 */
export function offsetOf(zone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(date);
  const value = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  return value.replace(/^GMT[+-]0$/, 'GMT');
}

/**
 * 给定时区下该时刻的本地时间。
 * @param zone - IANA 名。
 * @param date - 时刻。
 * @returns 24 小时制 `HH:mm`。
 */
export function timeInZone(zone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

/**
 * 按时区格式化日期。
 * @param date - 时刻。
 * @param zone - IANA 名。
 * @param options - `Intl.DateTimeFormat` 选项。
 * @param locale - 语言，缺省使用浏览器语言。
 * @returns 格式化文本。
 */
export function formatInTimezone(
  date: Date,
  zone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale?: string
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date);
}

/**
 * 为每个常用时区计算当前偏移。
 * @param now - 时刻。
 * @returns 时区条目。
 */
export function buildTimezoneEntries(now: Date): TimezoneEntry[] {
  return TIMEZONE_ZONES.map(({ zone, region }) => ({ zone, region, city: cityOf(zone), offset: offsetOf(zone, now) }));
}

/**
 * 偏好抽屉里「时区」下拉的选项：第一项跟随浏览器，其后是常用时区；当前值不在常用列表（如导入的配置）时补一项。
 * @param current - 当前偏好值。
 * @param now - 时刻。
 * @returns 选项。
 */
export function timezoneOptions(current: string, now: Date): PreferenceOption[] {
  const entries = buildTimezoneEntries(now).map(entry => ({
    value: entry.zone,
    label: `${entry.city} · ${entry.offset}`
  }));
  const extra =
    current === '' || entries.some(entry => entry.value === current) ?
      []
    : [{ value: current, label: `${cityOf(current)} · ${offsetOf(current, now)}` }];
  return [{ value: '', labelKey: 'prefs.option.app.timezone.system' }, ...extra, ...entries];
}
