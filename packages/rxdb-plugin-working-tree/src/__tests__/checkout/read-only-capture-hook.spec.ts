/**
 * @fileoverview 只读捕获钩子（US-313）：挂载点 1 放行，其余写入口一律拒。
 *
 * @remarks
 * 真后端上「拒了之后快照库不变」由 `worktreeConformanceSuite` 在六个后端上验；这里钉死每个入口的判定。
 */

import type { WorkingTreeWriteHost } from '@aiao/rxdb';
import { RxDBReadOnlyError } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createReadOnlyCaptureHook } from '../../checkout/read-only-capture-hook.js';

const host = {} as WorkingTreeWriteHost;

describe('createReadOnlyCaptureHook', () => {
  it('事务原样放行：读也要开事务', async () => {
    const hook = createReadOnlyCaptureHook();
    const fun = vi.fn();
    const next = vi.fn(async () => 'result');

    await expect(hook.interceptTransaction(host, next, fun, false)).resolves.toBe('result');
    expect(next).toHaveBeenCalledWith(fun, false);
    expect(() => hook.bindMountTarget({} as never, {} as never)).not.toThrow();
  });

  it('批量合并与切分支拒绝，不调用原语', async () => {
    const hook = createReadOnlyCaptureHook();
    const next = vi.fn();

    await expect(
      hook.interceptMergeChanges(host, next, { deletes: new Map(), updates: new Map(), inserts: new Map() })
    ).rejects.toBeInstanceOf(RxDBReadOnlyError);
    await expect(hook.interceptSwitchBranch(host, next, {} as never)).rejects.toThrow(/switchBranch/);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['upsert_many', /upsertMany on Todo/],
    ['delete_by_ids', /deleteByIds on Todo/]
  ] as const)('批量写 %s 在返回 Observable 之前同步拒绝', (operation, message) => {
    const hook = createReadOnlyCaptureHook();
    const next = vi.fn(() => of(undefined));

    expect(() => hook.interceptBulkWrite(host, next, 'Todo', operation)).toThrow(message);
    expect(next).not.toHaveBeenCalled();
  });

  it('raw 写拒绝且不下发；读放行', async () => {
    const hook = createReadOnlyCaptureHook();
    const execute = vi.fn(async () => 'rows');

    await expect(hook.gateRawWrite('SELECT 1; DELETE FROM todo', execute)).rejects.toThrow(/rawQuery/);
    expect(execute).not.toHaveBeenCalled();
    await expect(hook.gateRawWrite('SELECT * FROM todo', execute)).resolves.toBe('rows');
  });

  // 引擎封印就是一条会话状态：放行它们，一句话就把第三层防线关掉（评审 P1-1）
  it.each([
    'PRAGMA query_only = 0',
    'pragma main.query_only(false)',
    '/* 注释 */ PRAGMA query_only = 0',
    'SELECT 1; PRAGMA query_only = 0',
    'SET SESSION default_transaction_read_only = off',
    'set transaction read write',
    'PRAGMA table_info(todo)'
  ])('会话设置 %s 拒绝且不下发', async sql => {
    const hook = createReadOnlyCaptureHook();
    const execute = vi.fn(async () => 'rows');

    await expect(hook.gateRawWrite(sql, execute)).rejects.toBeInstanceOf(RxDBReadOnlyError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('外部通知拒绝，一条事件都不派发', () => {
    const hook = createReadOnlyCaptureHook();
    const notify = vi.fn();

    expect(() => hook.gateExternalNotify('Todo', undefined, notify)).toThrow(/notifyExternalUpdate on Todo/);
    expect(notify).not.toHaveBeenCalled();
  });
});
