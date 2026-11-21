import type { Member } from '../model.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 界面上的短标识（完整取值放在悬停提示里）：UUID 取末 8 位——提交 ID 是 UUIDv7，前段是时间戳，
 * 同一分钟内生成的提交前 8 位相同，末段是随机段才分得开；其他超过 12 个字符的标识截断。
 */
export function shortId(id: string): string {
  if (uuid.test(id)) return id.slice(-8);
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

/** 当前界面语言：宿主应用随外壳语言同步 `<html lang>`，没有时交给浏览器默认。 */
function locale(): string | undefined {
  return document.documentElement.lang || undefined;
}

/** 时刻的完整写法（日期 + 时间），按界面语言格式化。 */
export function dateTime(at: number | string): string {
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000]
];

/** 时刻的相对写法（「3 分钟前」）：一周以内用相对时间，更早的用完整写法；按界面语言格式化。 */
export function relativeTime(at: number | string, now = Date.now()): string {
  const elapsed = new Date(at).getTime() - now;
  if (Math.abs(elapsed) >= 7 * 86_400_000) return dateTime(at);
  const format = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const [unit, size] = units.find(([, limit]) => Math.abs(elapsed) >= limit) ?? ['second', 1000];
  return format.format(Math.round(elapsed / size), unit);
}

/** 时间元素：显示相对时间，悬停与 `datetime` 属性给出完整时刻。 */
export function timeElement(at: number | string): HTMLTimeElement {
  const node = document.createElement('time');
  const date = new Date(at);
  node.dateTime = date.toISOString();
  node.textContent = relativeTime(at);
  node.title = dateTime(at);
  return node;
}

/**
 * 成员在界面上的名字：成员列表里的邮箱；不在列表里（已被移除、或离线时没有团队页）时回落到 `fallback` 里的身份，
 * 再不然显示短标识。
 */
export function personName(
  members: readonly Pick<Member, 'id' | 'email'>[],
  userId: string | null | undefined,
  fallback?: { id: string; email: string } | null
): string {
  if (!userId) return '';
  const member = members.find(item => item.id === userId);
  if (member) return member.email;
  return fallback?.id === userId ? fallback.email : shortId(userId);
}
