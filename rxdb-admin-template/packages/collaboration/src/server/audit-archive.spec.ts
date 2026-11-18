import { describe, expect, it } from 'vitest';
import { archiveAudit, auditArchivePolicy, defaultArchiveBatch, type AuditArchiveDatabase } from './audit-archive.js';

/** 记下每次调用的参数，按顺序返回给定的移动行数：模拟数据库里的归档函数。 */
function recordingDatabase(results: readonly number[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const database: AuditArchiveDatabase = {
    async query(sql, params) {
      calls.push({ sql, params });
      const moved = results[calls.length - 1];
      if (moved === undefined) throw new Error('called more often than expected');
      return { rows: [{ moved }] };
    }
  };
  return { database, calls };
}

describe('审计归档策略的解析（ADMIN-US-217 AC#6）', () => {
  it('按天数、按条数或两者同时归档；批量默认 5000 行', () => {
    expect(defaultArchiveBatch).toBe(5000);
    expect(auditArchivePolicy({ ADMIN_AUDIT_ARCHIVE_AFTER_DAYS: '90' })).toEqual({
      afterDays: 90,
      keepLatest: null,
      batch: 5000
    });
    // 每个工作区热表一条不留也是合法的策略：全部事件只在归档里，读取照常经投影读到
    expect(auditArchivePolicy({ ADMIN_AUDIT_KEEP_LATEST: '0' })).toEqual({
      afterDays: null,
      keepLatest: 0,
      batch: defaultArchiveBatch
    });
    expect(
      auditArchivePolicy({
        ADMIN_AUDIT_ARCHIVE_AFTER_DAYS: '30',
        ADMIN_AUDIT_KEEP_LATEST: '10000',
        ADMIN_AUDIT_ARCHIVE_BATCH: '200'
      })
    ).toEqual({ afterDays: 30, keepLatest: 10000, batch: 200 });
  });

  it('两项都没给（或为空串）时拒绝：不按默认值替运维选策略', () => {
    for (const env of [
      {},
      { ADMIN_AUDIT_ARCHIVE_AFTER_DAYS: '', ADMIN_AUDIT_KEEP_LATEST: '' },
      { ADMIN_AUDIT_ARCHIVE_BATCH: '10' }
    ])
      expect(() => auditArchivePolicy(env), JSON.stringify(env)).toThrow(
        expect.objectContaining({
          code: 'configuration',
          message: '审计归档策略至少要按天数或按条数之一',
          details: { variables: ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', 'ADMIN_AUDIT_KEEP_LATEST'] }
        })
      );
  });

  it('取值不是规定范围内的十进制整数时拒绝，并指出是哪个变量', () => {
    const invalid: [name: string, value: string][] = [
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '0'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '-1'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '1.5'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '30d'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', ' 30'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '1e3'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '030'],
      ['ADMIN_AUDIT_ARCHIVE_AFTER_DAYS', '100000'],
      ['ADMIN_AUDIT_KEEP_LATEST', '-1'],
      ['ADMIN_AUDIT_KEEP_LATEST', '2.5'],
      ['ADMIN_AUDIT_KEEP_LATEST', '0x10'],
      ['ADMIN_AUDIT_KEEP_LATEST', '1000000000'],
      ['ADMIN_AUDIT_ARCHIVE_BATCH', '0'],
      ['ADMIN_AUDIT_ARCHIVE_BATCH', 'all'],
      ['ADMIN_AUDIT_ARCHIVE_BATCH', '1000001']
    ];
    for (const [name, value] of invalid) {
      const env = { ADMIN_AUDIT_ARCHIVE_AFTER_DAYS: '30', ADMIN_AUDIT_KEEP_LATEST: '100', [name]: value };
      expect(() => auditArchivePolicy(env), `${name}=${value}`).toThrow(
        expect.objectContaining({
          code: 'configuration',
          message: '审计归档策略的取值不合法',
          details: { variables: [name] }
        })
      );
    }
  });
});

describe('审计归档的执行', () => {
  it('按批调用归档函数直到一批不满，返回移动的总数', async () => {
    const { database, calls } = recordingDatabase([3, 3, 1]);
    await expect(archiveAudit(database, { afterDays: 30, keepLatest: null, batch: 3 })).resolves.toBe(7);
    expect(calls.map(call => call.params)).toEqual([
      ['30 days', null, 3],
      ['30 days', null, 3],
      ['30 days', null, 3]
    ]);
    expect(calls[0].sql).toContain('admin_private.archive_audit(');
  });

  it('第一批就不满（含一行都没有）时只调用一次；只按条数时天数传 NULL', async () => {
    const nothing = recordingDatabase([0]);
    await expect(archiveAudit(nothing.database, { afterDays: null, keepLatest: 0, batch: 500 })).resolves.toBe(0);
    expect(nothing.calls.map(call => call.params)).toEqual([[null, 0, 500]]);
    const both = recordingDatabase([42]);
    await expect(archiveAudit(both.database, { afterDays: 7, keepLatest: 1000, batch: 5000 })).resolves.toBe(42);
    expect(both.calls.map(call => call.params)).toEqual([['7 days', 1000, 5000]]);
  });

  it('数据库没有返回移动的行数时报错，不当成「已归档完」', async () => {
    const database: AuditArchiveDatabase = { query: async () => ({ rows: [] }) };
    await expect(archiveAudit(database, { afterDays: 1, keepLatest: null, batch: 10 })).rejects.toThrow(
      /archive_audit/
    );
  });
});
