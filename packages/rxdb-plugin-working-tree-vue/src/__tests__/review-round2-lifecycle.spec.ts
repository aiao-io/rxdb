import type { RxDB } from '@aiao/rxdb';
import type { CommitResult, WorkingTreeDiff, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import {
  createWorkingTreeHookStubs,
  CREDENTIALS,
  deferred,
  diffWith,
  statusWith
} from '@aiao/rxdb-plugin-working-tree/testing';
import { useRxDBRef, type RxDBInput } from '@aiao/rxdb-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, shallowRef, watch } from 'vue';
import { useWorkingTree, type WorkingTreeResource } from '../index.js';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

const mounted = new Set<{ unmount(): void }>();

const mountResource = (database: RxDBInput<RxDB>, inspect?: (tree: WorkingTreeResource) => void) => {
  let tree!: WorkingTreeResource;
  const setup = () => {
    tree = useWorkingTree();
    inspect?.(tree);
  };
  const wrapper = mount(createRxDBProviderHarness(database, createSetupHarness(setup)));
  mounted.add(wrapper);
  const unmount = () => {
    mounted.delete(wrapper);
    wrapper.unmount();
  };
  return { tree, unmount };
};

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount();
  mounted.clear();
});

describe('review-round2：working-tree Vue 生命周期取证', () => {
  it('未启用能力时保留 false，不暗中 enable', async () => {
    const fixture = createWorkingTreeHookStubs();
    fixture.workingTree.isEnabled.mockResolvedValue(false);
    const { tree } = mountResource(fixture.rxdb);

    expect(tree.isEnabledState.value.phase).toBe('idle');
    await expect(tree.isEnabled()).resolves.toBe(false);
    expect(tree.isEnabledState.value).toEqual({ phase: 'success', value: false });
    expect(fixture.workingTree.enable).not.toHaveBeenCalled();
    expect(fixture.workingTree.status).not.toHaveBeenCalled();
  });

  it('缺插件时创建入口同步抛错，不伪造干净态', () => {
    const { rxdb } = createWorkingTreeHookStubs();
    Reflect.deleteProperty(rxdb, 'workingTree');

    expect(() => mountResource(rxdb)).toThrow(/没有 workingTree 入口/);
  });

  it('provider Ref 替换后现存 resource 仍捕获 A，新 resource 才读取 B', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const database = shallowRef<RxDB>(first.rxdb);
    const firstPayload = statusWith(1);
    const secondPayload = { ...statusWith(2), branchId: 'branch-b' };
    first.workingTree.status.mockResolvedValue(firstPayload);
    second.workingTree.status.mockResolvedValue(secondPayload);
    const { tree: oldTree } = mountResource(database);

    database.value = second.rxdb;
    await nextTick();
    await oldTree.status();
    const { tree: newTree } = mountResource(database);
    await newTree.status();

    expect(oldTree.statusState.value).toEqual({ phase: 'success', value: firstPayload });
    expect(newTree.statusState.value).toEqual({ phase: 'success', value: secondPayload });
    expect(first.workingTree.status).toHaveBeenCalledTimes(1);
    expect(second.workingTree.status).toHaveBeenCalledTimes(1);
  });

  it('provider 工厂只求值一次，不是被 watch 的响应式 getter', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(first.rxdb, 'destroy', { value: destroy });
    const database = shallowRef<RxDB>(first.rxdb);
    const source = vi.fn(() => database.value);
    let tree!: WorkingTreeResource;
    const consumer = createSetupHarness(() => {
      tree = useWorkingTree();
    });
    const readyBoundary = defineComponent({
      setup() {
        const provided = useRxDBRef();
        return () => (provided.value ? h(consumer) : h('span'));
      }
    });
    const wrapper = mount(createRxDBProviderHarness(source, readyBoundary));
    mounted.add(wrapper);
    await flushPromises();
    await nextTick();

    database.value = second.rxdb;
    await nextTick();
    await tree.status();
    expect(source).toHaveBeenCalledTimes(1);
    expect(first.workingTree.status).toHaveBeenCalledTimes(1);
    expect(second.workingTree.status).not.toHaveBeenCalled();
    mounted.delete(wrapper);
    wrapper.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('解构 ComputedRef 可被 watch，返回载荷保持身份且不深代理', async () => {
    const fixture = createWorkingTreeHookStubs();
    const payload = statusWith(2);
    const phases: string[] = [];
    fixture.workingTree.status.mockResolvedValue(payload);
    fixture.workingTree.diff.mockResolvedValue(diffWith(0));
    const inspect = (tree: WorkingTreeResource) => {
      watch(tree.statusState, state => phases.push(state.phase), { flush: 'sync' });
    };
    const { tree } = mountResource(fixture.rxdb, inspect);
    const { status, statusState } = tree;

    await status();
    await tree.diff();

    expect(phases).toEqual(['loading', 'success']);
    const state = statusState.value;
    expect(state.phase).toBe('success');
    if (state.phase !== 'success') throw new Error('status 未成功');
    expect(state.value).toBe(payload);
  });

  it('同库多实例的 command state 各自所有，不共享 patch', async () => {
    const fixture = createWorkingTreeHookStubs();
    fixture.workingTree.status.mockResolvedValue(statusWith(1));
    const { tree: first } = mountResource(fixture.rxdb);
    const { tree: second } = mountResource(fixture.rxdb);

    await first.status();

    expect(first.statusState.value.phase).toBe('success');
    expect(second.statusState.value.phase).toBe('idle');
    expect(first.statusState).not.toBe(second.statusState);
    expect(first.status).not.toBe(second.status);
  });

  it('同格只采纳最新调用，旧 Promise 仍返回自身结果，不使别格过期', async () => {
    const fixture = createWorkingTreeHookStubs();
    const older = deferred<WorkingTreeStatus>();
    const newer = deferred<WorkingTreeStatus>();
    const diff = deferred<WorkingTreeDiff>();
    fixture.workingTree.status.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    fixture.workingTree.diff.mockReturnValue(diff.promise);
    const { tree } = mountResource(fixture.rxdb);
    const oldRun = tree.status();
    const newRun = tree.status();
    const diffRun = tree.diff();
    const latest = statusWith(2);
    newer.resolve(latest);
    await newRun;
    older.resolve(statusWith(1));
    await expect(oldRun).resolves.toEqual(statusWith(1));
    diff.resolve(diffWith(0));
    await diffRun;

    expect(tree.statusState.value).toEqual({ phase: 'success', value: latest });
    expect(tree.diffState.value.phase).toBe('empty');
  });

  it('commit 飞行中替换 provider Ref 不迁移命令，旧库刷新不写新 resource', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const pending = deferred<CommitResult>();
    const database = shallowRef<RxDB>(first.rxdb);
    first.workingTree.commit.mockReturnValue(pending.promise);
    const { tree: oldTree } = mountResource(database);
    const running = oldTree.commit('scope 切换', { ...CREDENTIALS, authorId: 'review', operationId: 'r2-scope' });

    database.value = second.rxdb;
    await nextTick();
    const { tree: newTree } = mountResource(database);
    pending.resolve({ ok: true, commitId: 'old-db-commit', changeSetCount: 1, headRevision: 3 });
    await running;

    expect(oldTree.commitState.value.phase).toBe('success');
    expect(first.workingTree.status).toHaveBeenCalledTimes(1);
    expect(second.workingTree.status).not.toHaveBeenCalled();
    expect(newTree.commitState.value.phase).toBe('idle');
    expect(newTree.statusState.value.phase).toBe('idle');
  });

  it('卸载停止组件 watch，但不取消 pending 命令、不清除外部持有的 diff', async () => {
    const fixture = createWorkingTreeHookStubs();
    const pending = deferred<CommitResult>();
    const payload = diffWith(1);
    const phases: string[] = [];
    fixture.workingTree.commit.mockReturnValue(pending.promise);
    fixture.workingTree.diff.mockResolvedValue(payload);
    const inspect = (tree: WorkingTreeResource) => {
      watch(tree.commitState, state => phases.push(state.phase), { flush: 'sync' });
    };
    const { tree, unmount } = mountResource(fixture.rxdb, inspect);
    await tree.diff();
    const running = tree.commit('卸载中', { ...CREDENTIALS, authorId: 'review', operationId: 'r2-unmount' });
    expect(phases).toEqual(['loading']);

    unmount();
    const result: CommitResult = { ok: true, commitId: 'late-commit', changeSetCount: 1, headRevision: 3 };
    pending.resolve(result);
    await expect(running).resolves.toBe(result);

    expect(phases).toEqual(['loading']);
    expect(tree.commitState.value).toEqual({ phase: 'success', value: result });
    expect(tree.diffState.value).toEqual({ phase: 'success', value: payload });
    expect(fixture.workingTree.status).toHaveBeenCalledTimes(1);
  });
});
