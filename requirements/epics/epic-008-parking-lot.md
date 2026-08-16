# Epic 008 之外 · 停车位

**登记日期**：2026-08-15  
**状态**：停车。不是故事，没有 AC，**先别做**。  
**来源**：对照 Cordis 读完 008 后划出的后续；并收口已标「Epic 008 外」的两项。

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

| #     | 建议                                                        | 值不值                         | 何时另开                                     | 为什么不在 008                             |
| ----- | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------- | ------------------------------------------ |
| P-001 | 按适配器名的就绪信号（内部已落地；公开流另开）              | ✅ **内部已落地**              | 015a 消费既有信号并补 epoch 重连；公开流另开 | 008 现在要的是消费与释放时序，不是再造信号 |
| P-002 | `afterAdapterReady` 钩子，**不**进 `#await_plugin_installs` | ❌ **动机不成立**              | 除非 015a 实测出新的死锁                     | 它要绕开的那个环今天不存在                 |
| P-003 | 插件 `Config` 用 Standard Schema 做运行时校验               | ⚠️ 可做，不急                  | 008 Done 之后，且真有热更新/HMR 需求         | 今天 options 是工厂闭包，没有热更          |
| P-004 | DevTools 画 scope / 插件状态树                              | ⚠️ 008 已推迟                  | 015 状态机稳定之后（结构数据源已就位）       | 没有稳定树就画，画的是谎言                 |
| P-005 | Provider → Repository 多库绑定                              | ✅ High，可与 008 **并行设计** | 独立故事，三框架一次交付                     | 作用域**可见性**，不是资源存活期           |
| P-006 | 不可变 `session` / `OperationContext`                       | ✅ 另立                        | 独立故事                                     | 可变实例字段，不是账本对称                 |
| P-007 | 多 `RxDB` 实例的词法隔离（entity-manager 动态栈）           | ❌ 现在                        | 有第二个真实调用方再开                       | 008 已否决 isolate；P-005 先解决 hook 选库 |

---

## P-001 按适配器名的就绪信号（内部已落地）

**问题**

旧问题是 [`connected$`](../../packages/rxdb/src/RxDB.ts) 只有全局布尔。本地连着、远端没连（或反过来）时，它不能表达某个
适配器是否可用。这个问题已经在 `RxDB.adapterConnected$(adapterName)` 落地：内部以
`#connected_adapters` + `BehaviorSubject<ReadonlySet<string>>` 为唯一真相，且在表结构、迁移和索引引导完成后、插件安装等待前置位。
Search 也已经改为等待 `adapterConnected$(localAdapterName)`，不再用聚合 `connected$` 猜本地就绪。

这对应 Cordis `Service.check` 的封闭版：依赖判定是按名字的**谓词**，而不是把整个连接状态当成布尔。

**P-001 剩余工作**

```ts
rxdb.adapterConnected$('local'); // 现有 API；只表示该适配器表结构已就绪
```

015a 不应再新增同义的 `adapterReady$`，而应消费现有信号，并在适配器局部断开时释放依赖插件、在新连接实例
出现时以新的 adapter epoch 重装。UI / DevTools 需要面向公开消费者的快照流时另开故事，不能把内部 `Set` 直接暴露。

**不要做成**

- 015a 把内部 `Set` 直接 `Object.defineProperty` 出去。
- 继续让插件 `firstValueFrom(connected$)`。它无法区分本地和远端。
- 用 `localAdapter$` 冒充就绪。实例存在 ≠ bootstrap 完成。

**状态**：内部信号已落地；公开快照流仍停车。015a 的价值从“新增信号”改为“消费信号 + 处理局部断连和 adapter epoch 替换”。

---

## P-002 `afterAdapterReady` 钩子 — 现在 ❌（动机不成立）

这个钩子的设想是：给一个**不进** `#await_plugin_installs` 的入口，让慢工作挂在适配器就绪之后、连接 Promise 之外。

```ts
// 示意，不是现行 API
rxdb.afterAdapterReady('local', async () => {
  /* FTS DDL */
});
```

**它要绕开的那个环今天不存在。**「search 的 `install()` 返回含 FTS DDL 的 Promise，`connect()` 又
`await` 所有 `#plugin_install_promises`，套上『install settle = active』会死锁」——次序不是这样。
`connect()` 在 `#connected_adapters.add` 与 `connected_sub.next(true)`
（[:442-443](../../packages/rxdb/src/RxDB.ts#L442-L443)）**之后**才 `await this.#await_plugin_installs()`（:445），
search 等的 `connected$` 此时已经是 `true`，没有环。

**它的收益同样不成立。** 今天 `await db.connect()` 返回即 FTS 可用，是用户可见保证；把 FTS 挪到连接
Promise 之外**会破坏它**。这条约束的正式落点是
[US-015 的 D2 附](../stories/core/US-015-plugin-inject-dependency.md)——015a **不拆** FTS，因此本条与
「`install()` 只做同步登记、FTS 走 `ready` / 后台」两边都不做。

只有 015a 实测发现「后台 Promise + `ready`」在四个插件里复制三遍时，才重开本条把慢路径收口。

**不要做成**

- 钩子回调再推进 `#plugin_install_promises`。那是换个名字的死锁。
- 插件作者同时写 `inject: ['adapter:local']` 和 `afterAdapterReady('local')`。双轨。
- 把 Cordis 的 async apply 当宿主模型——Cordis **没有人在外面 await 所有 LOADING**。RxDB 的 `connect()` 会。

**前置**：无。本条现在不做——`install()` 内只走 `bootstrapTransaction` / `rawQuery`、不改对外时序
这一点已由 [US-015 D2 附](../stories/core/US-015-plugin-inject-dependency.md) 定死。

---

## P-003 插件 Config + Standard Schema

**问题**

插件配置的运行时校验可后置，不应塞入 US-015。Cordis 用 Standard Schema + `intercept` 链合并配置。RxDB 的插件 options 是工厂闭包，`#freeze_config()` 冻的是**实例配置**，不是插件参数。没有 `fiber.update()`，没有 HMR。

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

Epic 原文已推迟：没有稳定作用域树就谈不上展示。015 的状态机（`waiting` / `installing` / `active` / `failed` / `disposing`）对外不可见时，DevTools 和 INV-5 的 warn 都只能打日志。

> **2026-08-16 第三轮 Cordis 复核更正**：原文写的「013 明确不提供全局注册表」被当成了本项的
> 数据源缺口，是**误判**。013 否掉的是**跨实例登记**（进程级 `WeakMap` / 全局 `Set`），
> 而画一棵树需要的是**从一个已知根往下读**——cordis 的 `getEffects()` 就只读本 fiber 自己的清单，
> `{ label, children }` 挂在 disposer 上，整个进程没有任何注册表。013 已据此补入
> `getEntries()`（AC#9b / D4），本项的**结构数据源不再缺**。剩下的唯一前置是 015 的状态机对外可见。

**另开之后做什么**

- 只读快照：scope `label` 树（直接用 013 的 `getEntries()`，从连接纪元作用域这个根往下读）
  \+ 插件名 + 状态 + 当前依赖 epoch。
- 宿主发诊断信号：`plugin:search` 进入 `waiting` / `failed`。不是 DI，是探针。
- 挂现有 [`@aiao/rxdb-devtools`](../../packages/rxdb-devtools) 通道，不新开一套协议除非版本化需要。

**不要做成**

- 为了面板去加进程级 `WeakMap<LifecycleScope>` / 全局 `Set` / 实例计数器。那是 013 的 Out of Scope，
  而且**用不着**：`getEntries()` 从一个已知根往下读就够（更正说明见上）。
- 在 014 的 `install(scope)` 里 `console.log` 充数。
- 画完再回头改状态机。先冻 015a/015b 的转移，再画。

**前置**：US-015 状态机落地（结构数据源已由 US-013 的 `getEntries()` + `label` 就位）。
US-016 把 `#event_initialized` 收进连接纪元之后，树才完整。

---

## P-005 Provider → Repository 多库绑定

**问题**

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

**问题**

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

| 想法                                      | 原因                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `@cordisjs/core` 当宿主                   | API 自己写了不稳定；RxDB 生命周期是 `init/connect/disconnect`，不是进程级插件树 |
| `Context` Proxy / `getTraceable` / `bind` | 上面已有 `EntityProxy`                                                          |
| `ctx.provide()` 任意服务表                | 015 INV-1                                                                       |
| HMR / `fiber.update()`                    | 重连已经是纪元                                                                  |
| `plugin()` 返回 thenable Fiber            | 会把 `await rxdb.use(...)` 锁进公开时序                                         |
| 把 `disconnect()` 的吞错改成硬失败        | 014 D5；用户可见行为                                                            |

---

## 和 008 交付顺序的关系

```text
013 → 014                               ← 硬序，Epic 的三处已知泄漏到此全部关闭
   → 015a                               ← 前置：015a/015b 两个 stub 先落盘
   → 015b / 016 / 017                   ← 015b/017 价值待证；016 价值已证但尚未切片

P-001            015a 消费既有 adapterConnected$，处理局部断连和 epoch 替换；公开流另开
P-002            ❌ 不做（动机不成立）
P-004            015 状态机 + 016 事件进纪元之后（016 已有症状，仍需切片）
P-005            可并行设计；实现最好等 017 的 owned/borrowed（017 本身价值待证）
P-003 / P-006    008 全部 Done 后再立故事
P-007            默认不做
```

> 注意：`015b` / `017` 仍在 Epic 与 status-overview 标为**价值待证**；`016` 已有可复现症状但故事文件仍未创建。
> 依赖它们的停车位条目（P-004 / P-005）因此**没有可预期的解锁日期**——
> 这不改变本文件的结论（都是「先别做」），但不要把上面的箭头读成排期承诺。

008 的编码门槛收敛为三条 AC 补写（全在 US-014 里），与本文件无关。本文件多一条实现 = 范围失控。
