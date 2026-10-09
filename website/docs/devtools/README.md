# 开发者工具

`@aiao/rxdb-devtools` 是 RxDB 与浏览器 DevTools 扩展之间的开发期连接器：它在被检查页面与扩展面板之间转发事件、数据库摘要、实体查询结果与分支操作结果，帮助开发者实时查看实体数据、事件流与存储状态。

> 本包暴露了数据库检查、查询与分支变更能力，**只在开发环境启用**，禁止在生产构建中初始化。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-devtools
```

## 接入

公开入口是 `getDevToolsConnector()`——它返回**页面级 connector 单例**（`DevToolsConnector`）。拿到后调用 `init(rxdb, getEntityMetadata)` 注册要观测的 RxDB 实例：

```typescript
import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

await rxdb.connect('wa-sqlite');

// 仅在开发环境启用
if (import.meta.env.DEV && typeof window !== 'undefined') {
  getDevToolsConnector().init(rxdb, getEntityMetadata);
}
```

`init(rxdb, getEntityMetadata)` 会读取实体元数据、订阅 RxDB 事件并立刻发出一次握手；扩展面板返回 `HANDSHAKE_ACK` 后，connector 开始转发实时事件，并刷新握手前缓存在内存里的事件。要点：

- 对同一个 RxDB 对象重复 `init()` 是幂等操作；当前协议只支持**一个** RxDB 实例，换一个不同实例会抛错。
- `getEntityMetadata` 来自 `@aiao/rxdb`，是加密字段遮罩的唯一依据——不传它，connector 就不知道哪些字段是密文，`QUERY_ENTITY` 的结果与事件载荷也不会遮罩。
- `disconnect()` 只断开 connector 通信并清理监听，不会调用 `rxdb.disconnectAll()`；调用后可以再次 `init()`。
- 没有 `window` 的环境（SSR）里 `init()` / `disconnect()` 是 no-op。
- 调用方负责保证生产 bundle 不执行 `init()`。`getDevToolsConnector({ enabled: false })` 可以用于测试或显式关闭，但不能替代构建期的开发环境门禁；生产环境还可以把 `capabilities` 降到 `'readonly'` 或 `'none'`，收紧面板能下达的命令档位。

## 功能

连接后，扩展面板提供以下面板：

- **Events**：实时 RxDB 事件流与详情
- **Database**：数据库信息、实体列表与数据查询
- **分支管理**：查看、创建、切换与删除分支
- **OPFS**：浏览 / 上传 / 下载 / 删除文件与目录（浏览器端是 OPFS，桌面端是原生文件后端）
- **Storage**：`StorageFileMeta` 存储元数据
- **Settings**：主题、清理本地数据

## 浏览器扩展

安装浏览器扩展后，DevTools 面板会出现在浏览器开发者工具中（F12 → RxDB 标签页）。

扩展源码位于 [apps/rxdb-devtools-extension](https://github.com/aiao-io/rxdb/tree/main/apps/rxdb-devtools-extension)（Manifest V3）。面板本体在共享 library `modules/rxdb-devtools-panel`，Chrome / Electron / Tauri 三个宿主共用同一份 UI 与状态机；`apps/rxdb-devtools-extension` 只提供 Chrome 侧的宿主适配。

## 参考

- [快速开始](../getting-started/README.md)
- [模型定义](../model-definition/README.md)
