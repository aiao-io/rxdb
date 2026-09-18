import { describe, expect, it } from 'vitest';
import { gdAvatarColor, gdAvatarInitial, gdEntryPath, gdRelativeTime } from './working-tree.gd';

/**
 * @fileoverview `working-tree.gd` 的纯函数单测。
 *
 * @remarks
 * 头像取色是确定性的（同一作者名三处列表稳定同色），相对时间是 GitHub Desktop
 * 的 TimeAgo 口径（just now / N minutes ago / … / on Sep 15）。这里锁边界值。
 */

describe('gdAvatarColor', () => {
  it('确定性：同一名字永远同一颜色，且落在八色盘内', () => {
    const first = gdAvatarColor('demo-author');
    const second = gdAvatarColor('demo-author');
    expect(first).toBe(second);
    expect(first).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('不同名字大概率不同色（八色盘至少覆盖两个名字）', () => {
    expect(gdAvatarColor('alice')).not.toBe(gdAvatarColor('bob'));
  });
});

describe('gdAvatarInitial', () => {
  it('取首字符大写；空名兜底成 ?', () => {
    expect(gdAvatarInitial('demo-author')).toBe('D');
    expect(gdAvatarInitial('  demo')).toBe('D');
    expect(gdAvatarInitial('')).toBe('?');
  });
});

describe('gdEntryPath', () => {
  it('schema/实体/实体id，不带 entities 前缀', () => {
    expect(gdEntryPath({ namespace: 'demo', entity: 'Menu', entityId: 'u-1' })).toBe('demo/Menu/u-1');
  });

  it('优先使用 tableName（Todo → todos），查不到回退实体名', () => {
    expect(gdEntryPath({ namespace: 'public', entity: 'Todo', entityId: 'u-1' })).toBe('public/todos/u-1');
  });
});

describe('gdRelativeTime', () => {
  const NOW = new Date('2026-09-19T12:00:00');

  const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000);

  it('一分钟内是 just now', () => {
    expect(gdRelativeTime(at(0), NOW)).toBe('just now');
    expect(gdRelativeTime(at(59), NOW)).toBe('just now');
  });

  it('一小时内按分钟', () => {
    expect(gdRelativeTime(at(60), NOW)).toBe('1 minute ago');
    expect(gdRelativeTime(at(5 * 60 + 30), NOW)).toBe('5 minutes ago');
  });

  it('一天内按小时', () => {
    expect(gdRelativeTime(at(3600), NOW)).toBe('1 hour ago');
    expect(gdRelativeTime(at(3 * 3600), NOW)).toBe('3 hours ago');
  });

  it('昨天与更早的日期', () => {
    expect(gdRelativeTime(at(24 * 3600), NOW)).toBe('yesterday');
    expect(gdRelativeTime(at(48 * 3600), NOW)).toBe('2 days ago');
    // 一周以前回到绝对日期（toLocaleDateString 依赖本机时区，只锁前缀与年月格式）
    expect(gdRelativeTime(new Date('2026-09-01T08:00:00'), NOW)).toMatch(/^on [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('未来的时间钳到 just now（时钟偏斜）', () => {
    expect(gdRelativeTime(new Date(NOW.getTime() + 5000), NOW)).toBe('just now');
  });
});
