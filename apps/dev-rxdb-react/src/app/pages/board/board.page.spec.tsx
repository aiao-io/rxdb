import { Board, BoardLabel, Column, Task, TaskLabel, type BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BoardPage from './board.page';

const state = vi.hoisted(() => ({
  shellOptions: [] as unknown[],
  constructed: [] as unknown[],
  adapters: [] as unknown[],
  plugins: [] as unknown[]
}));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: vi.fn(function (options: unknown) {
    state.constructed.push(options);
    return {
      use: (plugin: unknown) => void state.plugins.push(plugin),
      adapter: (name: string, factory: () => unknown) => void state.adapters.push([name, factory()])
    };
  })
}));
vi.mock('@aiao/rxdb-adapter-sqlite-wasm', () => ({
  RxDBAdapterSqlite: vi.fn(function (_db: unknown, options: unknown) {
    return { options };
  })
}));
vi.mock('@aiao/rxdb-plugin-board-react', () => ({
  BoardShell: ({ options }: { options: BoardShellOptions }) => {
    state.shellOptions.push(options);
    return null;
  }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * 看板宿主页（US-539）：启动选择、恢复编排与连接生命周期在外壳（核心包 BoardShellController 与绑定的
 * BoardShell 单测）；宿主只负责给出 sqlite-wasm 主线程 `vfs: 'idb'` 的实例工厂与演示数据。
 */
it('外壳配置是稳定引用；实例工厂按外壳分配的库名建 sqlite-wasm idb 实例，装历史与搜索插件', () => {
  const view = render(<BoardPage />);
  view.rerender(<BoardPage />);
  const [first, second] = state.shellOptions as BoardShellOptions[];
  expect(second).toBe(first);
  expect(first.adapterName).toBe('sqlite-wasm');
  expect(first.seed).toBe(seedReleaseBoardDataset);

  first.createRxdb('rxdb-board-restore-0');
  expect(state.constructed).toEqual([
    expect.objectContaining({ dbName: 'rxdb-board-restore-0', entities: [Board, Column, Task, BoardLabel, TaskLabel] })
  ]);
  expect(state.plugins).toHaveLength(2);
  expect(state.adapters).toEqual([['sqlite-wasm', { options: { vfs: 'idb' } }]]);
});
