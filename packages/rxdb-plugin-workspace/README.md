# @aiao/rxdb-plugin-workspace

RxDB Workspace 插件为**尚未入库的 NEW 实体草稿**提供本地恢复能力：草稿保存在内存和 IndexedDB 中，并通过 BroadcastChannel 同步同源标签页。刷新或重开页面后，草稿会自动恢复，可继续编辑、保存或丢弃。

> 范围：只覆盖 NEW 草稿。已存在实体的未保存 UPDATE、回滚到编辑前状态、DELETE 撤销均**不在**本插件范围内，详见「已知限制」。

## 当前语义

- 监听 NEW 事件并缓存完整草稿，不写主表。
- NEW 草稿的顶层属性后续变化会重新排队，恢复或跨标签页收到的 entity ref 也遵循同一规则。
- `entity.save()`（CREATE）、REMOVE 或 `discard()` 会清理对应草稿。
- `install()` 会自动读取 IndexedDB；已注册 EntityType 的草稿会恢复为 entity ref，尚未注册类型的草稿仍保留在 `list()` 中。首次读取失败会让 `ready` reject，修复环境后可再次调用 `install()` 重试。
- `list()` 返回基于 `structuredClone()` 的深快照，不与内部缓存共享嵌套引用；草稿含不可克隆值时同步抛 `DataCloneError`。
- `flush()` 是 IndexedDB 写入屏障。底层写入失败时会 reject 并恢复待写/待删集合，不会在后台无限重试；修复环境后再次显式调用即可重试。不可克隆草稿会以 `WorkspaceFlushError.cacheIds` 点名，其他可克隆草稿照常落盘。
- `changes$` 在草稿、暂存状态或可观测错误变化时发出通知。`corruptedEntries` 同时包含无法解码的 IndexedDB 记录和当前跨标签页同步错误；后者在同步恢复后自动清除。

## 安装

```bash
pnpm add @aiao/rxdb-plugin-workspace @aiao/rxdb
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

// 列出全部草稿（刷新后仍在）
const drafts = db.workspace.list();

// 保存到主表：草稿自动移出缓存
await todo.save();

// 或丢弃草稿
db.workspace.discard(drafts[0].cacheId);

await db.workspace.flush();
```

`autoSave` 默认为 `true`。设为 `false` 后，事件仍会更新内存队列和跨标签页状态，但不会自动写 IndexedDB；调用方必须在需要持久化时执行 `await db.workspace.flush()`。

## 生命周期与单实例

一个 `RxDB` 实例在整个生命周期内只允许一个 workspace 实例：

- 对同一数据库重复调用 `rxDBPluginWorkspace(db)` 会返回已安装实例，不会增加监听器。
- 直接重复调用内部构造函数（`new RxDBPluginWorkspace(db)`，未从包入口导出）会在注册监听器前抛错。
- 第一次安装时传入的 options 在该数据库生命周期内有效，后续重复 factory 调用不会替换配置。

### 连接纪元

本插件声明 `lifecycle: 'scoped'`：IndexedDB store、BroadcastChannel、刷盘订阅与实体监听器全部按**连接纪元**登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时由宿主逆序释放。

- 插件身份 `db.workspace` 在构造时发布，摘不掉，**跨纪元存活**。断开连接不是终态，重新 `connect()` 会复用同一实例并进入新纪元。
- 两个纪元之间调用需要纪元资源的方法会抛 `workspace plugin is not installed in the current connection epoch`；`await db.connect()` 后恢复可用。
- `changes$` 比任何一个纪元活得久：断开连接时只停止发射，**不会** complete。
- 拆卸不隐式 `flush()`，未落盘变更会被丢弃，已挂起的 `flush()` 随之 reject。
- `destroy()` 已废弃，仅作为释放同一作用域的手动入口保留；宿主不会调用它。

正常使用应通过 `db.use(rxDBPluginWorkspace, options)` 让 RxDB 管理安装与拆卸。

## 浏览器、SSR 与持久化边界

插件依赖浏览器的 `crypto.randomUUID()`、`structuredClone()` 和 IndexedDB；BroadcastChannel 可用时才启用跨标签页同步。这些资源全部在 `install()`（即 `db.connect()`）时获取，构造插件本身不碰它们——因此不要在 SSR 渲染阶段连接数据库，应在浏览器 hydration 后再 `connect()`。

IndexedDB 中的 workspace 数据是草稿副本，不是数据库事务日志。断开连接、浏览器清理站点数据或存储配额错误都可能使未刷盘数据丢失。关键流程必须显式 `await flush()`。

## 通信与数据安全

BroadcastChannel 不是鉴权或授权边界。任何同源执行上下文只要知道数据库名称，就可能向 workspace channel 发送 add/remove 消息。应用必须依赖可信 origin、CSP 和自身权限模型，不能把该通道当作安全控制。

草稿无法结构化克隆时，插件会保留本地草稿、跳过该次广播并通过 `corruptedEntries` / `changes$` 报告，不会中断 RxDB 的后续事件监听器。

插件不会加密草稿，也不会过滤敏感字段。草稿会以应用提供的结构写入 IndexedDB，并可能通过同源 BroadcastChannel 传输。不要把不应落盘或不应暴露给同源脚本的数据放入 workspace 草稿。

## 已知限制

- **既有实体的未保存 UPDATE 暂存：未支持。** 插件只为 NEW 草稿订阅其 `EntityStatus.patches$`；实体成功 CREATE 后就退出 workspace，之后的未保存 UPDATE 不在本插件范围内。
- **嵌套对象原地修改：不触发变更跟踪。** RxDB Entity Proxy 只拦截顶层属性赋值。`draft.meta.nested.value = 'x'` 不会重新排队；应构造新值并重新赋给顶层字段，例如 `draft.meta = { ...draft.meta, nested: { value: 'x' } }`。
- **公开 restore/rollback：未支持。** NEW 草稿会在安装时自动恢复，但现有实体的回滚需要完整 base/inverse patch 数据模型，并依赖上述未保存 UPDATE 入口。
- **DELETE 撤销：未支持。** REMOVE/CREATE 目前只负责清理 NEW 草稿，不保存被删实体快照。

因此当前包不能作为完整的 Git 式 entity workspace。需要既有实体 UPDATE 暂存或回滚的调用方应使用单独的数据模型，不应依赖本插件的 NEW 草稿缓存。

## 已移除 API

`stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 与 `WorkspaceCacheEntry.staged` 是早期 Git 式暂存流程的遗留导出，已在 `0.0.24` 删除。

这些 API 没有等价替代：它们承载的“既有实体 UPDATE 暂存 / 提交”能力本就不在本插件范围内（见上一节能力边界）。当前公开面只有 NEW 草稿缓存（`list()` / `discard()`）、变更监听（`changes$`）与自动保存（`autoSave` / `flush()`）。仍依赖旧暂存语义的调用方需要自建数据模型。
