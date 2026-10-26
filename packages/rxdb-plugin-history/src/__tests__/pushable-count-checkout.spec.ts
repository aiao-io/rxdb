import { WorktreeTableSet } from '@aiao/rxdb';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { updatePushableCount, type UndoRedoApplyHost } from '../undo-redo-apply.js';

// 只有主检出位同步（US-314 B1.4b），挂在可写检出位上推送一进门就抛：照分支累计只会显示一个推不出去的数（B2.1）
describe('updatePushableCount：挂在可写检出位上', () => {
  it('发 0，不去查同步记录与变更日志', async () => {
    const readAdapter = vi.fn(() => of({}));
    const host = {
      pushableGeneration: 0,
      pushableCount$: new BehaviorSubject(7),
      rxdb: {
        connected$: of(true),
        worktreeTableSet: WorktreeTableSet.of('wt_push', []),
        get localAdapter$() {
          return readAdapter();
        }
      }
    } as unknown as UndoRedoApplyHost;

    await updatePushableCount(host);

    expect(host.pushableCount$.value).toBe(0);
    expect(readAdapter).not.toHaveBeenCalled();
  });
});
