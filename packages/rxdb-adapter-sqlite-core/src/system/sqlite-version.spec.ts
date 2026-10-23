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

const DECLARING = ['Note'];

describe('SQLite 宿主版本门槛（AC#7）', () => {
  it('门槛常量是 3.47.0', () => {
    expect(SQLITE_MIN_HOST_VERSION).toBe('3.47.0');
  });

  it('低于门槛 fail-fast 并点名实际版本与门槛（3.46.0 / 3.47.0 前一个补丁 / 2.x）', () => {
    for (const bad of ['3.46.0', '3.46.9', '3.44.2', '2.99.99']) {
      expect(() => assertSqliteHostVersion(bad, DECLARING)).toThrow(
        new RegExp(`SQLite host version ${bad} is below the required minimum ${SQLITE_MIN_HOST_VERSION}`)
      );
      // 消息点名实际版本与门槛，不是常量错误消息
      expect(() => assertSqliteHostVersion(bad, DECLARING)).toThrow(/3\.47\.0/);
    }
  });

  it('达标版本放行（门槛本身与仓内各宿主版本）', () => {
    for (const ok of ['3.47.0', '3.48.0', '3.50.4', '3.53.0', '3.53.1', '3.53.4', '4.0.0']) {
      expect(() => assertSqliteHostVersion(ok, DECLARING)).not.toThrow();
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
    expect(() => assertSqliteHostVersion('garbage', DECLARING)).toThrow(/below the required minimum/);
    expect(() => assertSqliteHostVersion('', DECLARING)).toThrow(/below the required minimum/);
  });

  it('带前缀的版本形态（v3.53.0 / SQLite 3.53.0）同样能解出，不误判为 0.0.0', () => {
    expect(parseSqliteVersion('v3.53.0')).toEqual([3, 53, 0]);
    expect(parseSqliteVersion('SQLite 3.53.0')).toEqual([3, 53, 0]);
    expect(() => assertSqliteHostVersion('v3.46.0', DECLARING)).toThrow(/3\.47\.0/);
    expect(() => assertSqliteHostVersion('SQLite 3.53.0', DECLARING)).not.toThrow();
  });

  it('提高门槛时错误消息的理由文本由阈值派生，不自相矛盾', () => {
    expect(() => assertSqliteHostVersion('3.48.0', DECLARING, '3.49.0')).toThrow(/need SQLite 3\.49\.0\+/);
    expect(() => assertSqliteHostVersion('3.48.0', DECLARING, '3.49.0')).not.toThrow(/3\.47\.0/);
  });

  it('消息列出全部会触发门槛的声明种类并点名声明它们的实体：纯热字段应用不再被提示只删 checks', () => {
    const hotOnly = () => assertSqliteHostVersion('3.46.0', ['BomItem', 'BomLineOccurrence']);
    expect(hotOnly).toThrow(
      /declarative storage constraints \(checks, exclusions, conditional unique indexes, generated columns, advanced indexes\)/
    );
    expect(hotOnly).toThrow(/declared by: BomItem, BomLineOccurrence/);
    expect(hotOnly).toThrow(/entityStorage overrides/);
    expect(hotOnly).not.toThrow(/remove 'checks'/);
  });

  it('可注入自定义门槛（后续阶段提高门槛时复用同一判定）', () => {
    expect(() => assertSqliteHostVersion('3.48.0', DECLARING, '3.49.0')).toThrow(/below the required minimum 3\.49\.0/);
    expect(() => assertSqliteHostVersion('3.49.0', DECLARING, '3.49.0')).not.toThrow();
  });
});
