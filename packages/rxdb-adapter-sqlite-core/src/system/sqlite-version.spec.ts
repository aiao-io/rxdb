/**
 * @fileoverview SQLite 宿主版本门槛的单元测试（US-030 AC#7）。
 *
 * 判定是纯函数、版本号可注入：覆盖门槛两侧分支、畸形版本、门槛常量本身。
 */

import { describe, expect, it } from 'vitest';
import {
  assertSqliteHostVersion,
  compareSqliteVersion,
  parseSqliteVersion,
  SQLITE_MIN_HOST_VERSION
} from '../system/sqlite-version.js';

describe('SQLite 宿主版本门槛（AC#7）', () => {
  it('门槛常量是 3.47.0', () => {
    expect(SQLITE_MIN_HOST_VERSION).toBe('3.47.0');
  });

  it('低于门槛 fail-fast 并点名实际版本与门槛（3.46.0 / 3.47.0 前一个补丁 / 2.x）', () => {
    for (const bad of ['3.46.0', '3.46.9', '3.44.2', '2.99.99']) {
      expect(() => assertSqliteHostVersion(bad)).toThrow(
        new RegExp(`SQLite host version ${bad} is below the required minimum ${SQLITE_MIN_HOST_VERSION}`)
      );
      // 消息点名实际版本与门槛，不是常量错误消息
      expect(() => assertSqliteHostVersion(bad)).toThrow(/3\.47\.0/);
    }
  });

  it('达标版本放行（门槛本身与仓内各宿主版本）', () => {
    for (const ok of ['3.47.0', '3.48.0', '3.50.4', '3.53.0', '3.53.1', '3.53.4', '4.0.0']) {
      expect(() => assertSqliteHostVersion(ok)).not.toThrow();
    }
  });

  it('版本比较按 主.次.补丁 逐段比较', () => {
    expect(compareSqliteVersion('3.47.0', '3.47.0')).toBe(0);
    expect(compareSqliteVersion('3.46.9', '3.47.0')).toBeLessThan(0);
    expect(compareSqliteVersion('3.47.1', '3.47.0')).toBeGreaterThan(0);
    expect(compareSqliteVersion('3.9.99', '3.10.0')).toBeLessThan(0);
  });

  it('畸形版本按不达标处理，不静默放行', () => {
    expect(parseSqliteVersion('garbage')).toBeNull();
    expect(() => assertSqliteHostVersion('garbage')).toThrow(/below the required minimum/);
    expect(() => assertSqliteHostVersion('')).toThrow(/below the required minimum/);
  });

  it('可注入自定义门槛（后续阶段提高门槛时复用同一判定）', () => {
    expect(() => assertSqliteHostVersion('3.48.0', '3.49.0')).toThrow(/below the required minimum 3\.49\.0/);
    expect(() => assertSqliteHostVersion('3.49.0', '3.49.0')).not.toThrow();
  });
});
