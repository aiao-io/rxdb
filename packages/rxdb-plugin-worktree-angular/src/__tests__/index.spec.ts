import { describe, expect, it } from 'vitest';

import type { WorktreeResource } from '../index.js';
import * as publicApi from '../index.js';

describe('包入口公开面', () => {
  // 上面那行 `import type` 编译期即被抹除，入口模块根本不会在运行时加载——
  // 只有下面这个命名空间导入才真的执行 `index.ts`。漏掉它的话，即使把
  // `export { useWorktree }` 整行删掉，这份 spec 也照样全绿。
  it('useWorktree 是运行时值', () => {
    expect(publicApi.useWorktree).toBeTypeOf('function');
  });

  // `index.ts` 明写「只转出入口本身，不把插件包的类型与错误类在这里再导一遍」。
  // 这条把那个决定钉成断言：往桶里多加一个运行时符号立刻红。
  // 与 `rxdb-plugin-search-*` 的 SRCHR-006 正相反——那边把 `SearchExecutionError`
  // 和纯类型一起 `export type`、消费者拿不到 class 是已知债；这边是**有意不转**，
  // 调用方一律从 `@aiao/rxdb-plugin-worktree` 直接 import。
  it('运行时导出只有 useWorktree 一个', () => {
    expect(Object.keys(publicApi).sort()).toEqual(['useWorktree']);
  });

  // `WorktreeResource` 是 `export type`，运行时不存在，
  // 只能在类型位置验证它从**入口**可具名（而不是只能从 `../use-worktree.js` 拿）。
  it('WorktreeResource 从入口可具名', () => {
    const resource: WorktreeResource | undefined = undefined;

    expect(resource).toBeUndefined();
  });
});
