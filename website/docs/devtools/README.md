# 开发者工具

`@aiao-enterprise/rxdb-devtools` 提供 RxDB 数据库的可视化调试界面，以浏览器扩展形式运行，帮助开发者实时查看数据库状态、集合内容、查询执行和同步日志。

> 此包属于企业版（`@aiao-enterprise` scope），需要单独安装。

## 安装

```bash npm2yarn
npm install @aiao-enterprise/rxdb-devtools
```

## 功能

- **集合浏览器**：查看所有 collection 的数据，支持分页和过滤
- **查询监控**：实时追踪活跃的响应式查询及其执行时间
- **变更日志**：查看 INSERT / UPDATE / DELETE 操作历史
- **同步状态**：监控本地与远端的同步进度和冲突
- **Schema 查看器**：浏览实体定义和索引结构

## 接入

在应用入口注册 devtools 插件：

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBDevtools } from '@aiao-enterprise/rxdb-devtools';

const rxdb = new RxDB({ adapter });
// 仅在开发环境启用
if (process.env.NODE_ENV === 'development') {
  rxdb.use(rxDBDevtools());
}
await rxdb.connect();
```

## 浏览器扩展

安装浏览器扩展后，DevTools 面板会出现在浏览器开发者工具中（F12 → RxDB 标签页）。

扩展源码位于 [apps/rxdb-devtools-extension](https://github.com/aiao-io/aiao/tree/main/apps/rxdb-devtools-extension)。

## 参考

- [快速开始](../getting-started/README.md)
- [模型定义](../model-definition/README.md)
