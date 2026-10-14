/**
 * @fileoverview `rxdb_worktree` 的增删报到实体事件总线上（实时列表的事件源）。
 *
 * @remarks
 * 这张表不在任何适配器的变更钩子监听范围里，写下去不会有任何人知道，所以由写它的四处自己报：
 * `createWorktree()`、`removeWorktree()`、删分支连带删行、首次启用时补钉主 worktree（后者见
 * `worktree-enable-main.spec.ts`）。被拒的命令一行没写，也就一条都不报。
 *
 * 载荷要过得了结构化克隆：网关经 BroadcastChannel 把事件转给别的标签页。
 */

import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBPluginWorktree } from '../../plugin.js';
import { WorktreeBranchPinnedError } from '../../worktree/worktree-errors.js';
import { createWorktreeContextsScene, type WorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

/** 记下场景库上派发的 worktree 增删事件。 */
const recordWorktreeEvents = (scene: WorktreeContextsScene) => {
  const created: EntityLocalCreatedEvent[] = [];
  const removed: EntityLocalRemovedEvent[] = [];
  scene.database.addEventListener(ENTITY_LOCAL_CREATE_EVENT, event => created.push(event));
  scene.database.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, event => removed.push(event));
  const summarize = (events: readonly (EntityLocalCreatedEvent | EntityLocalRemovedEvent)[]) =>
    events.map(event => event.entities.map(data => [data.type, data.namespace, data.entity, data.id]));
  return { created, removed, summarize };
};

describe('worktree 行的增删报到实体事件总线上', () => {
  it('createWorktree：派发一次 Worktree 的 INSERT，载荷是列值且过得了结构化克隆', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    const events = recordWorktreeEvents(scene);

    const info = await scene.manager.createWorktree('feature-x', 'Feature');

    expect(events.summarize(events.created)).toEqual([[['INSERT', 'rxdb', 'Worktree', info.id]]]);
    expect(events.created[0].entities[0].patch).toMatchObject({ id: info.id, branchId: 'feature-x', label: 'Feature' });
    expect(() => structuredClone(events.created[0])).not.toThrow();
    expect(events.removed).toEqual([]);
  });

  it('被拒的 createWorktree 一条都不报', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });
    const events = recordWorktreeEvents(scene);

    await expect(scene.manager.createWorktree('feature-x')).rejects.toBeInstanceOf(WorktreeBranchPinnedError);

    expect(events.created).toEqual([]);
  });

  it('removeWorktree：派发一次 Worktree 的 DELETE，反向载荷是删掉的那一行', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x', label: 'X' });
    const events = recordWorktreeEvents(scene);

    await scene.manager.removeWorktree('wt-x');

    expect(events.summarize(events.removed)).toEqual([[['DELETE', 'rxdb', 'Worktree', 'wt-x']]]);
    expect(events.removed[0].entities[0].inversePatch).toMatchObject({ id: 'wt-x', branchId: 'feature-x', label: 'X' });
    expect(() => structuredClone(events.removed[0])).not.toThrow();
  });

  it('被拒的 removeWorktree 一条都不报', async () => {
    const scene = createWorktreeContextsScene();
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });
    const events = recordWorktreeEvents(scene);

    await expect(scene.manager.removeWorktree('wt-main')).rejects.toThrow();

    expect(events.removed).toEqual([]);
  });

  it('删分支连带删掉的 worktree 行报 DELETE；没钉 worktree 的分支一条都不报', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addBranch('feature-y');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });
    const plugin = new RxDBPluginWorktree(scene.database);
    const events = recordWorktreeEvents(scene);

    await plugin.system.removeBranchRows({ executor: scene.probe.executor, branchId: 'feature-x' });
    await plugin.system.removeBranchRows({ executor: scene.probe.executor, branchId: 'feature-y' });

    expect(events.summarize(events.removed)).toEqual([[['DELETE', 'rxdb', 'Worktree', 'wt-x']]]);
  });
});
