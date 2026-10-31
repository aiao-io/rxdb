import { Board, BoardLabel, Column, Task, TaskLabel, type BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardPage from './board.page';

const constructed = vi.hoisted(() => ({
  options: [] as unknown[],
  adapters: [] as unknown[],
  plugins: [] as unknown[]
}));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: class {
    constructor(options: unknown) {
      constructed.options.push(options);
    }
    use = (plugin: unknown) => void constructed.plugins.push(plugin);
    adapter = (name: string, factory: () => unknown) => void constructed.adapters.push([name, factory()]);
  }
}));
vi.mock('@aiao/rxdb-adapter-sqlite-wasm', () => ({
  RxDBAdapterSqlite: class {
    constructor(
      readonly db: unknown,
      readonly options: unknown
    ) {}
  }
}));

/**
 * 看板宿主页（US-539）：启动选择、恢复编排与连接生命周期在外壳（核心包 BoardShellController 与绑定的
 * `<board-shell>` 单测）；宿主只负责给出 sqlite-wasm 主线程 `vfs: 'idb'` 的实例工厂与演示数据。
 */
describe('看板宿主页的外壳配置', () => {
  beforeEach(() => {
    constructed.options.length = 0;
    constructed.adapters.length = 0;
    constructed.plugins.length = 0;
    TestBed.configureTestingModule({ providers: [{ provide: APP_BASE_HREF, useValue: '/demo/' }] });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('实例工厂按外壳分配的库名建 sqlite-wasm idb 实例，装历史与搜索插件；提供演示数据', () => {
    const page = TestBed.runInInjectionContext(() => new BoardPage());
    const options = page['options'] as BoardShellOptions;
    expect(options.adapterName).toBe('sqlite-wasm');
    expect(options.seed).toBe(seedReleaseBoardDataset);

    options.createRxdb('rxdb-board-restore-0');
    expect(constructed.options).toEqual([
      expect.objectContaining({
        dbName: 'rxdb-board-restore-0',
        entities: [Board, Column, Task, BoardLabel, TaskLabel]
      })
    ]);
    expect(constructed.plugins).toHaveLength(2);
    const [[name, adapter]] = constructed.adapters as [[string, { options: { vfs: string; wasmUrl: string } }]];
    expect(name).toBe('sqlite-wasm');
    expect(adapter.options.vfs).toBe('idb');
    expect(adapter.options.wasmUrl).toContain('/demo/');
  });
});
