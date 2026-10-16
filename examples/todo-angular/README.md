# Todo（Angular）

最小可运行的 RxDB + wa-sqlite Todo 示例，对应仓库 README「5 分钟跑通」。

- 装饰器实体 `Todo`（一份声明同时生成表、类型与 Repository）
- wa-sqlite 浏览器内 SQLite（OPFS / IndexedDB 持久化，Worker 运行）
- `useFindAll` 响应式查询 + 过滤（all / active / completed）
- 增删改、批量勾选 / 清空已完成

## 本地运行

```bash
npm install
npm run dev
```

## StackBlitz

https://stackblitz.com/github/aiao-io/rxdb/tree/main/examples/todo-angular
