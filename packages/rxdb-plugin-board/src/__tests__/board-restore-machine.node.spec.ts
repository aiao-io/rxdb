import { describe, expect, it } from 'vitest';

import {
  clearPendingSwitch,
  clearRestoringMarker,
  nextRestoreDbName,
  readActiveDbName,
  readPendingSwitch,
  readRestoringMarker,
  writeActiveDbName,
  writePendingSwitch,
  writeRestoringMarker,
  type BoardStorage
} from '../board-storage.js';
import { initialRestoreSnapshot, restoreStateMachine, type RestoreSnapshot } from '../restore-machine.js';

/** 内存存储：代替浏览器 localStorage，纯函数语义可复验。 */
const memoryStorage = (): BoardStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: key => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: key => void data.delete(key)
  };
};

/**
 * 恢复编排状态机（US-537 AC#10）：同一组输入驱动启动恢复、已有库恢复、
 * 损坏归档、取消与读回失败，产出相同的状态序列与失败去向。
 */
describe('restoreStateMachine（US-537 AC#10）', () => {
  const drive = (inputs: Parameters<typeof restoreStateMachine>[1][], from: RestoreSnapshot = initialRestoreSnapshot) =>
    inputs.reduce((snapshot, input) => restoreStateMachine(snapshot, input), from);

  it('启动恢复全流程：选择 → 恢复 → 切换 → 读回成功 → 已恢复', () => {
    const end = drive([
      { kind: 'choose_restore' },
      { kind: 'archive_selected' },
      { kind: 'restore_succeeded' },
      { kind: 'readback_succeeded' }
    ]);
    expect(end.state).toBe('restored');
    expect(end.pendingSwitch).toBe(false);
    expect(end.restoringMarker).toBe(false);
    expect(end.failure).toBeNull();
  });

  it('恢复中标记覆盖写入期：archive_selected 之后到 restore_succeeded 之前 marker 为真', () => {
    const restoring = drive([{ kind: 'choose_restore' }, { kind: 'archive_selected' }]);
    expect(restoring.state).toBe('restoring');
    expect(restoring.restoringMarker).toBe(true);

    const switching = restoreStateMachine(restoring, { kind: 'restore_succeeded' });
    expect(switching.restoringMarker).toBe(false);
    expect(switching.pendingSwitch).toBe(true);
  });

  it('已有库恢复：取消不启动恢复，回到启动选择', () => {
    const cancelled = drive([{ kind: 'choose_restore' }, { kind: 'cancel' }]);
    expect(cancelled).toEqual(initialRestoreSnapshot);

    // 恢复中取消：清理标记与目标
    const midCancel = drive([{ kind: 'choose_restore' }, { kind: 'archive_selected' }, { kind: 'cancel' }]);
    expect(midCancel).toEqual(initialRestoreSnapshot);
  });

  it('损坏 / 不兼容归档：失败去向可判别，未完成目标不作为活动位置', () => {
    const end = drive([{ kind: 'choose_restore' }, { kind: 'archive_invalid', reason: 'incompatible_archive' }]);
    expect(end.state).toBe('failed');
    expect(end.failure).toEqual({ kind: 'archive_invalid', reason: 'incompatible_archive' });
    expect(end.pendingSwitch).toBe(false);
  });

  it('恢复失败与读回失败：清理标记，保留失败去向', () => {
    const restoreFailed = drive([
      { kind: 'choose_restore' },
      { kind: 'archive_selected' },
      { kind: 'restore_failed', reason: 'target_not_empty' }
    ]);
    expect(restoreFailed.state).toBe('failed');
    expect(restoreFailed.restoringMarker).toBe(false);
    expect(restoreFailed.failure?.reason).toBe('target_not_empty');

    const readbackFailed = drive([
      { kind: 'choose_restore' },
      { kind: 'archive_selected' },
      { kind: 'restore_succeeded' },
      { kind: 'readback_failed', reason: 'io_error' }
    ]);
    expect(readbackFailed.state).toBe('failed');
    expect(readbackFailed.pendingSwitch).toBe(false);
  });

  it('恢复中 / 切换中拒绝重复进入与非法输入', () => {
    const restoring = drive([{ kind: 'choose_restore' }, { kind: 'archive_selected' }]);
    expect(restoreStateMachine(restoring, { kind: 'choose_restore' })).toBe(restoring);
    expect(restoreStateMachine(restoring, { kind: 'readback_succeeded' })).toBe(restoring);
    expect(restoreStateMachine(initialRestoreSnapshot, { kind: 'restore_succeeded' })).toBe(initialRestoreSnapshot);
  });

  it('活动位置与标记的持久化键：写读清对称', () => {
    const storage = memoryStorage();
    expect(readActiveDbName(storage)).toBeNull();
    expect(readRestoringMarker(storage)).toBe(false);

    writeActiveDbName(storage, 'rxdb-board-0');
    expect(readActiveDbName(storage)).toBe('rxdb-board-0');

    writeRestoringMarker(storage);
    expect(readRestoringMarker(storage)).toBe(true);
    clearRestoringMarker(storage);
    expect(readRestoringMarker(storage)).toBe(false);

    writePendingSwitch(storage, 'rxdb-board-restore-0');
    expect(readPendingSwitch(storage)).toBe('rxdb-board-restore-0');
    clearPendingSwitch(storage);
    expect(readPendingSwitch(storage)).toBeNull();
  });

  it('新库名不与活动位置冲突', () => {
    expect(nextRestoreDbName(null)).toBe('rxdb-board-restore-0');
    expect(nextRestoreDbName('rxdb-board-restore-0')).toBe('rxdb-board-restore-1');
    expect(nextRestoreDbName(null, ['rxdb-board-restore-0', 'rxdb-board-restore-1'])).toBe('rxdb-board-restore-2');
  });
});
