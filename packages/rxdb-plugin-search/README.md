# @aiao/rxdb-plugin-search

`@aiao/rxdb` 的全局搜索插件。基于 SQLite FTS5，为标注 `searchable: true` 字段的 collection 提供响应式全文检索。

> **仅兼容 [`@aiao/rxdb-adapter-sqlite-wasm`](../rxdb-adapter-sqlite-wasm) 适配器**；其他适配器将在数据库创建阶段 fail-fast。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-adapter-sqlite-wasm rxjs
```

## 用法

```typescript
import { firstValueFrom } from 'rxjs';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

db.use(rxDBPluginSearch, {
  debounce: 300,
  pageSize: 50,
  snippetLength: 120
});

// connect() 会同步触发 init()，插件随后完成 FTS 安装与回填。
await db.connect('sqlite-wasm');
await db.searchPlugin.ready;

const handle = db.search('local first', { collections: ['Article'] });
const results = await firstValueFrom(handle.results$);

handle.destroy();
await db.disconnect('sqlite-wasm');
```

`db.searchPlugin.ready` 一个连接纪元一格：`connect()` 之前与安装期间是 **pending**，安装成功
resolve、失败 reject（原始错误），纪元被释放（断连 / 回滚）后 reject `destroyed`。可以在
`connect()` 之前就拿到它的引用——那一格会被本纪元的安装续用；但跨断连持有同一个引用读到的
是**那一纪元**的结果，重连之后要重新读一次。

`db.search()` 返回的 `SearchHandle` 由调用方负责 `destroy()`；Angular、React、Vue 绑定会在组件
生命周期结束时自动销毁。

## 连接纪元

插件声明 `inject: ['adapter:local']`，由宿主决定装载时机：本地适配器的引导链跑完之后才调
`install()`，插件自己不再等连接信号。因此 `await db.connect()` 返回时 FTS 已经装好——
`ready` 是给「装了没有 / 装失败了没有」的显式确认，不是必须的等待点。

entity 事件监听与状态复位都登记在 `install(scope)` 收到的作用域上。插件声明了
`lifecycle: 'scoped'`，宿主释放作用域即完成拆卸，没有第二步 `destroy()`。插件身份
`db.searchPlugin` 跨纪元存活，重新 `connect()` 会复用同一实例并重新安装 FTS。

框架绑定：Angular 用 [`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular)，React 用 [`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react)，Vue 用 [`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue)。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
