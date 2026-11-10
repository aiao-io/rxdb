/**
 * README「换挂之后重读」示例的 effect 原文消费回归（RV-01a1bb40122e）。
 *
 * @remarks
 * 资源对象随每一次相位变化换新引用，方法引用才稳定：把 `tree` 本身放进依赖数组，`status()` 的
 * loading → success 就会让 effect 再跑一遍，挂着不动也一直重查。这里把 README 那一行 effect 原样
 * 放进组件执行，用次数上限拦住失控的循环，断言稳定挂载只读一次、真的换挂才再读一次。
 */
import { WorktreeTableSet, type RxDB } from '@aiao/rxdb';
import {
  createWorkingTreeHookStubs,
  createWorktreeHookStubs,
  statusWith
} from '@aiao/rxdb-plugin-working-tree/testing';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWorkingTree } from '../use-working-tree.js';
import { useWorktrees } from '../use-worktrees.js';

afterEach(cleanup);

const README = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../README.md'), 'utf8');

/** README 订阅 `mounted` 重读那段示例里的 `useEffect(...)` 一行。 */
const readmeEffectLine = (): string => {
  const block = [...README.matchAll(/```tsx\n([\s\S]*?)```/g)]
    .map(match => match[1])
    .find(code => code.includes('worktrees.mounted'));
  const line = block?.split('\n').find(code => code.trimStart().startsWith('useEffect('));
  if (!line) throw new Error('README 里没有订阅 worktrees.mounted 的 useEffect 示例');
  return line.trim();
};

/** 失控时 effect 最多再跑这么多次就不再执行，避免无界循环拖住测试；依赖数组照原文传给 React。 */
const EFFECT_RUN_CAP = 5;

const createDatabase = () => {
  const tree = createWorkingTreeHookStubs();
  const worktrees = createWorktreeHookStubs();
  let reads = 0;
  tree.workingTree.status.mockImplementation(() => {
    reads += 1;
    return Promise.resolve(statusWith(0));
  });
  const rxdb = {
    ...tree.rxdb,
    workingTree: { ...tree.workingTree, checkouts: worktrees.checkouts },
    worktreeTableSet$: worktrees.tableSet$.asObservable()
  } as unknown as RxDB;
  return { rxdb, tableSet$: worktrees.tableSet$, reads: () => reads };
};

describe('README：订阅 mounted 重读工作树状态', () => {
  it('示例的 effect 在稳定挂载时只读一次，换挂之后再读一次', async () => {
    const runReadmeEffect = new Function('useEffect', 'tree', 'worktrees', readmeEffectLine());
    let effectRuns = 0;
    // 依赖数组原样取自 README，正是被测对象
    const cappedUseEffect = (effect: () => void, deps: readonly unknown[]): void =>
      useEffect(() => {
        effectRuns += 1;
        if (effectRuns <= EFFECT_RUN_CAP) effect();
      }, deps);
    const ReadmePanel = () => {
      const worktrees = useWorktrees();
      const tree = useWorkingTree();
      runReadmeEffect(cappedUseEffect, tree, worktrees);
      return null;
    };
    const { rxdb, tableSet$, reads } = createDatabase();

    render(
      <RxDBProvider db={rxdb}>
        <ReadmePanel />
      </RxDBProvider>
    );
    await act(async () => undefined);
    await act(async () => undefined);
    expect(reads()).toBe(1);

    await act(async () => tableSet$.next(WorktreeTableSet.of('wt_shadow', [])));
    await act(async () => undefined);
    expect(reads()).toBe(2);
  });
});
