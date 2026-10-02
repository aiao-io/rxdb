/**
 * @fileoverview US-909 阶段 C：门面 `commits$` 的发出时机（`specs/005-us-909-session-replay/contracts/working-tree-commits.md`）。
 *
 * @remarks
 * 录制插件靠这条流给回放打 commit 标记。按时间戳反查 commit 充当关联是被明令禁止的形态，
 * 所以这条流必须**恰好**在「确实写进了一个新 commit」时发，且只发一次：
 *
 * 1. **幂等重放不发。** 同一个 `operationId` 再来一次，`commit()` 照样回 `ok: true`、带着同一个
 *    `commitId`。按返回值判断「成功了就发」的实现会在这里多发一条，回放上于是出现两个指向
 *    同一 commit 的标记，第二个落在一个什么都没发生的时刻。
 * 2. **`await commit()` 之后订阅者已经收到。** 晚一拍（`queueMicrotask` / `setTimeout` 再发）的话，
 *    调用方紧接着 `stop()` 录制，最后一次提交的标记就丢了。
 * 3. **订阅者抛错不污染 `commit()`。** 录制插件写标记失败是录制的事，不能让用户的提交看起来失败了。
 *    RxJS 7 的 `Subscriber` 本身就截住回调异常，门面要做的只是别在 `next()` 外面再套一层会吞错的逻辑。
 * 4. **未启用的库上能订阅、永远不发。** 流本身不经门禁：门禁是「调用即拒」，而订阅不是调用。
 */

import { config } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { CommitOptions } from '../../working-tree/commit-command.js';
import type { WorkingTreeCommitEvent } from '../../working-tree/working-tree-commit-event.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeManager } from '../../working-tree/working-tree-facade.js';
import {
  createWorkingTreeScene,
  refRowOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 一组对得上场景当前值的捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-commits',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 订阅门面的 `commits$`，把收到的值攒进数组。 */
const collect = (manager: WorkingTreeManager): WorkingTreeCommitEvent[] => {
  const seen: WorkingTreeCommitEvent[] = [];
  manager.commits$.subscribe(event => seen.push(event));
  return seen;
};

describe('commits$：写入新 commit 时发出（契约 §1）', () => {
  it('ok: true 且写了新 commit → 发一次 { commitId, branchId }', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const seen = collect(scene.manager);

    const result = await scene.manager.commit('一次提交', credentialsOf(scene));

    if (!result.ok) throw new Error('期望提交成功');
    expect(seen).toEqual([{ commitId: result.commitId, branchId: SCENE_BRANCH_ID }]);
  });

  it('连续两次提交按 resolve 顺序各发一次', async () => {
    const scene = createWorkingTreeScene();
    const seen = collect(scene.manager);

    scene.addEntry();
    const first = await scene.manager.commit('第一次', credentialsOf(scene, { operationId: 'op-1' }));
    scene.addEntry();
    const second = await scene.manager.commit('第二次', credentialsOf(scene, { operationId: 'op-2' }));

    if (!first.ok || !second.ok) throw new Error('期望两次提交都成功');
    expect(seen.map(event => event.commitId)).toEqual([first.commitId, second.commitId]);
  });

  it('多个订阅者各收到一次', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const a = collect(scene.manager);
    const b = collect(scene.manager);

    await scene.manager.commit('一次提交', credentialsOf(scene));

    expect([a.length, b.length]).toEqual([1, 1]);
  });
});

describe('commits$：没写新 commit 时不发（契约 §1）', () => {
  it('ok: false（HEAD 凭据过期）不发', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const seen = collect(scene.manager);

    const result = await scene.manager.commit('过期凭据', credentialsOf(scene, { expectedHeadRevision: 99 }));

    expect(result.ok).toBe(false);
    expect(seen).toEqual([]);
  });

  it('抛错（干净工作树的 empty_commit）不发', async () => {
    const scene = createWorkingTreeScene();
    const seen = collect(scene.manager);

    await expect(scene.manager.commit('什么都没改', credentialsOf(scene))).rejects.toThrow();

    expect(seen).toEqual([]);
  });

  it('同一 operationId 的幂等重放不发第二次', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const entries = [...scene.probe.rowsOf(WorkingTreeEntry)];
    const seen = collect(scene.manager);

    const first = await scene.manager.commit('第一次', credentialsOf(scene));
    // 同一批条目、同一个 operationId、凭据取当前值——`writeCommit` 认出重放，回 reused。
    scene.probe.seed(WorkingTreeEntry, entries);
    stateRowOf(scene).entryCount = entries.length;
    const replay = await scene.manager.commit('第一次', credentialsOf(scene));

    if (!first.ok || !replay.ok) throw new Error('期望两次调用都回 ok: true');
    expect(replay.commitId).toBe(first.commitId);
    expect(seen).toHaveLength(1);
  });
});

describe('commits$：时序与隔离（契约 §2、§3）', () => {
  it('发出时事务已提交：回调里 listCommits() 读得到这个 commitId', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const listed: Promise<readonly string[]>[] = [];
    scene.manager.commits$.subscribe(() => {
      listed.push(scene.manager.listCommits().then(page => page.entries.map(entry => entry.commitId)));
    });

    const result = await scene.manager.commit('一次提交', credentialsOf(scene));

    if (!result.ok) throw new Error('期望提交成功');
    expect(listed).toHaveLength(1);
    expect(await listed[0]).toContain(result.commitId);
  });

  it('订阅者抛错：commit() 照常返回，其他订阅者照常收到，错误走 RxJS 的未处理错误路径', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    const boom = new Error('订阅者炸了');
    const onUnhandledError = vi.fn();
    const previous = config.onUnhandledError;
    config.onUnhandledError = onUnhandledError;
    try {
      scene.manager.commits$.subscribe(() => {
        throw boom;
      });
      const seen = collect(scene.manager);

      const result = await scene.manager.commit('一次提交', credentialsOf(scene));

      expect(result.ok).toBe(true);
      expect(seen).toHaveLength(1);
      // RxJS 经 timeoutProvider 异步转交；等一拍宏任务。
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(onUnhandledError).toHaveBeenCalledWith(boom);
    } finally {
      config.onUnhandledError = previous;
    }
  });
});

describe('commits$：形态（契约 §4）', () => {
  it('是实例字段，不在原型上（门禁枚举原型成员，流不该被当成受管方法）', () => {
    const scene = createWorkingTreeScene();

    expect(Object.getOwnPropertyNames(WorkingTreeManager.prototype)).not.toContain('commits$');
    expect(Object.prototype.hasOwnProperty.call(scene.manager, 'commits$')).toBe(true);
  });

  it('只读：拿不到 next()', () => {
    const scene = createWorkingTreeScene();

    expect((scene.manager.commits$ as unknown as { next?: unknown }).next).toBeUndefined();
  });
});
