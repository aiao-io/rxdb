# Epic 008 生命周期作用域 · 第二轮评审

**评审日期**：2026-08-15  
**对照对象**（现行文本，不是第一轮当时的草稿）：

- [Epic 008](epics/epic-008-lifecycle-scope.md)
- [US-013 LifecycleScope](stories/core/US-013-lifecycle-scope-primitive.md)
- [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md)
- [US-015 插件依赖声明（父契约）](stories/core/US-015-plugin-inject-dependency.md)
- 源码：[`RxDB.ts`](../packages/rxdb/src/RxDB.ts)、四个插件包

**与第一轮的关系**：[第一轮](epic-008-lifecycle-scope-review.md) 的 R-001～R-008 **已被现行故事吸收**，不再构成开工阻塞。本文件是对照修订后文本 + 当前源码的独立裁决。不要把第一轮当作「现在能不能写代码」的判据。

---

## 结论

🟡 **方向正确，第一轮阻塞项大多已吸收；编码前仍被文档完整性与三处时序窗口挡住。**

`US-013 → US-014 → US-015a → US-015b → US-016 → US-017` 的顺序成立，不应交换。原语命名、`lifecycle: 'scoped'`、就绪 = 可用、安装失败回收、作用域三层、不公开 `unregisterRepository()`——这些已经写进故事，不必再吵。

但现行文本还不能直接扔给实现：

1. US-015a / US-015b / US-016 / US-017 **被到处引用，文件不存在**。US-012 拆分当天就写出了子故事；US-015 只改了父标记。这是文档完整性失败，不是风格问题。
2. search 的 `install()` 今天返回的是包含 FTS DDL 的 Promise。若 US-015a 把「`install()` settle = active」套上去，[search 已踩过的死锁](../packages/rxdb-plugin-search/src/plugin.ts#L351-L372) 会原样回来。
3. [US-014 AC#3](stories/core/US-014-plugin-scope-contract.md) 冻结「`init()` 后 `use()` 立刻安装」；[US-015 INV-4](stories/core/US-015-plugin-inject-dependency.md) 禁止依赖未就绪的插件进入 `#plugin_install_promises`。两套测试会互相咬。
4. storage / workspace 的**构造期资源是终态销毁**。只把 `defineProperty` 挪进 `install(scope)`，重连仍拿到已 `destroy()` 的空壳。
5. `init()` 在 `#install_plugin()` 之后才跑 schema/entity；失败只把 `#rxdb_initialized` 拨回 `false`，已安装插件不回滚。连接纪元作用域若在 `init()` 创建，这条路径会泄漏。
6. Epic / status-overview / README 仍写 `EffectScope`、旧文件名、把 US-015 当可交付故事、声称 US-016/017 尚无认领。

**输出**：⚠️ 需先补文档再编码。US-013 的 18 条 AC 本身可以开测；US-014 不能在 2～5 未冻结时开工。

---

## 决策

| 维度     | 判断                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 数据结构 | `LifecycleScope` 清单 + 连接纪元 / 插件激活两层，比九份手工账本干净                           |
| 特殊情况 | search 死锁、storage 构造期终态、`init()` 失败半装、`use()` 与就绪竞态——全是现有代码里的洞    |
| 复杂度   | 原语小；014 是一套机制四个调用点；015 拆成 a/b 正确。缺的是切片文件，不是再加一层抽象         |
| 破坏性   | 014 走废弃周期、零编译破坏，成立。015 改调度后 `use()`/`connect()` 时序会变，必须显式承认     |
| 实用性   | 修的是真泄漏（graph 空 `destroy`、storage 断连丢属性），不是为了「更函数式」                  |
| ENFP     | 不要在评审里顺手实现；不要把 016/017 塞进 014                                                 |

**裁决**：✅ 值得做。❌ 现在还不能按现行 AC 直接写 014/015。⚠️ 先补子故事、冻死锁窗口、冻构造期资源寿命。

---

## 第一轮吸收对照

| 编号  | 原问题                                       | 现行落点                                                                 | 状态    |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| R-001 | `localAdapter$` 当就绪                       | US-015 D2：`#connected_adapters.add` 之后                                | ✅ 已吸收 |
| R-002 | `inject` 被 `Uncapitalize<string>` 掏空      | US-015 D1：`'adapter:*' \| \`plugin:${Uncapitalize<string>}\``           | ✅ 已吸收 |
| R-003 | scope active ≠ 插件 active                   | US-015 状态机：只有 `active` 满足依赖                                    | ✅ 已吸收 |
| R-004 | 安装半途失败无回收                           | US-014 AC#12～#15                                                        | ✅ 已吸收 |
| R-005 | 没分层                                       | US-014 D3：注册期 / 连接纪元 / 插件激活                                  | ✅ 已吸收 |
| R-006 | 公开 `unregisterRepository()`                | US-014 D2：`repository(name, config, scope?)`，撤销不进公开表面          | ✅ 已吸收 |
| R-007 | 双版本双清                                   | US-014 D6 + AC#4：`lifecycle: 'scoped'`                                  | ✅ 已吸收 |
| R-008 | US-015 不 Small                              | 父故事 + 计划拆 015a/015b                                                | ⚠️ 只写了声明 |

命名 `LifecycleScope` / `acquire` / `AbortSignal` / 手动 disposer 先摘除——US-013 D1/D4/AC#16 已冻结。不必重审。

---

## 必须修正

### S-001 死链：子故事与后续故事文件不存在

**现状**

下列路径被 US-014 / US-015 / 实现约束反复链接，**仓库里没有对应文件**：

| 被引用                                                     | 实际                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `stories/core/US-015a-adapter-dependency-epoch.md`         | 不存在                                                               |
| `stories/core/US-015b-plugin-dependency-graph.md`          | 不存在                                                               |
| `stories/core/US-016-connection-scope-shutdown.md`         | 不存在                                                               |
| `stories/core/US-017-framework-host-scope.md`              | 不存在                                                               |
| Epic / status / README 的 `US-013-effect-scope-primitive.md` | 文件已改名为 [`US-013-lifecycle-scope-primitive.md`](stories/core/US-013-lifecycle-scope-primitive.md) |

对照：[US-012](stories/core/US-012-field-semantic-metadata.md) 降为父故事的**同一天**写出了 012a/b/c。US-015 复制了父故事体例（`parent-story`、INV、子表），但子文件为零。

[status-overview.md](status-overview.md) 口径写「包含 2 个 📄 父故事（US-012、US-306）」。US-015 已被标成父故事，却仍按可交付 Backlog 计数；Backlog 17 / 实际切片 15 这两行现在是错的。

Epic 目标第 4、5 条仍写「尚无故事认领」，同时 014/015 已经把工作派给 US-016/017。

**风险**

实现者按链接去找 AC，找不到就自己发明切片。015a 的死锁窗口、016 的 shutdown 边界会在 014 里被顺手「顺便做掉」——014 的 INVEST Small 立刻破产。

**修正**

编码前至少写出四个 stub（可以先短：范围、非目标、依赖、空 AC 表），并同步：

- Epic：改名 `LifecycleScope`、链接新文件名、故事列表加上 015a/015b/016/017，删掉「尚无认领」
- status-overview：US-013 文件名；US-015 标 📄；父故事计数 2 → 3
- [README.md](README.md) P1 行：`EffectScope` → `LifecycleScope`；交付物里的 `unregisterRepository()` 删掉（R-006 已否决，这行还活着）

### S-002 search：`install()` 返回值 ≠ 适配器就绪后的 FTS

**现状**

[`plugin.ts` `install()`](../packages/rxdb-plugin-search/src/plugin.ts#L144-L160) **立刻返回**的是 `#runInstall()` 那条 Promise，不是「同步登记完毕」。`#runInstall` 自己写明死锁形状（[:351-372](../packages/rxdb-plugin-search/src/plugin.ts#L351-L372)）：

```text
connect() 还卡在 #await_plugin_installs
  → search.install() 等 connected$ / 再走 adapter.rawQuery
  → rawQuery / repo.find 的 ready() 再等 connect()
  = 等自己
```

所以今天 `install()` 必须在 FTS 之前返回；真实工作进后台，对外用 `ready`。注释把 `bootstrapTransaction` 当逃生舱，正是因为 `connected$ === true` 之后 `connect()` 还没从 `#await_plugin_installs` 出来。

US-014 实现约束写「SearchPluginPhase 不强制删除，安装态留给 015a」——对。  
US-015 INV-2 写「插件就绪 = `install()` 完成」、INV-4 写「只有已启动的安装才进 `#plugin_install_promises`」。

两句合在一起，015a 的自然实现是：

```text
adapter ready → 调 search.install(scope) → 把返回的 Promise 放进 #plugin_install_promises
→ connect() await 它 → #runInstall 再等 connect()
```

死锁回来。`bootstrapTransaction` 挡不住：INV-2 会逼着宿主等 FTS 完才标 `active`。

**修正**

在 **US-015a**（没有文件就先写进 US-015 父契约）钉死三截寿命：

| 阶段 | 谁负责 | 进不进 `#plugin_install_promises` | 算不算 `active` |
| ---- | ------ | -------------------------------- | --------------- |
| 同步登记（事件监听、`acquire` 条目） | `install(scope)` 同步段 | 仅这一段的 Promise（应立即 settle） | 否，此时还不能 `search()` 出引擎 |
| 适配器引导完成 | 宿主调度，INV-4 | 不把「等适配器」登记成安装 | 否 |
| FTS DDL / backfill | 适配器就绪**之后**的后续工作 | **不准**进 `#plugin_install_promises` | 对外 `ready` 仍表示这一段；`active` 是否等于 `ready` 必须单独立裁 |

推荐裁决（写进 015a，不要留给实现期）：

- `install(scope)` **只做同步登记**，返回 `void` 或已 settle 的 Promise。
- FTS 挂在 `adapter:local` 就绪之后的独立任务上，仍由现有 `ready` getter 暴露。
- 插件 `active`（可被 `plugin:*` 依赖）= `install()` 成功，**不等于** `ready`。依赖 search 引擎的调用方继续 `await searchPlugin.ready`。
- 遗留 `SearchPluginPhase` 可以缩，但不能把 `ready` 偷换成「install Promise」。

没有这条，015a 一开工就会在 search 上红。

### S-003 US-014 AC#3 与 US-015 INV-4 冲突

**现状**

[US-014 AC#3](stories/core/US-014-plugin-scope-contract.md)：`init()` 之后 `use()` → **立即安装**，并参与下次 `#shutdown()`。这是今天的行为（[`RxDB.use` :338-349](../packages/rxdb/src/RxDB.ts#L338-L349)）。

[US-015 INV-4](stories/core/US-015-plugin-inject-dependency.md)：依赖未满足的插件**不得**进入 `#plugin_install_promises`。`init()` 只做了 `getAdapter` 级别的名字推送（[:193-195](../packages/rxdb/src/RxDB.ts#L193-L195) / `init()` [:271-294](../packages/rxdb/src/RxDB.ts#L271-L294)），**没有** `connect()`，本地适配器此时不可用。

因此：`init()` 后、`connect()` 前 `use(search)`——014 的测试要求立刻 `install()`；015 的测试要求它进 `waiting`。两边都能写绿自己、弄红对方。

**修正**

US-014 AC#3 加一句冻结（推荐）：

> 本故事保持升级前语义：`init()` 后 `use()` 仍立即 `install(scope)`。  
> [US-015a](stories/core/US-015a-adapter-dependency-epoch.md) **会改这条路径**：声明了 `inject` 且依赖未就绪时改为 `waiting`，不进 `#plugin_install_promises`。  
> 本故事的回归测试不得把「无 `inject` 的旧插件立即安装」写成「所有插件立即安装」。

014 的测试夹具用**无 `inject`** 的四个仓库内插件（search 在 014 阶段也还没有 `inject`）。015a 再加「带 `inject` 的 `use()` 必须等」。

### S-004 storage / workspace：构造期对象是终态

**现状**

[storage `constructor` :34-39](../packages/rxdb-plugin-storage/src/plugin.ts#L34-L39) 在 `use()` 时：

1. `new RxdbFileStorage(...)`（或复用已有）
2. `Object.defineProperty(rxdb, 'storage', …)`

[`RxdbFileStorage.destroy()`](../packages/rxdb-plugin-storage/src/storage.service.ts#L822-L832) 是终态：`#lifecycle = 'destroyed'`，之后 `assertActive()` 全抛。`#plugin_map` 按工厂缓存实例（[:339-343](../packages/rxdb/src/RxDB.ts#L339-L343)），重连**不会**再跑构造器。

US-014 AC#9 示例只把 `defineProperty` + `entities.push` 搬进 `install(scope)`，disposer 里 `await this.storage.destroy()`。下一轮 `install` 会把**同一份已销毁的** `this.storage` 再挂回去。属性在，对象死了。今天的泄漏形状换了一件衣服。

workspace 同类：[构造器](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L246-L283) 打开 IndexedDB、BroadcastChannel、`#taskSubscription`、实体监听；[destroy :403-437](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L403-L437) `close()` store / channel。`workspace` 属性还是 `configurable: false`（注册期，D3 已排除）。但 store/channel/订阅若仍在构造器申请、在拆卸时关掉，重连后的 `install()` 只做 IndexedDB restore，对着已 close 的 store 写。

**修正**

US-014 加一条寿命不变式，AC#9 / AC#11 按它改：

> **`use()` / 构造器只创建插件对象。每个连接纪元的资源在 `install(scope)` 里 `acquire`。`dispose` 之后同一插件实例必须能再 `install` 出一套活资源。**  
> 终态 `destroy()` 的服务（`RxdbFileStorage`、workspace store/channel）要么每纪元 `new` 一份，要么提供非终态的 `reset`——推荐每纪元新建，少一条状态机。

`#ownsStorage` 的「是不是我 new 的」由「是不是我这个作用域 `acquire` 的」代替，与现有 D 叙述相容，只是必须把 `new RxdbFileStorage` 一并移进 `install`。

### S-005 `init()` 失败不回滚已安装插件

**现状**

[`init()` :271-294](../packages/rxdb/src/RxDB.ts#L271-L294)：

```text
#rxdb_initialized = true
#install_plugin()          ← 在 try 外，故意的
try { schema / entity / version / gateway / events }
catch { #rxdb_initialized = false; throw }
```

注释写明：插件错误留给 `connect()`；schema 失败只回滚管理器。今天已经是「插件装了、实例却声称未 init」。再 `init()` 会再跑一遍 `#install_plugin()`——search 会再绑一套监听，graph 会再 `repository()` 覆盖。

US-014 要把连接纪元作用域放在 `init()` 创建（D3、AC#16）。这条失败路径若不 `dispose` 纪元作用域：

- 作用域还 `active`，清单里挂着半套插件条目；
- `#rxdb_initialized === false`，下次 `init()` 再 `child()` / 再 `install`；
- 或者反过来：作用域已脏，第二次 `acquire` 行为未定义。

**修正**

US-014 增加 AC：

> `init()` 在 `#install_plugin()` 之后的任一步抛错：连接纪元作用域必须 `dispose`（已登记插件逆序释放），然后才把 `#rxdb_initialized` 置回 `false`。再次 `init()` 拿到的是全新纪元，无双份监听 / 双份 repository。

这不是 016 的活。016 收的是 `#shutdown()` 那 8 处复位；这里是 014 自己把 scope 放进 `init()` 之后必须补的对称失败路径。

### S-006 Epic / 索引与故事不一致

**不只是文案。** 实现者若从 Epic 读起，会造一个 `EffectScope` 类，连错文件，并把 016/017 当成「可以不做」。

最低限度（与 S-001 一起改）：

| 文件 | 现在 | 应改为 |
| ---- | ---- | ------ |
| [epic-008](epics/epic-008-lifecycle-scope.md) | `EffectScope`、旧 US-013 路径、故事只有 013/014/015、016/017「尚无认领」、非目标写「封闭枚举」 | `LifecycleScope`、新路径、列出 015a/b + 016 + 017、非目标改为「封闭依赖类别」 |
| [status-overview](status-overview.md) | `US-013-effect-scope-primitive.md`；015 当交付项；「封闭枚举」 | 新文件名；015 标 📄；父故事 2 → 3 |
| [README P1](README.md) | EffectScope；014 交付物含 `unregisterRepository()` | LifecycleScope；交付物与 US-014 D2 对齐 |

Epic 非目标「封闭枚举」与 US-015 D1 的实测表也不一致：`` `plugin:${Uncapitalize<string>}` `` 在类型上仍接受几乎任意小写串，真正关掉的是**类别**（必须带 `adapter:` / `plugin:` 前缀）。第一轮 R-002 的精神在，用词没跟上。

---

## 次要（不挡 013，应在 014/015a 文本里顺手钉）

### N-001 `#destroy_plugin` 的 `Promise.all`

[:757-767](../packages/rxdb/src/RxDB.ts#L757-L767) 今天并行 `destroy()`。US-014 AC#1 要求逆序串行，实现约束也写了替换 `Promise.all`。不要留「旧插件并行、新插件串行」的双路径——旧插件的 `destroy()` 也按插入逆序串行调。AC#5 的「先释放空 scope，再 `destroy()`」已经暗示这一点，补一句即可。

### N-002 disposing / `#shutdown` 期间的 `use()`

没有 AC。`#shutdown()` 先 `#destroy_plugin()`，最后才 `#rxdb_initialized = false`（[:597-613](../packages/rxdb/src/RxDB.ts#L597-L613)）。窗口内 `use()` 仍走「已 init → 立即安装」。加上：

> `disposing` / `#shutdown()` 进行中：`use()` 只登记到 `#plugin_map`，不启动 `install`；下一纪元 `init()` 再装。

013 的 AC#5（非 active 时 `acquire` 抛错）是原语层；这里是宿主调度层，013 管不着。

### N-003 `init()` 与 `#runIsolated` 的错误口径

US-013 AC#9：单错原样抛，多错 `AggregateError`。[`#runIsolated` :571-585](../packages/rxdb/src/RxDB.ts#L571-L585) 只留首错、同步、不短路。故事已承认这是有意的 D5，不是疏漏。评审不反对。实现时不要把 `#runIsolated`「升级」成 AggregateError——那是另一条用户可见路径（事务事件）。

### N-004 config freeze

`entities` 在 [`LIVE_BEHAVIOUR_CONFIG_KEYS`](../packages/rxdb/src/RxDB.ts#L58)，`push` / `splice` `StorageFileMeta` 合法。014 示例不用改。不要有人「顺便」把 `entities` 冻死。

### N-005 graph 的 `rxdb.graph` 从未赋值

[`plugin.ts` 模块扩增](../packages/rxdb-plugin-graph/src/plugin.ts#L37-L40) 声明了 `rxdb.graph`，`install()` 只 `repository()`，属性从未挂上。这是 US-503 遗留，**不要**塞进 008，除非单独开缺陷故事。014 只修 repository 泄漏（AC#7）。

### N-006 覆盖率

US-013 `@aiao/utils` ≥ 80%，US-014 `@aiao/rxdb` ≥ 90%、四插件 ≥ 80%。与仓库档位一致，保持。

### N-007 US-015 INVEST Independent

父故事勾了 Independent，却依赖 014。与 US-012 父故事同一口径，可接受——前提是 015 **不再被当成可交付 Backlog**（回到 S-001）。

---

## 源码对照：九处账本还在

Epic「现状」表与代码一致，没有写过时。实现前用这张表防范围漂移：

| # | 位置 | 014 是否动 | 015+ 是否动 |
| - | ---- | ---------- | ----------- |
| 1 | [`#shutdown` :597-613](../packages/rxdb/src/RxDB.ts#L597-L613) 八处复位 | 只释放连接纪元容器 | 016 把复位迁进 scope |
| 2 | [`#event_initialized` :142](../packages/rxdb/src/RxDB.ts#L142) | 不动 | 016 |
| 3 | [`#plugin_install_promises` :118](../packages/rxdb/src/RxDB.ts#L118) | 不动记账（Out of Scope） | 015a 调度必须遵守 INV-4 |
| 4 | [storage `#ownsStorage` / `#registeredEntity`](../packages/rxdb-plugin-storage/src/plugin.ts#L19-L20) | 删掉，见 S-004 | — |
| 5 | [search `SearchPluginPhase`](../packages/rxdb-plugin-search/src/plugin.ts#L84) | 只迁监听器清单 | 015a 按 S-002 拆 `install` / `ready` |
| 6 | [search `#entityEventListeners`](../packages/rxdb-plugin-search/src/plugin.ts#L109) | AC#10 删除 | — |
| 7 | [workspace 三标志 + restore](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L331-L346) | 不动 restore | 015 明确 inject 帮不上 IndexedDB |
| 8 | [workspace 订阅 + `rollback` :295](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L289-L306) | AC#11，见 S-004 | — |
| 9 | [graph 空 `destroy` :33-35](../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35) | AC#7 + `repository(..., scope)` | — |

贯穿不对称仍在：`install` 失败经 `connect()` 抛出，`destroy` 失败 `console.error` 后吞掉（[:757-767](../packages/rxdb/src/RxDB.ts#L757-L767)）。014 D5 正确选择不改用户可见的 `disconnect()` 一定 resolve。不要在实现时「顺手变严谨」。

---

## 代码审查口径（对现行故事文本）

| 故事 | 评 | 一句话 |
| ---- | -- | ------ |
| US-013 | 🟢 | 18 条 AC 可测、命名一次裁决、D3/D4/D5 成立。可以按 TDD 开写。 |
| US-014 | 🟡 | 契约方向对，graph/storage 的病灶找准了。AC#3、构造期终态、`init()` 失败回滚未钉死。 |
| US-015 | 🟡 | INV/D 写得好，拆分理由成立。没有子文件 = 还没拆完。 |
| Epic 008 | 🔴 | 与现行故事脱节：旧名、死链、016/017 认领状态相反。不能当目录用。 |

---

## 建议交付顺序

```text
0. 补文档：015a / 015b / 016 / 017 stub + 修 Epic / status / README / 014 AC#3 / S-002 / S-004 / S-005
1. US-013：先红测试再实现 LifecycleScope（不迁任何调用方）
2. US-014：契约 + 四插件副作用清单；search 仍保留 ready / 后台 FTS
3. US-015a：适配器纪元 + search 去掉自等待；冻 S-002
4. US-015b：plugin:* 图、重名、环
5. US-016：#shutdown 八处复位
6. US-017：三框架宿主所有权（owned / borrowed）
```

014 与 015a 之间不要平行开工。S-002 / S-003 都是跨故事时序，平行写一定返工。

---

## 建议立刻补的文件（本评审不代写）

| 文件 | 最低内容 |
| ---- | -------- |
| `stories/core/US-015a-adapter-dependency-epoch.md` | 范围、S-002 三截寿命、部分断开先卸插件、search 迁移 AC |
| `stories/core/US-015b-plugin-dependency-graph.md` | 名字索引、重名、拓扑、环、契约测试 |
| `stories/core/US-016-connection-scope-shutdown.md` | `#shutdown` 八处、`#event_initialized`、部分 vs 全部断开 |
| `stories/core/US-017-framework-host-scope.md` | owned / borrowed、三框架对称、不因一棵子树卸载断共享库 |

015a/015b 的 INV/D **继续只住在 US-015 父文件**，子故事引用、不复述——US-012 的纪律已经验证过，照抄。

---

## 不在本轮范围

- 不实现代码。
- 不把 Provider→Repository 多库绑定、不可变 session context、插件配置运行时校验塞进 008（第一轮已划到 Epic 外，维持）。
- 不引入 Cordis / Proxy / DI / HMR。
- 不改 `disconnect()` 的吞错出口。
- 不删 `destroy()`。
