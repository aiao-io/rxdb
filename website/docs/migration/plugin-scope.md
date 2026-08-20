# 插件作用域契约迁移

插件拆卸从「插件自己记账 + `destroy()`」改成「宿主发作用域 + 逆序释放」。本页分两部分：**插件作者**需要改什么，**应用开发者**会观察到什么变化。

内置插件（`graph` / `storage` / `workspace` / `search`）已全部迁移，升级即可，无需改调用代码——但请通读下面「行为变化」一节。

## 插件作者

### 1. `install()` 接收作用域

```diff
-install() {
-  this.#channel = new BroadcastChannel('example');
-  this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
-}
+install(scope: LifecycleScope) {
+  scope.acquire(() => {
+    const channel = new BroadcastChannel('example');
+    this.#channel = channel;
+    return () => {
+      this.#channel = undefined;
+      channel.close();
+    };
+  }, 'example:channel');
+
+  scope.acquire(() => {
+    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
+    return () => this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
+  }, 'example:entity-create');
+}
```

拆开写不是风格问题：一次 `acquire()` 只能包**一步**可能抛错的获取，否则第二步抛错时第一步造出的资源不在清单里，宿主够不着。完整规则见[编写插件](../plugins/authoring.md)。

### 2. 删掉手写的 `rollback()`

`install()` 抛错时宿主会把已登记的部分逆序释放掉，再把原错误传播给 `connect()`。插件不要在自己的 catch 里做补偿性清理。

### 3. 声明 `lifecycle: 'scoped'`

```diff
 export class RxDBPluginExample extends RxDBPluginBase implements IRxDBPlugin {
+  readonly lifecycle = 'scoped' as const;
   readonly name: Uncapitalize<string> = 'example';
```

声明后宿主释放完作用域就收手，不再调用 `destroy()`。

### 4. 处理 `destroy()`

| 情况                                       | 做法                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| 清理动作已全部搬进作用域                   | 删掉 `destroy()`                                                      |
| 需要同时兼容旧宿主                         | 保留 `destroy()`，实现为 `this.#scope?.dispose()`，并标 `@deprecated` |
| 还需要复位插件自身状态（状态机、内部缓存） | 登记一条只做复位的作用域条目，仍然声明 `lifecycle`                    |

`destroy()` 未被移除，只是废弃：未声明 `lifecycle` 的插件仍会在作用域释放**之后**被调用一次。

**过渡期**：按[版本与 API 稳定性策略](../versioning.md)的废弃周期，`destroy()` 至少保留一个次版本（1.0 后为一个主版本周期），移除在破坏性版本中进行并记入迁移指南。过渡期内它的调用契约不变，第三方插件不必赶在本次升级里改完。

### 5. 构造函数只留注册期的事

发布 `rxdb.xxx` 这类摘不掉的身份属性留在构造函数；IndexedDB store、channel、订阅、监听器一律推迟到 `install()`。作用域不跨纪元复用，别把它存到实例字段上跨纪元读。

## 行为变化

以下都是有意的语义变更，升级后可直接观察到。

### 插件拆卸从并发改成逆序串行

`disconnectAll()` 过去用 `Promise.all` 并发调用各插件的 `destroy()`，现在按**逆插入序串行**拆卸。插件之间存在事实上的依赖（搜索插件的索引建在工作区插件的实体上），并发拆卸会让后装的插件在先装的插件已经拆到一半时还在读它。

影响：拆卸耗时变成各插件之和而非最大值。任一插件抛错只记日志、不短路，`disconnectAll()` 始终 resolve。

### 断开连接不再是插件的终态

`rxdb.workspace`、`rxdb.searchPlugin` 这类身份属性在断开连接后**依然存在**，重新 `connect()` 会进入新纪元并复用同一个插件实例。

过去需要「重建 `RxDB` 实例」才能恢复的场景，现在直接重连即可。

在两个纪元之间调用需要纪元资源的方法会拿到明确的错误，而不是永久失效：

```typescript
await db.disconnectAll();
await db.workspace.flush();
// Error: workspace plugin is not installed in the current connection epoch

await db.searchPlugin.ready;
// SearchError: plugin is destroyed — the connection epoch that installed it was released; await db.connect() again
```

`await db.connect()` 之后两者恢复可用。

两个插件的 `ready` 口径**不同**，别照着彼此推断：`searchPlugin.ready` 一个连接纪元一格，`connect()` 之前与安装期间 **pending**，成功 resolve、失败 reject 原始错误、纪元释放后 reject `destroyed`（如上）；而 `workspace.ready` 在未安装时直接 resolve——它只表示「首次 `install()` 已结算」，不是可用性判据。工作区的可用性由 `flush()` 这类方法自己抛错表达。

### `workspace.changes$` 不再在拆卸时 complete

插件实例跨纪元存活，它的流也就必须比任何一个纪元活得久。断开连接时 `changes$` 只是停止发射，不会 complete。

依赖 complete 信号收尾的订阅需要改用 `takeUntil` 之类的显式终止条件：

```diff
-db.workspace.changes$.subscribe({ next: onChange, complete: onTeardown });
+db.workspace.changes$.pipe(takeUntil(this.destroyed$)).subscribe(onChange);
```

框架绑定（Angular / React / Vue）已经按各自的组件生命周期退订，使用绑定的代码不受影响。

### 工作区资源获取失败改从 `install()` 抛出

IndexedDB 打开失败、BroadcastChannel 创建失败等过去发生在插件构造函数里，也就是 `use()` 调用点；现在推迟到 `install()`。错误从 `use()` 的位置转移到 `connect()`：

```diff
 const db = new RxDB({ /* … */ });
-try {
-  db.use(rxDBPluginWorkspace);
-} catch (err) { /* … */ }
+db.use(rxDBPluginWorkspace);
+try {
+  await db.connect();
+} catch (err) { /* … */ }
```

### 跨 tab 消息只在活纪元内投递

BroadcastChannel 按纪元建立和关闭。断开连接后的草稿增删不会广播给其他 tab，也不会抛错——静默跳过。需要跨 tab 同步就先确保连接是活的。

### `db.storage` 的可用窗口收窄到连接期间

存储服务过去在 `use()` 时就建好并一直挂着；现在它是纪元资源：`connect()` 装上、`disconnectAll()` 摘掉。

```diff
 db.use(rxDBPluginStorage);
-await db.storage.list();       // use() 之后即可用
+await db.connect();
+await db.storage.list();       // 连接期间才有
```

`db.storage` 的类型仍是非可选的 `RxdbFileStorage`——它描述的是**连接期间**的形态，也是唯一该碰它的时候。断开连接后属性会被删掉，此时读到的是 `undefined`，类型不会提醒你。断连后仍要跑的收尾逻辑（撤销 object URL 之类）要么放在 `disconnectAll()` 之前，要么自己先判空。

插件实例上的 `storage` 访问器则如实标成了可选：

```diff
-readonly storage: RxdbFileStorage;
+get storage(): RxdbFileStorage | undefined;
```

直接持有插件实例（而不是走 `db.storage`）的代码需要补一次判空。

同一个 RxDB 实例上装了两个 storage 插件实例时，后装的那个整个 `install()` 都是空操作——不再有 `#ownsStorage` 之类的记账，「谁装谁拆」由作用域保证。

## 相关

- [编写插件](../plugins/authoring.md)：完整契约与作用域用法
- [插件升级与启用](./plugins.md)：注册插件、标注实体元数据
