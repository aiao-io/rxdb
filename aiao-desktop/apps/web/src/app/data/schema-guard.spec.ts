import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DesktopSchemaStaleError, SchemaGuard } from './schema-guard';
import type { SchemaInspector } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION } from './schema-version';

const inspectorWith = (readRecord: SchemaInspector['readRecord']): SchemaInspector => ({
  tableName: () => 'unused',
  tableExists: async () => true,
  columns: async () => [],
  readRecord
});

const written = (version: number) => ({ version, build: '', upgradedAt: 1 });

describe('SchemaGuard：旧版本标签页写库前的检查', () => {
  it('启用之前（启动期的建表与升级）不检查，也不读库', async () => {
    const readRecord = vi.fn(async () => written(DESKTOP_SCHEMA_VERSION + 5));
    const guard = new SchemaGuard();
    await expect(guard.assertWritable()).resolves.toBeUndefined();
    expect(readRecord).not.toHaveBeenCalled();
  });

  it('库的版本等于或低于本构建：放行，每次写之前都重新读', async () => {
    const readRecord = vi.fn(async () => written(DESKTOP_SCHEMA_VERSION));
    const guard = new SchemaGuard();
    guard.enable(inspectorWith(readRecord));
    await guard.assertWritable();
    await guard.assertWritable();
    expect(readRecord).toHaveBeenCalledTimes(2);
    readRecord.mockResolvedValue(written(DESKTOP_SCHEMA_VERSION - 1));
    await expect(guard.assertWritable()).resolves.toBeUndefined();
  });

  it('另一个标签页把库升到更高的版本：拒绝写入并通知界面，之后不再读库也一直拒绝', async () => {
    const readRecord = vi.fn(async () => written(DESKTOP_SCHEMA_VERSION));
    const guard = new SchemaGuard();
    guard.enable(inspectorWith(readRecord));
    await guard.assertWritable();
    readRecord.mockResolvedValue(written(DESKTOP_SCHEMA_VERSION + 1));
    await expect(guard.assertWritable()).rejects.toMatchObject({
      name: 'DesktopSchemaStaleError',
      found: DESKTOP_SCHEMA_VERSION + 1,
      current: DESKTOP_SCHEMA_VERSION
    });
    expect(await firstValueFrom(guard.stale$)).toBe(DESKTOP_SCHEMA_VERSION + 1);
    readRecord.mockClear();
    await expect(guard.assertWritable()).rejects.toBeInstanceOf(DesktopSchemaStaleError);
    expect(readRecord).not.toHaveBeenCalled();
  });

  it('读不到版本记录或记录无法解析时不拦截：那是启动期判定的事', async () => {
    const guard = new SchemaGuard();
    guard.enable(inspectorWith(async () => undefined));
    await expect(guard.assertWritable()).resolves.toBeUndefined();
    guard.enable(inspectorWith(async () => 'not json'));
    await expect(guard.assertWritable()).resolves.toBeUndefined();
  });

  it('没有升级时 stale$ 的初值是 null', async () => {
    expect(await firstValueFrom(new SchemaGuard().stale$)).toBeNull();
  });

  it('错误消息说清楚版本并提示刷新', () => {
    const error = new DesktopSchemaStaleError(9, 7);
    expect(error.message).toContain('9');
    expect(error.message).toContain('7');
    expect(error.message).toContain('刷新');
  });
});
