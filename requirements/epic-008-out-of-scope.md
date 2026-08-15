# Epic 008 之外 · 停车位

**登记日期**：2026-08-15  
**状态**：停车。不是故事，没有 AC，**先别做**。  
**来源**：对照 Cordis 读完 008 后划出的后续；并收口第一轮已标「Epic 008 外」的两项。

对照：

- [Epic 008](epics/epic-008-lifecycle-scope.md)
- [第二轮评审](epic-008-lifecycle-scope-review-2.md)
- [第一轮评审](epic-008-lifecycle-scope-review.md)（Provider 绑定 / operation context）

---

## 这份文件是什么

008 的判据只有一条：资源获取与释放被拆成两处、靠人工保持对称。  
下面这些是读 008 时顺手看见的真问题，但**不是那条判据**。塞进 013～017 会把 Epic 撑破；现在立故事会假装它们已经排进迭代。

规则：

1. **不编号、不进 `status-overview`、不改任何 story 的 `status`。** 另开时从本文件抄进新故事，再删对应条目。
2. **015a 落地前，本文件里标「015a 之后再公开」的条目不得提前做成公开 API。**
3. **三框架仍必须一次交付。** 能并行的是设计，不是只修一端。
4. **不引入 Cordis / Proxy / `provide()` / HMR。** 这条对停车位同样生效。

---

## 总表

| # | 建议 | 值不值 | 何时另开 | 为什么不在 008 |
| - | ---- | ------ | -------- | -------------- |
| P-001 | 按适配器名的就绪 Observable，替换布尔 `connected$` | ✅ | 015a 的内部 `Set` 先冻死；公开流另开 | 008 要的是内部纪元，不是订阅表面 |
| P-002 | `afterAdapterReady` 钩子，**不**进 `#await_plugin_installs` | ✅ 与 S-002 二选一 | 015a 先定「install ≠ FTS」；钩子是另一种切法 | 再加一套入口会和 `inject` 双轨 |
| P-003 | 插件 `Config` 用 Standard Schema 做运行时校验 | ⚠️ 可做，不急 | 008 Done 之后，且真有热更新/HMR 需求 | 今天 options 是工厂闭包，没有热更 |
| P-004 | DevTools 画 scope / 插件状态树 | ⚠️ 008 已推迟 | 013～015 状态机与 `label` 稳定之后 | 没有稳定树就画，画的是谎言 |
| P-005 | Provider → Repository 多库绑定 | ✅ High，可与 008 **并行设计** | 独立故事，三框架一次交付 | 作用域**可见性**，不是资源存活期 |
| P-006 | 不可变 `session` / `OperationContext` | ✅ 另立 | 独立故事 | 可变实例字段，不是账本对称 |
| P-007 | 多 `RxDB` 实例的词法隔离（entity-manager 动态栈） | ❌ 现在 | 有第二个真实调用方再开 | 008 已否决 isolate；P-005 先解决 hook 选库 |

---

## P-001 按适配器名的就绪 Observable

**问题**

[`connected$`](../packages/rxdb/src/RxDB.ts) 是全局布尔。本地连着、远端没连（或反过来）时，它对 `adapter:local` / `adapter:remote` 给出假就绪。search 今天先 `firstValueFrom(connected$)` 再拿 `localAdapter$`，就是在手工逼近「这个适配器可用」。

015a 的正确内部形状是 `#connected_adapters` + `host.isDependencyReady('adapter:local')`（Cordis `Service.check` 的封闭版）。那是**谓词**，不是流。

**另开之后做什么**

```ts
rxdb.adapterReady$('local')   // Observable<boolean>，按名字，不是全局
```

让 UI / DevTools / 非插件代码也能订阅，不必每个调用方自己 `filter` 那个布尔。

**不要做成**

- 015a 把内部 `Set` 直接 `Object.defineProperty` 出去。
- 继续让插件 `firstValueFrom(connected$)`。那是 search 死锁的一半。
- 用 `localAdapter$` 冒充就绪。实例存在 ≠ bootstrap 完成（第一轮 R-001，已吸收）。

**前置**：015 D2 / 015a 的 `Set` 先成为唯一真相。没有内部纪元，公开流只是把错判据订阅化。

---

## P-002 `afterAdapterReady` 钩子

**问题**

S-002：search 的 `install()` 今天返回包含 FTS DDL 的 Promise。`connect()` 又 `await` 所有 `#plugin_install_promises`。套上「install settle = active」会死锁。

015a 的主切法：`install()` 只做同步登记，FTS 走 `ready` / 后台。  
另一刀：给一个**不进** `#await_plugin_installs` 的钩子，让慢工作挂在适配器就绪之后、连接 Promise 之外。

```ts
// 示意，不是现行 API
rxdb.afterAdapterReady('local', async () => { /* FTS DDL */ })
```

**二选一，不要两套。** 015a 若已经把 FTS 从 `install()` 拆走，这个钩子没有独立价值。015a 若发现「后台 Promise + `ready`」在四个插件里复制三遍，再开本条把慢路径收口。

**不要做成**

- 钩子回调再推进 `#plugin_install_promises`。那是换个名字的死锁。
- 插件作者同时写 `inject: ['adapter:local']` 和 `afterAdapterReady('local')`。双轨。
- 把 Cordis 的 async apply 当宿主模型——Cordis **没有人在外面 await 所有 LOADING**。RxDB 的 `connect()` 会。

**前置**：S-002 在 015a 里先有书面选择。本条是备选切法，不是第三套。

---

## P-003 插件 Config + Standard Schema

**问题**

第一轮已写「插件配置运行时校验，可后置，不应塞入 US-015」。Cordis 用 Standard Schema + `intercept` 链合并配置。RxDB 的插件 options 是工厂闭包，`#freeze_config()` 冻的是**实例配置**，不是插件参数。没有 `fiber.update()`，没有 HMR。

**另开的判据（缺一条就先别做）**

- 真有人要在运行时改插件配置并热生效；或
- 插件 options 从闭包变成可序列化对象（DevTools / 远程诊断需要看见它）。

只为「和 Cordis 对齐」做校验 = 给没有更新路径的对象加 schema。

**不要做成**

- 015 的 `inject` 顺手解析配置。依赖图和配置校验无关。
- 动态 `provide('config', …)`。INV-1。
- 把 `@cordisjs/core` 的 Config 类型引进来。

---

## P-004 DevTools 画 scope / 插件状态树

**问题**

Epic 原文已推迟：没有稳定作用域树就谈不上展示。013 明确不提供全局注册表。015 的状态机（`waiting` / `installing` / `active` / `failed` / `disposing`）对外不可见时，DevTools 和 INV-5 的 warn 都只能打日志。

**另开之后做什么**

- 只读快照：scope `label` 树 + 插件名 + 状态 + 当前依赖 epoch。
- 宿主发诊断信号：`plugin:search` 进入 `waiting` / `failed`。不是 DI，是探针。
- 挂现有 [`@aiao/rxdb-devtools`](../packages/rxdb-devtools) 通道，不新开一套协议除非版本化需要。

**不要做成**

- 013 为了面板加进程级 `WeakMap<LifecycleScope>`。那是 013 的 Out of Scope。
- 在 014 的 `install(scope)` 里 `console.log` 充数。
- 画完再回头改状态机。先冻 015a/015b 的转移，再画。

**前置**：US-013 `label` + US-015 状态机落地。US-016 把 `#event_initialized` 收进连接纪元之后，树才完整。

---

## P-005 Provider → Repository 多库绑定

**问题**（第一轮原文，维持）

基础查询 hook 通过 Entity 静态方法找 Repository，不读 Provider 里的 RxDB。`makeRxDBProvider()` 能隔离 context，却不能让 `useFind()` 等选择对应数据库。

这是作用域**可见性**，不是资源存活期。008 排除它是对的。

**另开必须交付**

- 同一 Entity class 同时注册两个 RxDB；
- 两个 Provider 子树分别查自己的 Repository；
- Angular / React / Vue 同功能同 API；
- Entity 静态 API 保留为单库快捷入口，多实例时继续 fail-fast。

**不要做成**

- 塞进 US-017。017 是 owned / borrowed 与 `dispose()` 谁来调，不负责 hook 怎么找到实例。
- 只修 React。单端缺失 = 未完成。
- Cordis `isolate` / 词法影子。那是另一套运行时。

**与 P-007 的关系**：P-005 先让 hook 看见「当前子树的 RxDB」。P-007 是 entity-manager 动态栈要不要变成词法隔离——P-005 做完再看栈还是不是问题。

可与 008 **并行设计**，不要并行假装已经有 017 的所有权模型。没有 owned/borrowed，多库 hook 会在卸载时拆错实例。

---

## P-006 不可变 session / OperationContext

**问题**（第一轮原文，维持）

`rxdb.context = { userId }` 是全实例可变状态。写入、事务、同步若读这个字段，并发操作会互相踩。

**另开方向**

`db.session(context)` 或显式 `OperationContext`，在事务、写入、同步入口快照并向下传。`clientId` 与业务身份拆开，由引擎内部持有。

**不要做成**

- 008 的连接纪元 scope 里塞一份可变 `context`。scope 管寿命，不管请求身份。
- Proxy 追踪谁读了 `userId`。Epic 已否决 Proxy。
- 和 P-005 捆成一个故事。选库 ≠ 选用户。

---

## P-007 多实例词法隔离 — 现在 ❌

**问题**

Cordis 用 `isolate` + 原型影子让同一服务名在不同 Context 上指向不同实现。RxDB 的 entity-manager 是动态栈。多个 `RxDB` 实例并存时，静态 Entity API 靠栈顶，不是靠词法。

**为什么现在不值**

- 008 非目标写明「词法多实例隔离」。
- P-005 才是用户能踩到的洞（hook 选错库）。
- 没有第二个「必须靠词法、不能靠 Provider」的调用方之前，isolate 是把 Context 树搬进来。

有真实调用方（例如同一组件树外的静态 `Entity.find()` 必须绑死某一个实例，且 Provider 够不着）再开。开的时候仍禁止引入 `@cordisjs/core`。

---

## 明确继续拒绝（连停车位都不收）

| 想法 | 原因 |
| ---- | ---- |
| `@cordisjs/core` 当宿主 | API 自己写了不稳定；RxDB 生命周期是 `init/connect/disconnect`，不是进程级插件树 |
| `Context` Proxy / `getTraceable` / `bind` | 上面已有 `EntityProxy` |
| `ctx.provide()` 任意服务表 | 015 INV-1 |
| HMR / `fiber.update()` | 重连已经是纪元 |
| `plugin()` 返回 thenable Fiber | 会把 `await rxdb.use(...)` 锁进公开时序 |
| 把 `disconnect()` 的吞错改成硬失败 | 014 D5；用户可见行为 |

---

## 和 008 交付顺序的关系

```text
013 → 014 → 015a → 015b → 016 → 017     ← 只做这些

P-001 / P-002    015a 书面选择之后才谈公开 / 第二刀
P-004            015 状态机 + 016 事件进纪元之后
P-005            可并行设计；实现最好等 017 的 owned/borrowed
P-003 / P-006    008 全部 Done 后再立故事
P-007            默认不做
```

008 编码门槛仍是第二轮的 S-001～S-005，与本文件无关。本文件多一条实现 = 范围失控。
