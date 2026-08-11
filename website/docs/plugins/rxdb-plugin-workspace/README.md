# @aiao/rxdb-plugin-workspace

`@aiao/rxdb-plugin-workspace` 是工作区插件，把**尚未入库的 NEW 实体草稿**保存在内存和 IndexedDB 中，并通过 BroadcastChannel 在同源标签页之间同步。刷新或重开页面后草稿自动恢复，可以继续编辑、保存或丢弃。

## 当前状态

已可用：

- NEW 草稿缓存 + IndexedDB 持久化（`idb-keyval`），重启后 `install()` 自动恢复
- `list()` 查看草稿快照，`discard(cacheId)` 丢弃单条草稿
- `entity.save()` 落主表后自动移出草稿缓存
- `flush()` 写盘屏障、`autoSave` 开关、`changes$` 变更通知
- 同源标签页之间的 add / remove 同步

> 范围仅限 NEW 草稿。已存在实体的**未保存 UPDATE 暂存**与基于 inverse patch 的 **restore / rollback** 均未提供，受 RxDB 核心事件入口限制，详见「当前边界」。

## 适用场景

- 新建对象的本地暂存（尚未保存到数据库）
- 页面刷新后的“未提交新建”现场恢复
- 多标签页共享同一份新建草稿

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-workspace
```

## 使用

```ts
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';

// db 已按所选 adapter 的文档完成配置。
db.use(rxDBPluginWorkspace, { autoSave: true });
db.init();
await db.workspace.ready;

// 新建实体即进入草稿缓存
const todo = new Todo({ title: '写文档' });

const drafts = db.workspace.list(); // WorkspaceCacheEntry[]

await todo.save(); // 落主表，草稿自动移出缓存
db.workspace.discard(drafts[0].cacheId); // 或直接丢弃草稿

await db.workspace.flush(); // 显式等待 IndexedDB 写入
```

`autoSave` 默认为 `true`。设为 `false` 后事件仍更新内存队列与跨标签页状态，但不会自动写 IndexedDB，调用方必须在需要持久化时 `await db.workspace.flush()`。

## 当前边界

- 目标是临时工作区能力，不是通用同步方案；不负责正式数据持久化协议
- **未保存 UPDATE 暂存：未支持。** 全局 UPDATE 事件在写库成功之后派发，不代表 Proxy 中尚未保存的编辑
- **restore / rollback：未支持。** NEW 草稿在安装时自动恢复；现有实体回滚需要完整 base/inverse patch 模型。当前只有 `discard(cacheId)`，没有 `restore()`
- **DELETE 撤销：未支持。** REMOVE / CREATE 事件只负责清理对应 NEW 草稿
- 依赖浏览器 `crypto.randomUUID()` 与 IndexedDB，不可在 SSR 渲染阶段构造插件
- BroadcastChannel 不是鉴权边界，草稿也不加密：不要把不应落盘或不应暴露给同源脚本的数据放进草稿

因此当前版本还不能作为完整的 Git 式 entity workspace。

## 下一步

- 完整 API 说明见 [API 文档](../../api/rxdb-plugin-workspace/README.md)
- 如果你只需要稳定能力，优先使用核心实体与本地适配器
- 如果你需要文件存储，看 [@aiao/rxdb-plugin-storage](../rxdb-plugin-storage/README.md)
