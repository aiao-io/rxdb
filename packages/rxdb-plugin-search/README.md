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

`db.searchPlugin.ready` 在插件于当前连接纪元尚未安装时会 reject；安装中、安装完成或安装失败后，
始终返回同一个 Promise。不要在 `connect()` 前等待它，否则数据库适配器尚未进入初始化流程。

`db.search()` 返回的 `SearchHandle` 由调用方负责 `destroy()`；Angular、React、Vue 绑定会在组件
生命周期结束时自动销毁。

## 连接纪元

entity 事件监听登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时由宿主逆序释放。
本插件**不**声明 `lifecycle: 'scoped'`——状态机复位还留在 `destroy()` 里，因此宿主两步都会走：
先释放作用域摘掉监听，再调 `destroy()`。插件身份 `db.searchPlugin` 跨纪元存活，重新
`connect()` 会复用同一实例并重新安装 FTS。

框架绑定：Angular 用 [`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular)，React 用 [`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react)，Vue 用 [`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue)。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
