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

> ⚠️ **本节写于复核之前，第 2、3 条已分别撤回与降级。**
> 先读下方 [复核](#复核2026-08-15逐条对照-head-源码)，再读本节。保留原文以便追溯判断是怎么错的。

🟡 **方向正确，第一轮阻塞项大多已吸收；编码前仍被文档完整性与三处时序窗口挡住。**

`US-013 → US-014 → US-015a → US-015b → US-016 → US-017` 的顺序成立，不应交换。原语命名、`lifecycle: 'scoped'`、就绪 = 可用、安装失败回收、作用域三层、不公开 `unregisterRepository()`——这些已经写进故事，不必再吵。

但现行文本还不能直接扔给实现：

1. US-015a / US-015b / US-016 / US-017 **被到处引用，文件不存在**。US-012 拆分当天就写出了子故事；US-015 只改了父标记。这是文档完整性失败，不是风格问题。
2. ~~search 的 `install()` 今天返回的是包含 FTS DDL 的 Promise。若 US-015a 把「`install()` settle = active」套上去，[search 已踩过的死锁](../packages/rxdb-plugin-search/src/plugin.ts#L351-L372) 会原样回来。~~ ❌ **已撤回**：`install()` 返回的 Promise 确实包含 FTS，但 `connect()` 在 `#await_plugin_installs()` **之前**就已 emit `connected$`，今天没有环，015a 复刻同一形状也没有环。见 S-002。
3. ~~[US-014 AC#3](stories/core/US-014-plugin-scope-contract.md) 与 [US-015 INV-4](stories/core/US-015-plugin-inject-dependency.md) 两套测试会互相咬。~~ ⬇️ **已降级**为 AC#3 的一句夹具脚注：两条不在同一时间点生效。见 S-003。
4. storage / workspace 的**构造期资源是终态销毁**。只把 `defineProperty` 挪进 `install(scope)`，重连仍拿到已 `destroy()` 的空壳。
5. `init()` 在 `#install_plugin()` 之后才跑 schema/entity；失败只把 `#rxdb_initialized` 拨回 `false`，已安装插件不回滚。连接纪元作用域若在 `init()` 创建，这条路径会泄漏。
6. Epic / status-overview / README 仍写 `EffectScope`、旧文件名、把 US-015 当可交付故事、声称 US-016/017 尚无认领。

**输出**：⚠️ 需先补文档再编码。US-013 的 18 条 AC 本身可以开测；US-014 不能在 2～5 未冻结时开工。

**复核后的输出**：US-013 可以开测（建议按 S-008 先砍掉 `acquireAsync` 相关的 4 条 AC）。
US-014 的开工前置收敛为三条——S-004（构造期资源寿命）、S-005（`init()` 失败回滚）、S-007（`destroy()` 转可选的运行时改造）。
S-001 的四个 stub **不是 US-013 / US-014 的前置**，它是 US-015a 的前置。

---

## 复核（2026-08-15，逐条对照 HEAD 源码）

本轮评审的每一条判据被重新对照当前源码验证。结果：**一条撤回、一条降级、两条新增、全部 `RxDB.ts` 行号锚点作废重取。**

| 编号          | 复核结果            | 说明                                                                                              |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| S-001         | ✅ 维持             | 四个文件确实不存在；US-013 确已改名                                                               |
| S-002         | ❌ **撤回**         | 前提读错，且原处方会**制造**一次用户可见回退。见下方 S-002 正文                                   |
| S-003         | ⬇️ **降级**         | 不是契约冲突，是测试夹具提示。从「必须修正」降为 AC#3 的一句脚注                                  |
| S-004         | ✅ 维持，且**低估** | 不只是「换件衣服的泄漏」——今天断连一次 `rxdb.storage` 就**永久消失**。见 S-004 正文补注           |
| S-005         | ✅ 维持             | `#install_plugin()` 确在 try 外（:283-285）                                                       |
| S-006         | ✅ 维持             | 已按其修正表改完 Epic / status-overview / README                                                  |
| N-001/004/005 | ✅ 维持             | 均与源码一致                                                                                      |
| —             | ➕ 新增 S-007       | `IRxDBPlugin.destroy()` 今天是**必选成员**，且被无保护调用。转可选是一处会 crash 的改动，全文未提 |
| —             | ➕ 新增 S-008       | `acquireAsync()` + `AbortSignal` 在 013～017 全链条内**零调用方**，属过度设计                     |
| —             | ➕ 新增 N-008       | 本文件与三个故事的 `RxDB.ts` 行号锚点系统性漂移 +8                                                |

### 关于「过度设计」的总裁决

**不过度**：`LifecycleScope` 本体、`install(scope)` 契约、四插件迁移。九处手工账本是实测的，
三处泄漏是今天就能复现的，US-013 + US-014 与病灶同尺寸。

**过度**：

1. **`acquireAsync()` / `AbortSignal`（S-008）**——零调用方，纯可加性 API，应推迟。
2. **015b / 016 / 017 的排期地位**——US-014 交付后三处已知泄漏全部关闭。
   这三条此后没有「今天踩得到的症状」支撑，只有「机制应该统一」的对称性诉求。
   已在 Epic 与 status-overview 标为**价值待证**，不再作为承诺范围。

判据：**病灶数 ≥ 抽象数**。US-013+014 是 3 处泄漏换 1 个原语，成立；
016/017 是 0 处已知泄漏换 2 层新机制，不成立——除非它们各自举证。

---

## 决策

| 维度     | 判断                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 数据结构 | `LifecycleScope` 清单 + 连接纪元 / 插件激活两层，比九份手工账本干净                        |
| 特殊情况 | search 死锁、storage 构造期终态、`init()` 失败半装、`use()` 与就绪竞态——全是现有代码里的洞 |
| 复杂度   | 原语小；014 是一套机制四个调用点；015 拆成 a/b 正确。缺的是切片文件，不是再加一层抽象      |
| 破坏性   | 014 走废弃周期、零编译破坏，成立。015 改调度后 `use()`/`connect()` 时序会变，必须显式承认  |
| 实用性   | 修的是真泄漏（graph 空 `destroy`、storage 断连丢属性），不是为了「更函数式」               |
| ENFP     | 不要在评审里顺手实现；不要把 016/017 塞进 014                                              |

**裁决**：✅ 值得做。❌ 现在还不能按现行 AC 直接写 014/015。⚠️ 先补子故事、冻死锁窗口、冻构造期资源寿命。

---

## 第一轮吸收对照

| 编号  | 原问题                                  | 现行落点                                                        | 状态          |
| ----- | --------------------------------------- | --------------------------------------------------------------- | ------------- |
| R-001 | `localAdapter$` 当就绪                  | US-015 D2：`#connected_adapters.add` 之后                       | ✅ 已吸收     |
| R-002 | `inject` 被 `Uncapitalize<string>` 掏空 | US-015 D1：`'adapter:*' \| \`plugin:${Uncapitalize<string>}\``  | ✅ 已吸收     |
| R-003 | scope active ≠ 插件 active              | US-015 状态机：只有 `active` 满足依赖                           | ✅ 已吸收     |
| R-004 | 安装半途失败无回收                      | US-014 AC#12～#15                                               | ✅ 已吸收     |
| R-005 | 没分层                                  | US-014 D3：注册期 / 连接纪元 / 插件激活                         | ✅ 已吸收     |
| R-006 | 公开 `unregisterRepository()`           | US-014 D2：`repository(name, config, scope?)`，撤销不进公开表面 | ✅ 已吸收     |
| R-007 | 双版本双清                              | US-014 D6 + AC#4：`lifecycle: 'scoped'`                         | ✅ 已吸收     |
| R-008 | US-015 不 Small                         | 父故事 + 计划拆 015a/015b                                       | ⚠️ 只写了声明 |

命名 `LifecycleScope` / `acquire` / `AbortSignal` / 手动 disposer 先摘除——US-013 D1/D4/AC#16 已冻结。不必重审。

---

## 必须修正

### S-001 死链：子故事与后续故事文件不存在

**现状**

下列路径被 US-014 / US-015 / 实现约束反复链接，**仓库里没有对应文件**：

| 被引用                                                       | 实际                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `stories/core/US-015a-adapter-dependency-epoch.md`           | 不存在                                                                                                 |
| `stories/core/US-015b-plugin-dependency-graph.md`            | 不存在                                                                                                 |
| `stories/core/US-016-connection-scope-shutdown.md`           | 不存在                                                                                                 |
| `stories/core/US-017-framework-host-scope.md`                | 不存在                                                                                                 |
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

### ~~S-002 search：`install()` 返回值 ≠ 适配器就绪后的 FTS~~ ❌ 已撤回

> **撤回理由（2026-08-15 复核）：前提读反了，且原处方会制造一次用户可见回退。**
> 下面保留原文的错误诊断以便追溯，但**它不再是开工判据**。取而代之的是本节末尾的 S-002′。

**原文的事实错误**：原文称「今天 `install()` 必须在 FTS 之前返回；真实工作进后台」。对照
[`plugin.ts` `install()` :139-161](../packages/rxdb-plugin-search/src/plugin.ts#L139-L161)：

```ts
const installPromise = this.#runInstall().then(…).catch(…);
this.#installPromise = installPromise;
return installPromise;          // ← 返回的 Promise 包含 FTS DDL
```

`install()` 返回的 Promise **就包含** `#runInstall()` 的全部工作，FTS DDL 在内。
而 `connect()` 确实 `await` 它——所以「install settle = active」不是需要引入的新形状，
**它就是今天的形状**。

**为什么今天不死锁**：关键在 [`connect()` :419-445](../packages/rxdb/src/RxDB.ts#L419-L445) 的三行顺序：

```text
:419  await adapter.connect();
:442  this.#connected_adapters.add(adapterName);
:443  this.#connected_sub.next(true);        ← connected$ 在这里就已经 true
:445  await this.#await_plugin_installs();   ← 才开始等插件
```

`#runInstall` 等的 `connected$` 在 `#await_plugin_installs()` **之前**就已经 emit。
没有环。US-015a 复刻同一形状同样没有环。

**因此原处方有害**：把 FTS 从 `install()` 拆到后台任务、令 `active ≠ ready`，
会让 `await db.connect()` 返回后 FTS **不再保证就绪**——紧接着的 `db.search()` 会抛 not-ready。
这是一次真实的行为回退，被包装成了「死锁修复」。

---

#### S-002′ 真正需要冻结的约束（替代原 S-002）

范围比原文窄得多，且是**保持现状**而非改变现状：

> **`install()` 内的任何工作只能走 `adapter.bootstrapTransaction` / `adapter.rawQuery`，
> 不得调用 `repo.find()` / `Repository.ready()` / 任何会 `await connect()` 完成的路径。**
> 原因是 `install()` 跑在 `connect()` 内部（:445），等 `connect()` 完成就是等自己。
> 这正是 [`#runInstall` :367-370](../packages/rxdb-plugin-search/src/plugin.ts#L367-L370)
> 那段注释的含义——它是**已生效的约束**，不是待办。

配套两条：

- **`await db.connect()` 返回即 FTS 可用**，是今天的用户可见保证。015a 不得改变它。
  若将来确有理由改（例如冷启动时长），必须作为独立的破坏性变更立项，不能夹带在生命周期重构里。
- `SearchPluginPhase` 可以在 015a 收缩，但 `ready` 的语义不得偷换成别的 Promise。

US-014 实现约束「`SearchPluginPhase` 不强制删除，安装态留给 015a」维持不变——它本来就是对的。

### S-003 US-014 AC#3 与 US-015 INV-4 ~~冲突~~ ⬇️ 降级为夹具提示

> **降级理由（2026-08-15 复核）**：两条不在同一时间点生效。US-014 先交付，US-015a 后交付，
> 二者是**先后**关系而非**并存**关系——AC#3 描述的是 014 当期行为，INV-4 描述的是 015a 之后的行为，
> 中间隔着一次显式的契约变更。真正的风险只有一个：**014 的测试夹具若把断言写成
> 「所有插件立即安装」（而不是「无 `inject` 的插件立即安装」），015a 就必须改它。**
> 这是一句 AC 脚注的量，不是阻塞开工的契约冲突。下方原文的修正建议照做，但优先级从「必须修正」降为「顺手钉」。

**现状**

[US-014 AC#3](stories/core/US-014-plugin-scope-contract.md)：`init()` 之后 `use()` → **立即安装**，并参与下次 `#shutdown()`。这是今天的行为（[`RxDB.use` :338-349](../packages/rxdb/src/RxDB.ts#L338-L349)）。

[US-015 INV-4](stories/core/US-015-plugin-inject-dependency.md)：依赖未满足的插件**不得**进入 `#plugin_install_promises`。`init()` 只做了 `getAdapter` 级别的名字推送（[:193-195](../packages/rxdb/src/RxDB.ts#L193-L195) / `init()` [:271-294](../packages/rxdb/src/RxDB.ts#L272-L298)），**没有** `connect()`，本地适配器此时不可用。

因此：`init()` 后、`connect()` 前 `use(search)`——014 的测试要求立刻 `install()`；015 的测试要求它进 `waiting`。两边都能写绿自己、弄红对方。

**修正**

US-014 AC#3 加一句冻结（推荐）：

> 本故事保持升级前语义：`init()` 后 `use()` 仍立即 `install(scope)`。  
> `US-015a`（🚧 文件未创建）**会改这条路径**：声明了 `inject` 且依赖未就绪时改为 `waiting`，不进 `#plugin_install_promises`。  
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

**复核补注（2026-08-15）：本条被低估了，它不是「未来会变成的泄漏」，是今天就存在的缺陷。**

`#plugin_map`（[`use()` :338-349](../packages/rxdb/src/RxDB.ts#L338-L349)）按工厂函数缓存插件实例，
**构造器只跑一次**；而 `destroy()` 每次 `#shutdown()` 都跑。于是在 HEAD 上：

- `db.connect()` → `db.disconnect()` → `db.connect()` 之后，
  `rxdb.storage` **已被 `Reflect.deleteProperty` 删掉且永不重建**——属性在第二次连接后直接是 `undefined`。
- workspace 的 `#destroyed`（:196）是终态标志、从不复位，第二次连接后插件整体处于已销毁态。

所以 US-014 不只是「把泄漏换个写法」，它**修复两个可复现的重连缺陷**。
这一点应写进 US-014 的价值陈述——它是该故事独立成立、不必等 015/016/017 的直接证据。

另有一处实现细节，S-004 与全文均未提及：
workspace 的 `#indexedDBStore` 声明为 `readonly ... !: WorkspaceStore`（:169），
把它的获取移进 `install(scope)` **必须先去掉 `readonly`**，否则编译不过。
（[`createWorkspaceStore`](../packages/rxdb-plugin-workspace/src/workspace-store.ts#L47) 本身是同步的，
惰性打开 IDB，所以用同步 `acquire()` 即可，不需要 `acquireAsync()`——见 S-008。）

### S-005 `init()` 失败不回滚已安装插件

**现状**

[`init()` :271-294](../packages/rxdb/src/RxDB.ts#L272-L298)：

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

| 文件                                          | 现在                                                                                           | 应改为                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [epic-008](epics/epic-008-lifecycle-scope.md) | `EffectScope`、旧 US-013 路径、故事只有 013/014/015、016/017「尚无认领」、非目标写「封闭枚举」 | `LifecycleScope`、新路径、列出 015a/b + 016 + 017、非目标改为「封闭依赖类别」 |
| [status-overview](status-overview.md)         | `US-013-effect-scope-primitive.md`；015 当交付项；「封闭枚举」                                 | 新文件名；015 标 📄；父故事 2 → 3                                             |
| [README P1](README.md)                        | EffectScope；014 交付物含 `unregisterRepository()`                                             | LifecycleScope；交付物与 US-014 D2 对齐                                       |

Epic 非目标「封闭枚举」与 US-015 D1 的实测表也不一致：`` `plugin:${Uncapitalize<string>}` `` 在类型上仍接受几乎任意小写串，真正关掉的是**类别**（必须带 `adapter:` / `plugin:` 前缀）。第一轮 R-002 的精神在，用词没跟上。

### S-007 `destroy()` 今天是必选成员，且被无保护调用 ➕ 新增

**现状**

[`rxdb-plugin.ts:6-10`](../packages/rxdb/src/rxdb-plugin.ts#L6-L10)：

```ts
export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  install(): void | Promise<void>;
  destroy(): void | Promise<void>; // ← 必选，不是 `destroy?()`
}
```

而 [`#destroy_plugin()` :765-775](../packages/rxdb/src/RxDB.ts#L765-L775) 直接 `plugin.destroy()`，**没有可选链**。

US-014 全文把这次变更描述为「`destroy()` 进入废弃周期」，读起来像是纯文档级的 `@deprecated` 标注。
实际上它同时是一次**必选 → 可选**的类型变更，而只写 `install(scope)` 的新式插件在运行时会让
`#destroy_plugin()` 抛 `TypeError: plugin.destroy is not a function`。

**修正**

US-014 必须显式包含这两条，否则第一个 `lifecycle: 'scoped'` 插件一跑就崩：

1. 接口改为 `readonly lifecycle?: 'scoped'` + `destroy?(): void | Promise<void>`；
2. `#destroy_plugin()` 改为 `await plugin.destroy?.()`（与 AC#1 的逆序串行改造一并做，见 N-001）。

顺带：这正是 status-overview 已记的 api-surface 盲区的实例——
`{name, kind}` 基线对「`destroy` 由必选变可选」不产生任何 diff。US-014 的类型契约测试要覆盖它。

### S-008 `acquireAsync()` / `AbortSignal` 零调用方 ➕ 新增（过度设计）

**现状**

US-013 为 `acquireAsync(factory, signal)` 花掉 D3（异步竞态）、D4（取消退出）两个决策，
以及 AC#7 / AC#14 / AC#15 三条 AC——约占该故事 18 条 AC 的四分之一。

但把 013～017 全链条的**每一个已知调用点**列出来，没有一个需要它：

| 迁移点    | 需要获取的资源                                                                                                                          | 同步还是异步 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| storage   | `new RxdbFileStorage(...)` + `defineProperty` + `entities.push`                                                                         | 同步         |
| search    | `addEventListener` × N                                                                                                                  | 同步         |
| graph     | `repository(name, config, scope)`                                                                                                       | 同步         |
| workspace | [`createWorkspaceStore()`](../packages/rxdb-plugin-workspace/src/workspace-store.ts#L47)（惰性开 IDB）、`BroadcastChannel`、`subscribe` | **全部同步** |

workspace 是唯一看起来像异步的候选，但 `createWorkspaceStore` 返回 `WorkspaceStore` 而非 `Promise`——
IndexedDB 的打开被推迟到首次使用。四个插件迁移一个 `acquireAsync()` 都用不上。

**修正**

`acquireAsync()` 是**纯可加性** API：先不做，将来任何时候补上都不构成破坏性变更。
建议 US-013 把 D3 / D4 与对应 AC 移入「后续可加」小节，等出现**真实的异步获取调用方**再实现。
这样 US-013 从 18 条 AC 降到 ~14 条，交付更快，且不为假想调用方冻结竞态语义
（一旦冻结，将来真实调用方出现时反而可能不合用）。

不反对保留 `dispose()` 的异步性——那是**释放**侧，`storage.destroy()` 确实返回 Promise，有真实调用方。

---

## 次要（不挡 013，应在 014/015a 文本里顺手钉）

### N-001 `#destroy_plugin` 的 `Promise.all`

[:765-775](../packages/rxdb/src/RxDB.ts#L765-L775) 今天并行 `destroy()`。US-014 AC#1 要求逆序串行，实现约束也写了替换 `Promise.all`。不要留「旧插件并行、新插件串行」的双路径——旧插件的 `destroy()` 也按插入逆序串行调。AC#5 的「先释放空 scope，再 `destroy()`」已经暗示这一点，补一句即可。

### N-002 disposing / `#shutdown` 期间的 `use()`

没有 AC。`#shutdown()` 先 `#destroy_plugin()`，最后才 `#rxdb_initialized = false`（[:605-621](../packages/rxdb/src/RxDB.ts#L605-L621)）。窗口内 `use()` 仍走「已 init → 立即安装」。加上：

> `disposing` / `#shutdown()` 进行中：`use()` 只登记到 `#plugin_map`，不启动 `install`；下一纪元 `init()` 再装。

013 的 AC#5（非 active 时 `acquire` 抛错）是原语层；这里是宿主调度层，013 管不着。

### N-003 `init()` 与 `#runIsolated` 的错误口径

US-013 AC#9：单错原样抛，多错 `AggregateError`。[`#runIsolated` :579-593](../packages/rxdb/src/RxDB.ts#L579-L593) 只留首错、同步、不短路。故事已承认这是有意的 D5，不是疏漏。评审不反对。实现时不要把 `#runIsolated`「升级」成 AggregateError——那是另一条用户可见路径（事务事件）。

### N-004 config freeze

`entities` 在 [`LIVE_BEHAVIOUR_CONFIG_KEYS`](../packages/rxdb/src/RxDB.ts#L58)，`push` / `splice` `StorageFileMeta` 合法。014 示例不用改。不要有人「顺便」把 `entities` 冻死。

### N-005 graph 的 `rxdb.graph` 从未赋值

[`plugin.ts` 模块扩增](../packages/rxdb-plugin-graph/src/plugin.ts#L37-L40) 声明了 `rxdb.graph`，`install()` 只 `repository()`，属性从未挂上。这是 US-503 遗留，**不要**塞进 008，除非单独开缺陷故事。014 只修 repository 泄漏（AC#7）。

### N-006 覆盖率

US-013 `@aiao/utils` ≥ 80%，US-014 `@aiao/rxdb` ≥ 90%、四插件 ≥ 80%。与仓库档位一致，保持。

### N-007 US-015 INVEST Independent

父故事勾了 Independent，却依赖 014。与 US-012 父故事同一口径，可接受——前提是 015 **不再被当成可交付 Backlog**（回到 S-001）。

### N-008 `RxDB.ts` 行号锚点系统性漂移 +8 ➕ 新增

**现状**

本文件与 US-013 / US-014 / US-015 / Epic 引用的 `RxDB.ts` 行号，凡在约 560 行之后的，**全部偏移 +8**：

| 被引用为                            | HEAD 实际    |
| ----------------------------------- | ------------ |
| `#shutdown` :605-621                | **:605-621** |
| `#destroy_plugin` :765-775          | **:765-775** |
| `#track_plugin_install` :714-728    | **:714-728** |
| `#runIsolated` :579-593             | **:579-593** |
| `#closeTransactionContext` :561-564 | **:569-577** |
| `connect()` 链（US-015 D2）         | +2           |

560 行之前的锚点（`:58` `:118` `:142` `:169` `:310` `:338-349` `:391` `:445`）与四个插件包的锚点均正确。

**为什么这条不是文案问题**

本评审的全部说服力来自「点开链接就能验证」。锚点一旦指错，读者点进去看到的是无关代码，
最省力的反应是**放弃核对、直接采信结论**——S-002 那种前提读反的错误正是这样活下来的。

**修正**

本文件的锚点已在本次复核中就地修正。三个故事文件与 Epic 的同类锚点需一并修。
更根本的做法见 [template.md](template.md) 新增的「证据锚点」一节：
**优先引用符号名 + 短代码引用，行号只作为辅助**。符号名不会因为上游插入几行就失效。

---

## 源码对照：九处账本还在

Epic「现状」表与代码一致，没有写过时。实现前用这张表防范围漂移：

| #   | 位置                                                                                                       | 014 是否动                      | 015+ 是否动                                                        |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| 1   | [`#shutdown` :605-621](../packages/rxdb/src/RxDB.ts#L605-L621) 八处复位                                    | 只释放连接纪元容器              | 016 把复位迁进 scope                                               |
| 2   | [`#event_initialized` :142](../packages/rxdb/src/RxDB.ts#L142)                                             | 不动                            | 016                                                                |
| 3   | [`#plugin_install_promises` :118](../packages/rxdb/src/RxDB.ts#L118)                                       | 不动记账（Out of Scope）        | 015a 调度必须遵守 INV-4                                            |
| 4   | [storage `#ownsStorage` / `#registeredEntity`](../packages/rxdb-plugin-storage/src/plugin.ts#L19-L20)      | 删掉，见 S-004                  | —                                                                  |
| 5   | [search `SearchPluginPhase`](../packages/rxdb-plugin-search/src/plugin.ts#L84)                             | 只迁监听器清单                  | 015a 可收缩，但按 S-002′ **不得**改 `install` / `ready` 的现有语义 |
| 6   | [search `#entityEventListeners`](../packages/rxdb-plugin-search/src/plugin.ts#L109)                        | AC#10 删除                      | —                                                                  |
| 7   | [workspace 三标志 + restore](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L331-L346)       | 不动 restore                    | 015 明确 inject 帮不上 IndexedDB                                   |
| 8   | [workspace 订阅 + `rollback` :295](../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L289-L306) | AC#11，见 S-004                 | —                                                                  |
| 9   | [graph 空 `destroy` :33-35](../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35)                           | AC#7 + `repository(..., scope)` | —                                                                  |

贯穿不对称仍在：`install` 失败经 `connect()` 抛出，`destroy` 失败 `console.error` 后吞掉（[:765-775](../packages/rxdb/src/RxDB.ts#L765-L775)）。014 D5 正确选择不改用户可见的 `disconnect()` 一定 resolve。不要在实现时「顺手变严谨」。

---

## 代码审查口径（对现行故事文本）

| 故事     | 评  | 一句话                                                                                                                       |
| -------- | --- | ---------------------------------------------------------------------------------------------------------------------------- |
| US-013   | 🟢  | 18 条 AC 可测、命名一次裁决、D5 成立。可以按 TDD 开写；建议先按 S-008 摘掉 D3/D4 与 4 条 AC。                                |
| US-014   | 🟡  | 契约方向对，graph/storage 的病灶找准了。构造期终态（S-004）、`init()` 失败回滚（S-005）、`destroy()` 转可选（S-007）未钉死。 |
| US-015   | 🟡  | INV/D 写得好，拆分理由成立。没有子文件 = 还没拆完。                                                                          |
| Epic 008 | 🟢  | 已按 S-006 修正：`LifecycleScope`、新路径、015a/b/016/017 状态、封闭依赖类别。                                               |

---

## 建议交付顺序

> **复核后的顺序**（替代下方原表）：第 0 步的四个 stub 不再是 US-013 / US-014 的前置，
> 它们是 **US-015a 的前置**；US-014 的前置收敛为 S-004 / S-005 / S-007 三条 AC 补写。
> 第 3 步不再包含「search 去掉自等待」——按 S-002′，search 的 `install` / `ready` 语义**保持不变**。

```text
0. 修 Epic / status / README（S-006，已完成）+ 给 US-014 补 S-004 / S-005 / S-007 三条 AC
1. US-013：先红测试再实现 LifecycleScope（不迁任何调用方；建议按 S-008 摘掉 acquireAsync）
2. US-014：契约 + 四插件副作用清单；search 的 install/ready 语义原样保留
   ↑ 到此为止本 Epic 的三处已知泄漏全部关闭。以下每一条都需各自举证。
3. 补 015a / 015b / 016 / 017 stub（US-015a 的开工前置）
4. US-015a：适配器纪元；遵守 S-002′ 不改 search 对外时序
5. US-015b：plugin:* 图、重名、环          ← 价值待证
6. US-016：#shutdown 八处复位              ← 价值待证
7. US-017：三框架宿主所有权（owned / borrowed）  ← 价值待证
```

014 与 015a 之间不要平行开工——015a 依赖 014 已经把插件副作用收进作用域。

---

## 建议立刻补的文件（本评审不代写）

> 复核后：这四个文件是 **US-015a 的开工前置**，不是 US-013 / US-014 的。
> 且其中三个已标为**价值待证**——写 stub 是为了消除死链与「有故事在排队」的假象，
> 不等于承诺实现。

| 文件                                               | 最低内容                                                 |
| -------------------------------------------------- | -------------------------------------------------------- |
| `stories/core/US-015a-adapter-dependency-epoch.md` | 范围、S-002′ 约束、部分断开先卸插件、search 迁移 AC      |
| `stories/core/US-015b-plugin-dependency-graph.md`  | 名字索引、重名、拓扑、环、契约测试                       |
| `stories/core/US-016-connection-scope-shutdown.md` | `#shutdown` 八处、`#event_initialized`、部分 vs 全部断开 |
| `stories/core/US-017-framework-host-scope.md`      | owned / borrowed、三框架对称、不因一棵子树卸载断共享库   |

015a/015b 的 INV/D **继续只住在 US-015 父文件**，子故事引用、不复述——US-012 的纪律已经验证过，照抄。

---

## 不在本轮范围

- 不实现代码。
- 不把 Provider→Repository 多库绑定、不可变 session context、插件配置运行时校验塞进 008（第一轮已划到 Epic 外，维持）。停车位见 [epic-008-out-of-scope.md](epic-008-out-of-scope.md)。
- 不引入 Cordis / Proxy / DI / HMR。
- 不改 `disconnect()` 的吞错出口。
- 不删 `destroy()`。
