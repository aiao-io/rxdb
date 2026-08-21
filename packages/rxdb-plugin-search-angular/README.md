# @aiao/rxdb-plugin-search-angular

[`@aiao/rxdb-plugin-search`](../rxdb-plugin-search) 的 Angular 集成层。提供 `useSearch()`，将搜索插件的 `SearchHandle` 适配为 Angular signal 消费接口。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-angular @angular/core rxjs
```

## 用法

```typescript
import { Component, input } from '@angular/core';
import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { useSearch, type UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';

export async function startSearch(database: RxDB): Promise<void> {
  database.use(rxDBPluginSearch, { debounce: 200, pageSize: 20 });
  await database.connect('sqlite-wasm');
  await database.searchPlugin.ready;
}

@Component({
  selector: 'app-search-page',
  template: `
    <label>
      Search
      <input [value]="search.query()" (input)="search.query.set($any($event.target).value)" />
    </label>
    @if (search.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
    <ul>
      @for (result of search.results(); track result.collection + ':' + result.id) {
        <li>{{ result.snippet }}</li>
      }
    </ul>
    @if (search.hasMore()) {
      <button (click)="search.loadMore()" type="button">Load more</button>
    }
    <button (click)="search.retry()" type="button">Retry</button>
    <button (click)="search.clear()" type="button">Clear</button>
  `
})
export class SearchPage {
  readonly database = input.required<RxDB>();
  readonly search: UseSearchReturn = useSearch(this.database, {
    collections: ['Article'],
    initialQuery: ''
  });
}
```

`startSearch()` 必须在创建 `SearchPage` 前完成。插件声明 `inject: ['adapter:local']`，宿主在本地
适配器就绪后才安装它，因此 `await connect()` 返回时 FTS 已经装好；`database.searchPlugin.ready`
是「装上没有」的显式确认——安装成功 resolve，失败 reject 原始错误，纪元被释放（断连 / 回滚）后
reject `destroyed`。它一个连接纪元一格，重连之后要重新读一次。

`useSearch` 返回 `UseSearchReturn`。绑定层持有底层 `SearchHandle`，组件销毁或输入重建时自动
`destroy()`；调用方不应再次销毁 handle。

### Signal 入参与重建契约（三端一致）

`source` 与 `options` 都接受普通值或 `Signal`。解析值变化时旧 `SearchHandle` 被销毁、
新 handle 以**用户当前 query** 播种：

- `initialQuery` **只在首次创建时**作种子，此后不再参与重建判据，
  因此传 `initialQuery: query()` 不会导致每次击键重建 handle；
- `options` 按语义（`collections` / `debounce` / `pageSize` / `snippetLength`）而非引用比较，
  每次重算新建的字面量不触发重建；
- 重建后 `loadMore` / `clear` / `retry` 一律路由到最新 handle，旧 handle 的晚到 emission 不再写入 signal；
- 旧 handle 由重建路径自己 `destroy()`，不会堆积到 `DestroyRef` 上。

判据由 core 的 `searchOptionsEqual` 三端共用，重建时机不会因框架而异。

三框架同功能对称：React 用 `useSearch`（[`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react)），Vue 用 `useSearch`（[`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 框架集成与搜索指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
