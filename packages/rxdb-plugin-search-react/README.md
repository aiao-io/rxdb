# @aiao/rxdb-plugin-search-react

[`@aiao/rxdb-plugin-search`](../rxdb-plugin-search) 的 React 集成层。提供 `useSearch()` hook，将搜索插件的 `SearchHandle` 适配为 React 状态消费接口。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-react react rxjs
```

## 用法

```tsx
import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { useSearch, type UseSearchReturn } from '@aiao/rxdb-plugin-search-react';

export async function startSearch(database: RxDB): Promise<void> {
  database.use(rxDBPluginSearch, { debounce: 200, pageSize: 20 });
  await database.connect('sqlite-wasm');
  await database.searchPlugin.ready;
}

export function SearchPage({ database }: { readonly database: RxDB }) {
  const search: UseSearchReturn = useSearch(database, {
    collections: ['Article'],
    initialQuery: ''
  });

  return (
    <main>
      <label>
        Search
        <input value={search.query} onChange={event => search.setQuery(event.currentTarget.value)} />
      </label>
      {search.error && <p role="alert">{search.error.message}</p>}
      {search.state === 'error' && <button onClick={search.retry}>Retry</button>}
      <ul>
        {search.results.map(result => (
          <li key={`${result.collection}:${result.id}`}>{result.snippet}</li>
        ))}
      </ul>
      {search.hasMore && <button onClick={() => void search.loadMore()}>Load more</button>}
      <button onClick={search.clear}>Clear</button>
    </main>
  );
}
```

`startSearch()` 必须在渲染 `SearchPage` 前完成。`connect()` 会触发数据库 `init()`；
`database.searchPlugin.ready` 等待 FTS 安装与回填完成。未安装或销毁后访问 `ready` 会 reject，
不能把它当成永远成功的探针。

`useSearch` 返回 `UseSearchReturn`。hook 持有 `SearchHandle` 的所有权，组件卸载或重建时自动
`destroy()`；调用方不要再次销毁底层 handle。

### 重建契约（三端一致）

`source` 变化、或 `options` 的 `collections` / `debounce` / `pageSize` / `snippetLength`
任一变化时，旧 `SearchHandle` 被销毁、新 handle 以**用户当前 query** 播种：

- `initialQuery` **只在首次创建时**作种子，此后不再参与重建判据，
  因此传 `initialQuery: query` 不会导致每次击键重建 handle；
- `options` 按语义（而非引用）比较，每次渲染新建的字面量不触发重建；
- 重建后 `loadMore` / `clear` / `retry` 一律路由到最新 handle，旧 handle 的晚到 emission 不再写入输出。

判据由 core 的 `searchOptionsEqual` 三端共用，重建时机不会因框架而异。

三框架同功能对称：Angular 用 `injectSearch`（[`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular)），Vue 用 `useSearch`（[`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/aiao](https://github.com/aiao-io/aiao)
- 框架集成与搜索指南见项目文档站

## License

[MIT](https://github.com/aiao-io/aiao/blob/main/LICENSE)
