# @aiao/rxdb-plugin-search-vue

[`@aiao/rxdb-plugin-search`](../rxdb-plugin-search) 的 Vue 集成层。提供 `useSearch()` composable，将搜索插件的 `SearchHandle` 适配为 Vue `ref` / reactive 消费接口。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-vue vue rxjs
```

## 用法

```vue
<script lang="ts" setup>
import { useSearch } from '@aiao/rxdb-plugin-search-vue';
</script>
```

- `useSearch`：返回响应式的 `SearchState`（结果、加载态与错误）
- 类型：`UseSearchReturn`、`SearchSourceLike`

### 响应式入参与重建契约（三端一致）

`source` 与 `options` 都接受 `MaybeRefOrGetter`（值 / `Ref` / `ComputedRef` / getter）。
解析值变化时旧 `SearchHandle` 被销毁、新 handle 以**用户当前 query** 播种：

- `initialQuery` **只在首次创建时**作种子，此后不再参与重建判据，
  因此传 `initialQuery: query` 不会导致每次击键重建 handle；
- `options` 按语义（`collections` / `debounce` / `pageSize` / `snippetLength`）而非引用比较，
  每次重算新建的字面量不触发重建；
- 重建后 `loadMore` / `clear` / `retry` 一律路由到最新 handle，旧 handle 的晚到 emission 不再写入输出。

判据由 core 的 `searchOptionsEqual` 三端共用，重建时机不会因框架而异。

三框架同功能对称：Angular 用 `injectSearch`（[`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular)），React 用 `useSearch`（[`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react)）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 框架集成与搜索指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
