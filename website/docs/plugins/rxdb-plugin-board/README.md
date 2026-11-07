# 单人任务看板

`@aiao/rxdb-plugin-board` 提供看板领域模型与服务，Angular、React、Vue 绑定提供视图和应用外壳。当前范围是单人、本地优先的任务管理，包括多看板与列、任务详情、标签、到期日、筛选、拖放、键盘移动、历史和备份恢复。

## 包与入口

| 包                                | 主要入口                                                                                |
| :-------------------------------- | :-------------------------------------------------------------------------------------- |
| `@aiao/rxdb-plugin-board`         | `Board`、`Column`、`Task`、`BoardLabel`、`TaskLabel`，领域服务与 `BoardShellController` |
| `@aiao/rxdb-plugin-board-angular` | `BoardViewComponent`、`BoardShellComponent`、`useBoard`                                 |
| `@aiao/rxdb-plugin-board-react`   | `BoardView`、`BoardShell`、`useBoard`                                                   |
| `@aiao/rxdb-plugin-board-vue`     | `BoardView`、`BoardShell`、`useBoard`                                                   |

当前包族尚未进入 npm 发布集合，先从仓库工作区验证。包名与代码示例描述当前 main 的接入方式，不能把工作区的 `0.0.28` 当作这些包已经发布的证明。本地运行入口见[能力与示例](../../getting-started/capabilities.md)。

完整视图需加载对应绑定的 `board-view.css` 子路径。React / Vue 在应用入口导入，Angular 在全局 styles 中配置；只使用 `useBoard` 的数据与动作时无需视图样式。

## 准备数据库

把五个实体加入同一 RxDB，在连接前安装历史、搜索插件并注册本地适配器。完整 `BoardShell` 的首轮支持组合是 **sqlite-wasm 主线程 `vfs: 'idb'`**；实例工厂返回未连接的数据库，库名由外壳分配：

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

export function createRxdb(dbName: string): RxDB {
  const db = new RxDB({
    dbName,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSearch);
  db.adapter(
    'sqlite-wasm',
    () =>
      new RxDBAdapterSqlite(db, {
        vfs: 'idb',
        wasmUrl: '/sqlite-wasm/wa-sqlite-async.wasm'
      })
  );
  return db;
}
```

WASM 来自适配器依赖的 `@subframe7536/sqlite-wasm`，复制方式见 [sqlite-wasm 适配器](../../adapters/sqlite-wasm.md)。不能把 wa-sqlite 或官方 SQLite 的 WASM 放到该路径混用。

## 三框架外壳

React 示例，`options` 在组件外保持稳定引用：

```tsx
import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { BoardShell } from '@aiao/rxdb-plugin-board-react';
import '@aiao/rxdb-plugin-board-react/board-view.css';
import { createRxdb } from './board-rxdb';

const options: BoardShellOptions = { createRxdb, adapterName: 'sqlite-wasm' };

export function BoardPage() {
  return <BoardShell options={options} />;
}
```

Angular 使用 `<board-shell [options]="options" />` 与 `BoardShellComponent`，Vue 使用 `<BoardShell :options="options" />`。三端共用 `BoardShellController` 的启动、恢复与切库流程；可选 `seed` 提供演示数据。

外壳先显示新建或恢复入口，用户选择之前不连接数据库。恢复写入新的库名，整页重载并读回成功后才切换活动库；不覆盖当前已连接的数据库。只需要嵌入看板时，`BoardView` / `BoardViewComponent` 接收应用已连接的看板实例。

## 搜索、历史与运行示例

看板通过实体仓储与领域服务维护归属、手动排序和操作权限。搜索使用 [全文搜索插件](../rxdb-plugin-search/README.md)，历史使用 [history 插件](../rxdb-plugin-history/README.md)；不能据此推断全部数据库适配器都支持完整看板外壳。

```bash
pnpm nx serve dev-rxdb-board
```

独立示例位于 `apps/dev-rxdb-board`。三框架综合演示中也有看板页面，便于对照绑定实现。多人实时协同与 P2P 文件共享不在单人看板的默认接入范围内。
