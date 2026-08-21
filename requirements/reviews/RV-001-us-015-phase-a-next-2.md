---
id: RV-001
title: next-2 vs main — US-015 阶段 A 分支评审
status: Open
created: 2026-08-21
updated: 2026-08-21
pr:
branch: next-2
base: main
story: US-015
---

# Review：next-2 vs main — US-015 阶段 A

对照 [US-015](../stories/core/US-015-plugin-inject-dependency.md)。范围是 `next-2...main` 的全部 38 个文件（+2454 / −445），不是单文件点评。

## 裁决

**阶段 A 的架构值得做。合入前只差门禁与提交历史。**

调度器把激活状态收成一份真相，search 不再自等 `connect()`，INV-4/5/6/7 测到了点子上。这是对的。

> **复核（2026-08-21）**：初评列的 7 条逐条对着代码验过，只有 3 条成立。问题 1 **症状真、机制错**，
> 它给的三个修复方案全是空操作；问题 3 / 4 / 6 撤销。初评「不能合」方向没错，但理由要换：
> **不是有正确性缺陷，而是 AC#19 的门禁一次都没跑过**。

| 维度     | 判断 | 说明                                                                             |
| -------- | ---- | -------------------------------------------------------------------------------- |
| 数据结构 | 🟢   | 状态机只活在调度器里，纪元身份是实例引用，不是名字/布尔                          |
| 特殊情况 | 🟢   | 复核订正：`#runInstall` 的收手守卫是对的，abort 只可能发生在 teardown 之后       |
| 复杂度   | 🟢   | 436 行调度器换掉 search 自建 phase 机，划算                                      |
| 破坏性   | 🟡   | AC#12 有意改 `ready`，迁移文档已写。跨纪元持有旧引用的观感问题见问题 1，规格之内 |
| 实用性   | 🟢   | 真实死锁（search 自等 `connect()`）被拆掉                                        |
| ENFP     | 🟡   | 复核后只剩提交卫生：无关 diff 混装、信息是噪声                                   |

## 复核结论

| #   | 初评                           | 复核                                          | 处置                          |
| --- | ------------------------------ | --------------------------------------------- | ----------------------------- |
| 1   | 🔴 `ready` 把中途收手当成功    | 症状真、机制错；三个修复方案全是空操作        | ⚠️ 降级为规格内问题，不改代码 |
| 2   | 🔴 提交卫生                    | 属实                                          | ✅ 修                         |
| 3   | 🟡 `localAdapterSync` 未进基线 | **错**：基线只收模块级导出，不收类成员        | ❌ 撤销                       |
| 4   | 🟡 `plugin:*` 永不解析         | **错**：已交付 AC#18 的明示决定，摘掉等于回退 | ❌ 撤销                       |
| 5   | 🟡 过期注释                    | 属实且精确                                    | ✅ 修                         |
| 6   | 🟡 AC#12 要进 changelog        | **错**：仓库无 changelog 约定，迁移文档已覆盖 | ❌ 撤销                       |
| 7   | ⬜ AC#19 未跑                  | 属实                                          | ✅ 跑                         |

## 问题

按阻塞度排。符号名可 grep；行号只作导航，插入几行就会漂。

### 1. ⚠️ `search.ready` 跨纪元的观感问题（初评 🔴，机制判错）

> **复核（2026-08-21）**：症状真，**机制错**，初评给的三个修复方案全部无效。以下为订正。

初评的读法是：`install()` 在 `!settled` 时续用同一格 deferred、then-path 无条件 `resolve`，而
`RxDBPluginSearch.#runInstall()` 中途收手是 early `return` 不 throw，于是「abort 被当成功」。
前半段是事实，结论不成立。

`install()`（[plugin.ts](../../packages/rxdb-plugin-search/src/plugin.ts#L241-L267)）：

```ts
if (this.#readyDeferred.settled) this.#readyDeferred = createReadyDeferred();
const deferred = this.#readyDeferred;
// ...
return this.#runInstall(scope).then(
  () => deferred.resolve(),
```

`#runInstall()`（[plugin.ts](../../packages/rxdb-plugin-search/src/plugin.ts#L486-L497)）：

```ts
if (scope.state !== 'active') return;
await adapter.bootstrapTransaction(/* ... */);
// ...
if (scope.state !== 'active') return;
```

**初评假设的那条路径不可达。** 它要求「调度器在 install 在飞期间释放作用域」，但
[dependency-scheduler.ts](../../packages/rxdb/src/plugin/dependency-scheduler.ts#L276) 在
`activation.inFlight !== undefined` 时只打 `recheck` 就返回，`releaseScope()` 只在 `#applyInstallResult()`
里、install promise **结算之后**才调用。install 在飞期间 `scope.state` 恒为 `active`，上面两处守卫压根不触发。

那两处 `if (scope.state !== 'active') return;` **是对的**：唯一会触发它的场景是「旧纪元的 install 还在跑、
新一轮已经重装」，那时旧 scope 早已 `disposed`、teardown 早已换格 reject，then-path 的 `deferred.resolve()`
是空操作——正是现有测试「旧纪元迟到的 install 只丢弃结果」覆盖的那条。初评说这条测试方向写反了，其实
它测的就是唯一可达的方向。

**实际可观察到的是另一回事。** 按 AC#7 真实时序复现（临时脚本，已删）：

```text
AC#7 captured = resolved | plugin.ready = rejected | search() throws = true
```

1. 调用方抓住 `plugin.ready`（还 pending，就是这一格）
2. install **成功**跑完 → then-path `deferred.resolve()`
3. 宿主这才发现依赖纪元已陈旧 → 丢弃结果 + `releaseScope` → `#teardown()` 换一格 reject `destroyed`

提前抓着 `ready` 的调用方读到 fulfilled，下一句 `search()` 抛 `plugin is not installed`。是误导，但会立刻响，不是静默损坏。

**三个修复方案逐条失效：**

| 初评方案                                                    | 为什么无效                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `#runInstall()` abort 改 throw                              | 这条路径没有 abort，install 是成功的                             |
| then-path 验 `#scope === scope && scope.state === 'active'` | `.then` 执行时两个条件都还成立（宿主尚未释放）                   |
| 每纪元强制新建 deferred                                     | install 前抓到的那一格从此永远没人结算，pending 泄漏，比现状更糟 |

**这个行为在规格之内。** AC#7 的预期结果原文就是「该纪元的成功结果被丢弃」；
[plugin-scope.md](../../website/docs/migration/plugin-scope.md) 也写明 `ready` 一个连接纪元一格、
重连后要重读。要消掉这个窗口需要一条宿主→插件的「你这一纪元作废了」信号——那是设计变更，
而阶段 B 在 roadmap 里「明确不排期」。**本分支不改代码。**

### 2. 🔴 提交卫生：噪声信息 + 无关 diff 混装

八个提交相对 `main`：

`7813643 123456` · `28040b7 123123` · `19bcf31 213` · `1ec995e qweqwe` · `0eb21aa 123123` · `b9672eb 123` · `a80838f 123123` · `f94586a 123`

`git blame` 以后是废的。38 个文件里混着 vitest timeout、gitignore、eslint、rust `as_chunks`、`test-all-log` 补 target——跟插件依赖调度无关。审查时每个人都要先做一次「这是不是本需求」。

> **复核（2026-08-21）✅ 已修**：重建为三刀——`feat(rxdb)` 29 个文件（US-015 本体 + 连带正确的 demo /
> bench）、`chore` 9 个文件（上面那批无关改动）、`docs(review)` 本记录。改写前的 8 个提交完整留在
> `backup/next-2-pre-rewrite`。因 `next-2` 已推到 origin，推送需 `--force-with-lease`。

### 3. ❌ ~~`localAdapterSync` 未进 api-baseline~~（撤销）

> **复核（2026-08-21）**：不成立。[api-surface.mjs](../../scripts/audit/api-surface.mjs) 只抽每个包
> `src/index.ts` 的**模块级导出**，不收类成员。409 条基线里 `connect` / `use` / `version` / `config`
> 一个类成员都没有，既有的 `localAdapter` 同样零命中——不是漏了这一个，是这类东西整体不在基线的取值范围内。
> AC#19 要的「基线已同步新增导出」指 `RxDBPluginDependency`，它在。无事可做。

### 4. ❌ ~~公开类型里的 `plugin:*` 永不解析~~（撤销）

> **复核（2026-08-21）**：不成立，且照它改会**回退一条已交付的 AC**。

`RxDBPluginDependency`（[rxdb-plugin.ts](../../packages/rxdb/src/rxdb-plugin.ts)）：

```ts
export type RxDBPluginDependency = 'adapter:local' | 'adapter:remote' | `plugin:${Uncapitalize<string>}`;
```

阶段 A 的 `RxDB.#resolve_dependency()` 对非 `adapter:*` 一律返回 `undefined`，这是事实。但这是**明示决定**，
不是疏漏：US-015 的 AC#18 已标 ✅ 交付，原文写着「`RxDBPluginDependency` 的封闭取值是阶段 A 的契约前提，
`plugin:*` 分支在类型层同期落地（解析仍属阶段 B），编译期契约因此当时就可测」。摘掉这一支等于回退 AC#18，
还要改专门冻结这个契约的 [plugin-inject-contract.spec.ts](../../packages/rxdb/src/__tests__/contracts/plugin-inject-contract.spec.ts)。

「静默不装」也不成立：`#resolve_dependency()` 返回 `undefined` → 进 `missing` →
[dependency-scheduler.ts](../../packages/rxdb/src/plugin/dependency-scheduler.ts#L248) `console.warn` 一次
列出缺失项，正是 INV-5。用户拿到的是一条点名警告，不是静默。

初评的第二方案（`use()` 对声明 `plugin:*` 的插件硬失败）更糟：它会让阶段 B 无法向前兼容，还平添运行时代码。

### 5. ✅ 过期注释把批量入口说成单插件入口（已修）

`RxDB.use()` 仍走 `RxDB.#install_one_plugin()`（每个插件一趟 reconcile），批量入口是 `RxDB.#install_plugin()`。

`use()`（[RxDB.ts](../../packages/rxdb/src/RxDB.ts#L514-L515)）：

```ts
// 装不装由 #install_one_plugin 自己判——它是全部安装入口的收口点。
this.#install_one_plugin(plugin_instance);
```

`RxDB.#await_plugin_installs()` 的 TSDoc 仍指向 `#install_one_plugin`，实现却调 `#install_plugin()`（[RxDB.ts](../../packages/rxdb/src/RxDB.ts#L1184-L1188)）。注释在撒谎。

> **复核（2026-08-21）✅ 已修**：初评只点了两处，实际有四处。`#install_one_plugin()` 的 @remarks 还称
> 判定「不是散在三个调用点（`use()` / `#install_plugin` / `#await_plugin_installs`）」，但
> `#install_plugin()` 自己就带着一份一模一样的守卫——**判定其实在两个安装入口各有一份**。这份重复是
> 有意的（批量入口若改走单个入口，就退化成 N 个插件 N 趟全表扫描），所以只改措辞、不重构，行为未动。

### 6. ❌ ~~AC#12 `search.ready` 有意破坏 userspace~~（撤销）

> **复核（2026-08-21）**：破坏本身属实且有意，但「只藏在 spec 的 ⚠️ 里」不成立。

旧口径「未安装即 reject」→ 一纪元一格 deferred：装前/装中 pending，成功 resolve，失败 reject 原错误，
纪元释放 reject `destroyed`。理由成立（否则 `connect()` 还在飞、`ready` 已经 reject）。

要求补 changelog 是凭空发明流程：仓库根 `CHANGELOG.md` 是空的，`git log` 显示只在 `init` 那次提交碰过，
本仓库没有 changelog 约定。而这条变更已经在用户读得到的地方——
[plugin-scope.md](../../website/docs/migration/plugin-scope.md) 本分支改了 +26 行，其中一整段逐条写明新语义
（「一个连接纪元一格，`connect()` 之前与安装期间 pending，成功 resolve、失败 reject 原始错误、纪元释放后
reject `destroyed`」），并点出它与 `workspace.ready` 口径不同、别互相推断。AC#12 的可见性要求已满足。

### 7. ✅ AC#19 本评审未跑（已跑）

lint / test / coverage / `pnpm test-all` 没在这次评审里执行。不签字。`@aiao/rxdb` 核心 ≥ 90%，`rxdb-plugin-search` ≥ 80%。

**复核（2026-08-21）✅ 已跑：**

| 门禁                                        | 结果                             |
| ------------------------------------------- | -------------------------------- |
| `tag:js-lib` lint + test + build（22 项目） | 绿                               |
| `@aiao/rxdb` 覆盖率（阈值 90）              | 96.13 / 91.79 / 97.42 / 97.09 ✅ |
| `rxdb-plugin-search` 覆盖率（阈值 80）      | 93.37 / 83.37 / 95.30 / 95.59 ✅ |
| api-baseline 新增导出                       | `RxDBPluginDependency` 在位 ✅   |
| `pnpm test-all`                             | 见下方「解决记录」               |

四项覆盖率依次为 statements / branches / functions / lines。

## 根因

> **复核（2026-08-21）**：前两条随问题 1 / 4 一并推翻，保留原文以留痕。

1. ~~**abort 被建模成成功。**~~ **推翻。** `#runInstall()` 的 `return` 只在旧纪元收尾时触发，那时 deferred
   早已被 teardown 换格，`resolve()` 是空操作。真正的窗口是「install 成功、结果被宿主丢弃」——AC#7 明文
   规定的行为，不是建模错误。测试方向也没写反：先 dispose 再放行 stale 就是唯一可达的方向。见问题 1。
2. ~~**阶段 A 把阶段 B 的类型提前公开。**~~ **推翻。** 这是 AC#18 的交付内容，且未满足时有 INV-5 点名告警。见问题 4。
3. **工作树当草稿用。** US-015、CI 超时、rust clippy、gitignore 同一次推到 `next-2`，提交信息没有主题。
   不是实现问题，是合入面问题。**这是本次评审唯一站得住的根因。**
4. **评审自身的方法问题。** 问题 1 / 3 / 4 / 6 全是「读代码推演 + 摘 spec 片段」得出的：没跑过一次复现，
   没查 `api-surface.mjs` 到底收什么，没查 `CHANGELOG.md` 是否在维护，没读 AC#18 的交付说明。四条判错三条。
   涉及并发时序的结论，先写一段能跑的复现再落笔。

## 修复方案

> **复核（2026-08-21）**：原方案的 `ready` / 基线 / `plugin:*` 三节撤销，实际执行的只有下面三条。

### 注释

三处措辞与实现不符，**行为本身是对的**，所以只改措辞、不重构——守卫在两个入口各带一份是有意的：
批量入口若改走单个入口，就退化成 N 个插件 N 趟全表扫描。

- `use()` 的内联注释：删掉「它是全部安装入口的收口点」
- `#install_one_plugin()` 的 @remarks：原文称判定「不是散在三个调用点（`use()` / `#install_plugin` /
  `#await_plugin_installs`）」，但 `#install_plugin()` 自己就带着一份一模一样的守卫。改成如实描述
  「两个安装入口各带一份」，保留「漏掉任一处会怎样」的原有论证
- `#install_plugin()` 的 @remarks：补一句说明这份重复是有意的
- `#await_plugin_installs()` 的 TSDoc：`{@link RxDB.#install_one_plugin}` → `{@link RxDB.#install_plugin}`（实现调的是后者）

### 提交卫生

rebase 成可审的历史，两刀：

1. **feat(rxdb): plugin inject Phase A** — 调度器 + 宿主 + 契约 + search + 文档 + demo `/search` 守卫 + bench 去掉 `destroy()`
2. **chore:** 超时 / gitignore / eslint / rust / test-all-log

### 门禁

跑 AC#19：`rxdb` 覆盖率 ≥ 90%，`rxdb-plugin-search` ≥ 80%，`tag:js-lib` 全量 lint/test/build。
本记录保持 Open 直到这项绿。

### 已撤销的三节

| 原方案                       | 撤销理由                                   |
| ---------------------------- | ------------------------------------------ |
| `ready` abort-success 三选一 | 三个方案对唯一可达的路径全部无效，见问题 1 |
| `localAdapterSync` 进基线    | 基线不收类成员，见问题 3                   |
| `plugin:*` 拿掉或硬失败      | 回退已交付的 AC#18，见问题 4               |

## 范围：38 files，+2454 / −445

### US-015 本体（该留）

- 调度：[dependency-scheduler.ts](../../packages/rxdb/src/plugin/dependency-scheduler.ts) + [dependency-scheduler.spec.ts](../../packages/rxdb/src/plugin/__tests__/dependency-scheduler.spec.ts)
- 宿主：[RxDB.ts](../../packages/rxdb/src/RxDB.ts) + [RxDB.plugin-inject.spec.ts](../../packages/rxdb/src/__tests__/RxDB.plugin-inject.spec.ts)
- 契约：[rxdb-plugin.ts](../../packages/rxdb/src/rxdb-plugin.ts) + [plugin-inject-contract.spec.ts](../../packages/rxdb/src/__tests__/contracts/plugin-inject-contract.spec.ts)
- search：[plugin.ts](../../packages/rxdb-plugin-search/src/plugin.ts) + 配套测试 / README
- 文档：[authoring.md](../../website/docs/plugins/authoring.md)、[plugin-scope.md](../../website/docs/migration/plugin-scope.md)
- spec / epic / roadmap / status / [rxdb.json](../api-baseline/rxdb.json)

### 连带正确（该留，但应写进 US-015 提交）

- 三端 demo `/search` 进页先 `connect()`：[app.routes.ts](../../apps/dev-rxdb-angular/src/app/app.routes.ts)、[router.tsx](../../apps/dev-rxdb-react/src/app/router.tsx)、[index.ts](../../apps/dev-rxdb-vue/src/router/index.ts)
- [rxdb-plugin-search.bench.ts](../../benchmarks/src/suites/rxdb-plugin-search.bench.ts) 去掉 `plugin.destroy()`（`lifecycle: 'scoped'` 的后果）

### 无关，必须拆走 🔴

| 文件                                                                                                                       | 改了什么                                      |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [.gitignore](../../.gitignore)                                                                                             | `.tmp-generated-runtime-*/`                   |
| [eslint.config.mjs](../../apps/dev-rxdb-electron-e2e/eslint.config.mjs)                                                    | `playwright/no-skipped-test` allowConditional |
| [runtime-polyfills-errors.spec.ts](../../packages/rxdb-adapter-miniprogram/src/__tests__/runtime-polyfills-errors.spec.ts) | `as any` → `as unknown as`                    |
| [vite.config.mts](../../packages/rxdb-adapter-sqlite-core/vite.config.mts)                                                 | timeout 5s→30s / CI 30s→120s                  |
| [vite.config.mts](../../packages/rxdb-client-generator/vite.config.mts)                                                    | 本地 timeout 30s→60s                          |
| [value.rs](../../packages/rxdb-adapter-tauri/rust/src/value.rs)                                                            | `chunks_exact` → `as_chunks::<3>()`           |
| angular-todo 两个 page spec                                                                                                | 小改                                          |
| [test-all-log.mjs](../../scripts/test-all-log.mjs)                                                                         | 补 `audit-lazy-backend`                       |

这些各自可能成立，跟插件依赖调度无关。

## 分区域评注

### 调度器 🟢

[dependency-scheduler.ts](../../packages/rxdb/src/plugin/dependency-scheduler.ts) 是这次最好的代码。

- 激活状态只有一份：`registered → waiting → installing → active|failed`，任一环节可进 `disposing`。search 以前的 `SearchPluginPhase` 属于「第二套真相」，拆掉是对的。
- `PluginSchedulerHost` 不认识 `RxDB`。INV-3 / AC#6（同名新实例、中途从不空）没有公开 API 能驱动，假宿主是唯一测得动的缝。品味对。
- 纪元用 `Object.is` 比实例元组，空依赖共用冻结 `EMPTY_EPOCH`。
- 单飞 + 最新纪元胜出：转移中只打 `recheck`，落地再对齐。并发测试 1–4 覆盖了「成功结果绑在死连接上」「disposing 窗口闪过中间实例」「同纪元失败不重试」「反复断连幂等」。
- `settle()` 对安装失败 `allSettled`，自己不 reject。失败经 `startedInstalls()` 交给 `connect()`。INV-4 干净：`waiting` 不进等待集合。
- `#startInstall()` 预挂空 `catch`，避免没人 await 时变成 `unhandledrejection`。
- `#applyInstallResult()` 先比 `activation.scope !== scope`（reset / 更新的安装），再看成败。AC#7 写在调度器里，不写在插件里。

强制测试 6 弱于 spec：只断言 installing 期间不扫旁观者，没有 `plugin:*` 的 active-edge notify。阶段 A 允许；阶段 B 钩子现在是注释，不是代码。别假装测过。

### 宿主接线 🟢 带几处 🟡

[RxDB.ts](../../packages/rxdb/src/RxDB.ts) 把调度器嵌进去的方式大体正确。

🟢 `#connected_adapter_instances: Map<string, IRxDBAdapter>` 同时当纪元身份和 `localAdapterSync` 的源。`#set_adapter_connected(name, adapter | undefined)` 用实例而不是布尔，消掉「已连接但没有实例」这种特殊情况。

🟢 `localAdapterSync` 未配置 / 未连接抛错，不断连后继续握着旧实例。跟「无 fallback」一致。信任模型写明了：`RxDBAdapterLocalBase` 成员全可选，运行时无从判别形状。

🟢 INV-7：`disconnect()` 在还有别的适配器时，先 reconcile+settle 再 `adapter.disconnect()`。AC#4 用日志顺序钉死：`release:onRemote` 早于 `adapter:disconnect`。

🟢 INV-5 闸门精确：`#bootstrapping_connects === 0` **且** 至少有一个适配器已连接才 `reportUnsatisfied()`。并行 `connect` 不会让先落地的那条替还在引导的那条下「装不上」的结论。init 时刻不误报。测到了。

🟢 `connect()` 插件安装失败：把 connected 清掉、reconcile+settle、再 rethrow。不会把插件留在一条已经失败的连接上。`connectPromise.catch` 也调 `bootstrapDone()`，半失败不会把计数器钉死。

🟢 `#track_plugin_install()` 等 `#connection_release`，再按 `(plugin, scope)` 身份守卫。失败不自己释放——回滚归调度器，「恰好释放一次」才测得住。

🟢 `#shutdown()` 把 scheduler reset 留到 await 之后、清 `#rxdb_initialized` 之前。在飞的 `connect()` 还能看见安装记录。

🟡 见问题 4、5。

### 契约与测试 🟢

[plugin-inject-contract.spec.ts](../../packages/rxdb/src/__tests__/contracts/plugin-inject-contract.spec.ts) 是这次测试里最有品味的一份。前言说清楚了：api-baseline 只记一行名字，把封闭取值放宽成 `string`、把 `inject` 改成可变、把前缀从 `plugin:` 换掉，`--check` 都不 diff。所以用 `@ts-expect-error` 钉 `'search'` / `'plugin:Search'` / `'service:logger'` / `'adapter:cache'`。这是对的工具。

[RxDB.plugin-inject.spec.ts](../../packages/rxdb/src/__tests__/RxDB.plugin-inject.spec.ts) 覆盖 AC#1–5、7、9–11，外加 `localAdapterSync` 与并行 connect 的 warn 闸门。AC#6 正确地放在调度器单测（没有公开 API 能驱动「同名、中途从不空」）。

### AC 对照

| AC    | 状态      | 备注                                                                                               |
| ----- | --------- | -------------------------------------------------------------------------------------------------- |
| 1–11  | ✅ 有测试 | 强制测试 6 弱于 spec，阶段 A 可接受                                                                |
| 12    | ⚠️        | spec 自己写了：`ready` **有意改变**，迁移文档已覆盖（问题 6 撤销）；跨纪元旧引用见问题 1，规格之内 |
| 13–17 | ⬜        | 阶段 B，spec 允许不开工                                                                            |
| 18    | ✅        | 契约测试                                                                                           |
| 19    | ⬜        | 本评审没跑 lint/test/coverage/`test-all`；基线一项复核后无事可做（问题 3 撤销）                    |
| 20    | ✅        | authoring + migration                                                                              |

### search 插件 🟢（初评 🟡 / 问题 1 判 🔴，复核订正）

迁到 `inject: ['adapter:local']` + `lifecycle: 'scoped'`，拆掉 `SearchPluginPhase` 和自等 `adapterConnected$` / `connect()`，是整次改动的用户价值。fail-fast schema 现在会 reject `ready`（以前挂起）。D2 附：FTS 仍在 `install()` promise 里走 `bootstrapTransaction`，`await connect()` 返回即 FTS 可用这条还在。

每轮 plan 之前验 `scope.state`、identity-guard teardown / `#failInstall()`，方向对。**复核订正**：问题 1
的机制不成立——这两处守卫只在旧纪元收尾时触发，与现有测试都是对的，不再当 🔴。

### 三框架 🟢（本次范围之内）

绑定包 API 没动，只有 README。对称性不在这条 PR 的破坏面上。

三端 demo `/search` 进页守卫是去掉自 connect 的正确后果，文案对称：深链会在字段初始化 / 首屏渲染里同步调 `db.search()`，不连就抛「plugin is not installed」。`connect()` 自带去重。这是该改的 demo，不是三端 API 分裂。

### 文档 🟢

[authoring.md](../../website/docs/plugins/authoring.md) 把「声明依赖、不要自己等」写清楚了：`install()` 里 `await db.connect()` 是在等自己；`plugin:*` 阶段 B 未解析；`await connect()` 返回 ≠ 插件已装。这是作者文档该有的样子。

[plugin-scope.md](../../website/docs/migration/plugin-scope.md) 给出迁移 diff：`use(search)` 之后必须显式 `connect`。漏了的表现和 warn 文案都写了。

## 合入前必做

复核后从 6 条收到 3 条，均已执行：

- [x] 清掉「`#install_one_plugin` 是全部入口」等三处过期注释（问题 5）
- [x] 拆无关 diff、重写提交信息（问题 2）——`feat(rxdb)` / `chore` / `docs(review)` 三刀，
      原 8 个 `123` / `qweqwe` 提交已重建；改写前的历史留在 `backup/next-2-pre-rewrite`
- [x] 跑 AC#19（问题 7）：`tag:js-lib` 全量 lint/test/build 绿（22 个项目）；`rxdb` 覆盖率
      96.13 / 91.79 / 97.42 / 97.09（≥ 90）；`rxdb-plugin-search` 93.37 / 83.37 / 95.30 / 95.59（≥ 80）；
      基线 `RxDBPluginDependency` 在位

已撤销，不做：

- ~~修 `RxDBPluginSearch.#runInstall()` abort-success~~ —— 三个方案对唯一可达路径全无效（问题 1）
- ~~`RxDB.localAdapterSync` 写进 api-baseline~~ —— 基线不收类成员（问题 3）
- ~~决定 `plugin:*`~~ —— 回退已交付的 AC#18（问题 4）

阶段 A 本身值得合。挡在前面的从来不是正确性缺陷，是没跑过的门禁和一段读不了的提交历史。

## 解决记录

- [x] 2026-08-21 复核：7 条逐条对着代码验，3 条成立并已修；问题 1 降级，问题 3 / 4 / 6 撤销
- [x] 2026-08-21 提交历史重建为 3 刀，改写前的 8 个提交留在 `backup/next-2-pre-rewrite`
- [ ] `pnpm test-all` 通过（AC#19 最后一项）
- [ ] 开 PR（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
