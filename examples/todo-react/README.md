# Todo（React）

最小可运行的 RxDB + PGlite Todo 示例，对应仓库 README「5 分钟跑通」。

- 装饰器实体 `Todo`（一份声明同时生成表、类型与 Repository）
- PGlite 浏览器内 PostgreSQL（`idb://` 持久化，主线程运行）
- `useFindAll` 响应式查询 + 过滤（all / active / completed）
- 增删改、批量勾选 / 清空已完成

## 本地运行

```bash
npm install
npm run dev
```

## StackBlitz

https://stackblitz.com/github/aiao-io/rxdb/tree/main/examples/todo-react

> PGlite 依赖 `SharedArrayBuffer`，需要浏览器跨源隔离（本示例的 `vite.config.ts` 已配置
> COOP/COEP 响应头）；请在 Chrome / Edge 中打开预览。
