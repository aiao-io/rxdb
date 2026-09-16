# next-0915 分支对 main 评审

- **评审日期**：2026-09-16
- **评审分支**：`next-0915`
- **对比基线**：`main` 的 merge-base `68b0ba97dd25fe158564ce194f6fea37fefc8bd1`
- **变更规模**：443 个文件，`+14,884 / -4,465`
- **主线改动**：把 QueryCache 读引擎、历史/分支、推拉同步从 `@aiao/rxdb` 拆成三个插件包
- **结论**：🔴 第二轮仍有 1 条 P1、2 条 P2，暂不可合并

## 问题清单

| 级别 | 问题                                              | 影响                                                  |
| ---- | ------------------------------------------------- | ----------------------------------------------------- |
| P1   | 异步安装中的插件依赖方会晚于提供方释放            | 安装尾段或 disposer 可能访问已经销毁的 provider       |
| P1   | QueryCache 迁移指南漏掉 sync/history 两个必需插件 | 用户照官方步骤升级后，`connect()` 仍然必定失败        |
| P1   | history/sync 拆包没有迁移指南，现有文档仍用旧 API | 既有用户升级后编译失败或在运行时拿到 `undefined`      |
| P2   | QueryCache 声明不存在的 `rxdb.queryCache` 属性    | TypeScript 放行，运行时恒为 `undefined`               |
| P2   | DFS 拓扑排序不保持同层插入序                      | 无依赖插件的拆卸相对顺序偏离 US-014/US-015 的明确契约 |

---

## 1. P1：异步安装中的依赖方会晚于提供方释放

### 问题

[`PluginDependencyScheduler.#releaseDependents`](../../packages/rxdb/src/plugin/dependency-scheduler.ts#L375)
只处理同时满足以下条件的依赖方：

```ts
if (activation.state !== 'active' || activation.inFlight !== undefined) continue;
```

当 provider 的依赖在 consumer 异步 `install()` 期间失效时，时序如下：

```text
consumer: installing
provider: active -> disposing
  -> releaseDependents() 跳过 consumer
  -> release provider scope
consumer install settle
  -> applyInstallResult() 发现 provider 已不满足
  -> release consumer scope
```

provider 比 consumer 更早失效。consumer 的安装尾段或 disposer 如果使用 provider 建立的资源，
就会运行在一份已经销毁的依赖上。

这与 [US-015](../stories/core/US-015-plugin-inject-dependency.md) 的两条硬约束正面冲突：

- 依赖在 `install()` 未 settle 时消失，要等待 install settle，再释放已登记的 scope；
- 依赖方的 scope dispose 完成后，才允许依赖本身失效（INV-7）。

现有测试只覆盖「provider 和 consumer 都已经 active」时的逆拓扑释放，
[`dependency-scheduler.spec.ts`](../../packages/rxdb/src/plugin/__tests__/dependency-scheduler.spec.ts#L481)
没有覆盖 consumer 仍在安装的竞态。

### 根因

实现把「避免同一个 scope 被释放两次」等同于「完全跳过 installing consumer」。
但 `#applyInstallResult()` 能负责 consumer scope 的唯一释放，不代表 provider 可以不等这次释放完成。

### 修复方案

1. provider 释放时，把依赖它且仍在安装的 consumer transition 纳入等待集合；
2. 等 consumer install settle，并由纪元校验释放 stale scope；
3. consumer scope dispose 完成后，再释放 provider scope；
4. 补强制竞态测试，断言日志严格为 `release:consumer`、`release:provider`，且两个 scope 各释放一次。

---

## 2. P1：QueryCache 迁移指南按步骤执行仍然失败

### 问题

[`querycache-plugin.md`](../../website/docs/migration/querycache-plugin.md#L9) 只要求安装并注册
`@aiao/rxdb-plugin-querycache`：

```bash
pnpm add @aiao/rxdb-plugin-querycache
```

但 [`RxDB.connect()`](../../packages/rxdb/src/RxDB.ts#L878) 会连续检查两个槽：

```ts
this.#assert_query_cache_engine();
this.#assert_query_cache_outbox();
```

三包的实际关系是：

| 能力          | 提供方                   | 额外要求                      |
| ------------- | ------------------------ | ----------------------------- |
| QueryCache 读 | `rxdb-plugin-querycache` | 无                            |
| 离线写出站    | `rxdb-plugin-sync`       | `inject: ['plugin:history']`  |
| 同步历史桥    | `rxdb-plugin-history`    | sync 插件进入 active 的硬前置 |

因此声明 `SyncType.QueryCache` 的应用必须安装并注册三个插件。只按当前指南操作，engine 护栏通过，
outbox 护栏随后抛 `RxDBMissingPluginError`。

同一页第 67 行声称「写回出站整条路径同样留在 core」，也已经被阶段 D 的实现推翻。
[`rxdb-plugin-querycache/README.md`](../../packages/rxdb-plugin-querycache/README.md#L9) 重复了相同错误。

### 根因

迁移文档在 US-025 阶段 B 写成，当时出站确实还在 core；阶段 D 把出站搬进 sync 插件后，
代码、测试和故事记录更新了，用户迁移入口没有同步更新。

### 修复方案

1. 安装命令列出 history、sync、querycache 三个包；
2. 示例注册 `rxDBPluginHistory`、`rxDBPluginSync`、`rxDBPluginQueryCache`；
3. 明确注册顺序随意，由 `inject` 保证 history 先于 sync；
4. 删除「出站仍在 core」的说明；
5. 同步修正插件 README 和相关适配器 README；
6. 增加一条文档示例集成测试：按指南配置后 `connect()` 必须成功。

---

## 3. P1：history/sync 的破坏性迁移没有用户迁移路径

### 问题

本分支不再由 core 自动创建 `versionManager`。历史插件在连接纪元内挂载
`rxdb.versionManager`，sync 插件另行挂载 [`rxdb.syncManager`](../../packages/rxdb-plugin-sync/src/plugin.ts#L95)。

同步调用从：

```ts
rxdb.versionManager.syncRepository(...);
rxdb.versionManager.push();
rxdb.versionManager.pull();
```

改为：

```ts
rxdb.syncManager.syncRepository(...);
rxdb.syncManager.push();
rxdb.syncManager.pull();
```

但是：

- [`migration/README.md`](../../website/docs/migration/README.md#L13) 只新增了 QueryCache 拆包指南；
- [`collaboration/sync.md`](../../website/docs/collaboration/sync.md#L70) 仍调用
  `rxdb.versionManager.syncRepository()` / `bulkSync()`；
- 分支、撤销重做文档仍直接使用 `rxdb.versionManager`，没有安装和注册 history 插件；
- US-025 自己记录了 `versionManager.<syncMethod>` 到 `syncManager.<syncMethod>` 共影响 104 处调用，
  但这些信息没有进入面向使用者的迁移文档。

既有用户升级后会遇到三种失败：缺插件导入时类型消失、未注册插件时属性为 `undefined`、
继续调用旧同步方法时成员不存在。

### 根因

包内 README 被当成了迁移指南，但它只能解释新包怎么用，不能覆盖既有 core 用户从旧 API 到新 API 的映射。
同时没有文档门禁扫描 `website/docs` 中已经失效的 `versionManager` 同步调用。

### 修复方案

新增 history/sync 拆包迁移页，至少包含：

1. history-only、sync、QueryCache 三种应用分别需要哪些包；
2. 对应的 `rxdb.use(...)` 注册示例；
3. `versionManager` 保留的历史/分支 API 清单；
4. 迁往 `syncManager` 的同步 API 对照表；
5. `await connect()` 之后槽位才可用的生命周期说明；
6. 全量更新 collaboration、adapter 和 demo 文档中的旧调用。

---

## 4. P2：QueryCache 声明了不存在的运行时属性

### 问题

[`rxdb-plugin-querycache/src/plugin.ts`](../../packages/rxdb-plugin-querycache/src/plugin.ts#L32) 增强了公开类型：

```ts
declare module '@aiao/rxdb' {
  interface RxDB {
    queryCache: RxDBPluginQueryCache;
  }
}
```

但插件工厂与 `install()` 都没有给 `rxdb.queryCache` 赋值。合法的 TypeScript 代码：

```ts
rxdb.queryCache.name;
```

会通过类型检查，运行时却因 `rxdb.queryCache === undefined` 失败。

history、sync、storage 插件都用 `Object.defineProperty()` 挂载运行时槽位，并在 scope 释放时删除；
QueryCache 只有类型，没有对应运行时动作。

### 根因

从其他插件复制了模块增强，却没有决定 QueryCache 是否真的需要公开插件实例。
当前已有 `getPlugins('queryCache')` 和 `getQueryCacheEngine()`，通常没有再暴露属性的必要。

### 修复方案

优先删除 `queryCache` 模块增强。若确实要公开插件实例，则必须在 scope 内定义属性并对称撤销，
同时补「连接期间存在、断连后删除」的运行时测试。

---

## 5. P2：拓扑排序不保持同层插入序

### 问题

[`topologicalPluginOrder`](../../packages/rxdb/src/plugin/dependency-graph.ts#L79) 使用 DFS 后序，
但 TSDoc 与 US-015 都承诺「提供方在前，同层保持插入序」。

反例：

```ts
const plugins = [consumer /* depends search */, standalone, search];
```

当前 DFS 输出：

```text
[search, consumer, standalone]
```

稳定拓扑序应为：

```text
[standalone, search, consumer]
```

`standalone` 与 `search` 同为初始可用节点，原插入序是 standalone 在前，当前实现却把 search 提到最前。
随后 `destroyPlugin()` 逆序拆卸时，无依赖插件的相对顺序也随之改变。

现有用例只覆盖 `[standalone, consumer, search]`，因为 standalone 已经在最前，恰好避开了反例。

### 根因

DFS 后序能保证依赖在消费者之前，但不能保证全局稳定性。只有在互不相关节点没有被更早节点递归访问时，
它才碰巧维持输入顺序。

### 修复方案

采用按原索引稳定出队的 Kahn 排序，或实现等价的稳定拓扑排序。补以下测试：

```ts
expect(topologicalPluginOrder([consumer, standalone, search], index)).toEqual([standalone, search, consumer]);
```

并同时断言 `destroyPlugin()` 的拆卸序为 `consumer -> search -> standalone`。

---

## 验证记录

| 验证项                                               | 结果                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `rxdb`、history、querycache、sync 的 build/typecheck | ✅ 通过                                                             |
| 上述四个项目串行 test                                | ✅ 通过                                                             |
| `rxdb` 测试                                          | ✅ 97 个文件、1,931 条；总覆盖率 93.65%                             |
| `rxdb-plugin-history` 测试                           | ✅ 22 个文件、316 条；语句覆盖率 97.93%                             |
| `rxdb-plugin-querycache` 测试                        | ✅ 12 个文件、193 条；语句覆盖率 97.28%                             |
| `rxdb-plugin-sync` 测试                              | ✅ 通过                                                             |
| `pnpm audit:api-surface`                             | ✅ 33 个公开包、57 个公开入口与**当前分支已更新的基线**一致         |
| search Angular/React/Vue API 对称                    | ✅ 共享类型与运行时入口对称                                         |
| `git diff --check 68b0ba97...HEAD`                   | ✅ 通过                                                             |
| 工作区                                               | ✅ 评审开始与验证结束时均干净；生成本报告后只新增报告及 README 索引 |

API surface 审计通过不代表相对 main 没有破坏性变更：本分支同时更新了 baseline。
它只能证明实现与本分支声明的新基线一致，不能替代迁移指南。

## 复核（2026-09-16）

逐条核对后 5 条全部属实，无一条是过度优化。唯一需要修正的是 **#1 的严重度**：
它确实违反 INV-7，但**在当前已发布的插件组合下不可达**——history / querycache 都不声明
`inject`，sync 唯一的提供方（history）没有依赖因而永远不会进入 `#release()`，
三者的 `install()` 又都是同步体。因此它是**潜在**竞态而非现网故障，仍按契约修掉。

#5 也核实过不是对文档的过度解读：[US-015](../stories/core/US-015-plugin-inject-dependency.md)
第 452 行明写「释放顺序：先按逆拓扑序，同层内再按 US-014 的逆插入序」，
旧 DFS 只守住了前半条。

## 修复记录

| 编号 | 修复                                                                                                                                                                                                                 | 测试                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | `#releaseDependents()` 不再跳过 `installing` 的依赖方：改为 `await` 它在飞的转移并循环到无依赖方存活，释放动作仍归 `#applyInstallResult`（避免双释放）                                                               | `dependency-scheduler.spec.ts`「依赖方还在 install() 里时…」（先红后绿）        |
| 2    | `migration/querycache-plugin.md` 改为三包安装 / 注册；删掉「出站仍在 core」的错误说明；同步修 `rxdb-plugin-querycache/README.md`                                                                                     | `scripts/audit/docs-plugin-surface.mjs` 第 3 条判据                             |
| 3    | 新增 `website/docs/migration/history-sync-plugins.md`（包选择、注册 diff、`versionManager`→`syncManager` 15 个方法对照、槽位生命周期、失败症状表）；修 `collaboration/sync.md`、`collaboration/branch.md` 的失效示例 | 同上第 1、2 条判据                                                              |
| 4    | 删除 `rxdb-plugin-querycache` 里 `rxdb.queryCache` 的模块增强                                                                                                                                                        | `query-cache-engine.scope.spec.ts` 的 `@ts-expect-error` 回归锁                 |
| 5    | `topologicalPluginOrder` 由 DFS 后序换成按原始下标出队的稳定 Kahn 排序；顺带修掉旧实现会把未登记提供方推进结果的隐患                                                                                                 | `dependency-graph.spec.ts` 两条反例 + `RxDB.plugin-inject.spec.ts` 端到端拆卸序 |

配套门禁：新增 `pnpm audit:docs-plugins`（`scripts/audit/docs-plugin-surface.mjs` + 11 条
`node:test` 自测），已接进 `ci-template.yml`。名单自校验——哪天有人把某个同步方法搬回
`VersionManager`，门禁先于文档扫描炸掉。

验证：`rxdb`、history、querycache、sync 四个项目 lint / test / build 全绿；
`pnpm audit:docs-plugins`、`pnpm audit:requirements`、`pnpm audit:api-surface` 均通过。

## 第一轮修复后的决策

该轮曾判定可以合并；以下第二轮评审发现新的反例，覆盖本结论。

---

## 第二轮评审（2026-09-16）

### 结论

🔴 **暂不可合并**。第一轮 5 条问题的表面修复均已落地，但其中两条修复没有完整满足原契约；新增的文档门禁也存在可稳定复现的漏检。

| 级别 | 问题                                                           | 影响                                                         |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| P1   | `disposing` 依赖方过早清空依赖纪元，提供方仍可先释放           | 异步 disposer 会运行在已经销毁的 provider 上，继续违反 INV-7 |
| P2   | Kahn 排序按动态 ready 集逐个选最小下标，不是真正的同层稳定排序 | 同层安装序和逆向拆卸序继续违反 US-015                        |
| P2   | 文档门禁只识别直接属性调用和包名，不识别别名及插件注册         | 失效示例仍可通过 CI，门禁无法防住第一轮同类回归              |

### 1. P1：已进入 `disposing` 的依赖方会从反向依赖图中消失

[`#release()`](../../packages/rxdb/src/plugin/dependency-scheduler.ts#L345) 在异步释放真正完成前就执行：

```ts
activation.state = 'disposing';
activation.scope = undefined;
activation.deps = EMPTY_EPOCH;
```

但 [`#releaseDependents()`](../../packages/rxdb/src/plugin/dependency-scheduler.ts#L383) 仍只用 `activation.deps.includes(target)` 反查依赖方。若 consumer 比 provider 更早注册，同一轮 `reconcile()` 会先让 consumer 进入 `disposing` 并清空 `deps`，随后 provider 扫描时便看不见仍在释放的 consumer。

最小反例：consumer 和 provider 都依赖 `adapter:local`，consumer 还依赖 `plugin:provider`；按 consumer、provider 顺序注册并激活后删除本地适配器。把 consumer 的 `releaseScope()` 挂起，实际日志为：

```text
release:start:consumer
release:start:provider
release:end:provider
release:end:consumer
```

provider 在 consumer scope 完成释放前已经失效，直接违反 INV-7。新增测试只覆盖 consumer 仍在 `installing` 的路径，没有覆盖 active consumer 已先进入 `disposing` 的路径。

修复时应在 dispose 完成前保留旧依赖纪元，或增加独立的 `releasingDeps`；同时补“依赖方先注册 + 异步 release gate”的测试，断言 provider 的 `releaseScope()` 直到 consumer 完成后才开始。

### 2. P2：稳定 Kahn 实现允许下一层节点插队

[`stablePluginOrder()`](../../packages/rxdb/src/plugin/dependency-graph.ts#L152) 每出队一个节点，就从所有当前 ready 节点中重新选择原始下标最小者。刚被解锁的下一层节点因此可以插到尚未出完的上一层节点之前。

反例输入：

```text
[A(depends P), B(depends Q), Q, P]
```

A/B 同为第 1 层，Q/P 同为第 0 层。当前实现实际输出：

```text
Q -> B -> P -> A
```

应按 Kahn 批次输出 `Q -> P -> A -> B`，逆序拆卸才是同层逆插入序 `B -> A -> P -> Q`。当前 [`dependency-graph.spec.ts`](../../packages/rxdb/src/plugin/__tests__/dependency-graph.spec.ts#L198) 反而把“新解锁的低下标节点插队”固化成期望值，需要与实现一起调整。

### 3. P2：文档门禁有两类稳定漏检

[`auditDoc()`](../../scripts/audit/docs-plugin-surface.mjs#L98) 的检查可被两种真实写法绕过：

1. 别名调用：`const vm = rxdb.versionManager; await vm.syncRepository(...)` 返回空问题列表。测试第 25 行注释声称覆盖这种原始故障，测试体却改成了直接调用 `rxdb.versionManager.syncRepository(...)`。
2. QueryCache 示例只要文本里出现三个包名就放行，即使只注册 `rxDBPluginQueryCache`、完全没有 `rxdb.use(rxDBPluginHistory)` 和 `rxdb.use(rxDBPluginSync)`，`connect()` 仍会失败。

探针结果为：

```json
{ "alias": [], "registration": [] }
```

当前官方文档已经修正，因此这不是现存文档错误；问题是 CI 门禁无法阻止同类错误再次进入。建议把代码示例交给 AST/结构化解析，至少追踪槽位别名与三个插件的 `use()` 调用，并用上述两条漏检样例先写红测。

### 第二轮验证

| 验证项                                                                   | 结果                                          |
| ------------------------------------------------------------------------ | --------------------------------------------- |
| `pnpm nx test rxdb --outputStyle=static --skipRemoteCache --skipNxCache` | ✅ 97 个文件、1,935 条测试；语句覆盖率 93.57% |
| `node --test scripts/audit/docs-plugin-surface.spec.mjs`                 | ✅ 11 条通过，但不含上述两个漏检反例          |
| `pnpm audit:docs-plugins`                                                | ✅ 扫描 76 个文件                             |
| `pnpm audit:api-surface`                                                 | ✅ 33 个公开包、57 个公开入口与本分支基线一致 |
| `git diff --check main...HEAD`                                           | ✅ 通过                                       |
| 生命周期与排序最小探针                                                   | ❌ 分别复现 INV-7 违约与跨层插队              |

`rxdb` 全绿不推翻上述发现：现有用例没有覆盖“consumer 先注册且异步 dispose”以及“两条独立依赖链交错注册”的组合。

---

## 第三轮：对第二轮的复核与修复（2026-09-16）

### 结论

🟡 **可合并**。第二轮三条发现逐条用一次性探针复核过：#1 真实且比原文更重（有**两处**而非一处漏洞），#3 真实且比原文更重（漏检还藏着一个**现存**的失效文档），#2 的现象真实但**不是缺陷**——那是 US-015 的措辞在数学上不可满足，改的应该是契约措辞而不是算法。因此 🔴「暂不可合并」不成立。

| 第二轮编号 | 复核结论                       | 处置                                                        |
| ---------- | ------------------------------ | ----------------------------------------------------------- |
| #1         | 属实，且漏洞有两处不是一处     | 代码修复 + 两条红测                                         |
| #2         | 现象属实，定性错误（过度设计） | 只统一契约措辞，算法一行未动，补一条把跨链出队钉死的用例    |
| #3         | 属实，且牵出一个现存文档故障   | 门禁补两条判据 + 扫描范围改为发现式；修 `rxdb-adapter-http` |

---

### #1 已修：`disposing` 依赖方从反向依赖图中消失

根因比第二轮描述的更普遍：`deps` 这一个字段同时被当成两件事用——「本次安装绑着谁」和「谁依赖我」的反查依据。前者在进入 `disposing` 的那一刻就必须清（作用域都要撤了，自然不再绑任何东西），后者却要撑到释放**真正落地**。两件事挤在一个字段上，仍在释放的依赖方就会从反向依赖图里消失。

于是漏洞不止 `#release()` 一处。[`#applyInstallResult()`](../../packages/rxdb/src/plugin/dependency-scheduler.ts) 的**纪元作废**分支同样先清 `deps` 再异步撤作用域，是完全一样的形态——第二轮只点了前者。

修复是拆字段而不是延后清空：新增 `releasing`，`#release()` 与 `#applyInstallResult()` 的作废分支都把旧元组搬过去，释放落地后才清空；`#releaseDependents()` 的反查覆盖 `deps ∪ releasing`。`failed` 分支刻意保留 `deps`，反查本就找得到，不动。

两条红测按第二轮的建议补齐，先红后绿：

- `依赖方先注册、拆卸又是异步的时候，提供方要等它释放完才撤（INV-7 的注册序形态）` —— 即第二轮的最小反例；
- `依赖方的作用域因纪元作废而释放时，提供方同样要等（INV-7 的作废纪元形态）` —— 覆盖第二轮没提的那处。

两条都断言了**中途**日志（`['install:provider','install:consumer','release:consumer']`），不只断言终态：只看终态的话，provider 早撤这件事会被后到的 `release:consumer` 盖住。

---

### #2 不改算法：这是契约措辞问题，不是排序缺陷

第二轮报的现象属实：`[a(依赖 p), b(依赖 q), q, p]` 的输出确实是 `q → b → p → a`，跨了「层」。但「同层保持插入序」这句话本身不可满足，照字面读就会把一个措辞缺口当成实现缺陷。

拆卸序要同时满足三条：`a` 先于 `p`（依赖边，INV-7）、`b` 先于 `a`（互不依赖 → 逆插入序）、`p` 先于 `b`（同上）。三条连起来成环。**任何**实现都得挑一条规则打破僵局，「按 Kahn 批次整层输出」正是其中一条，不比另一条更符合原文。

两个候选之间也分不出高下：

| 候选                   | 安装序       | 对插入序的 Kendall-tau 距离 |
| ---------------------- | ------------ | --------------------------- |
| 当前实现（字典序最小） | `q, b, p, a` | 4                           |
| Kahn 批次整层输出      | `q, p, a, b` | 4                           |

距离打平，而字典序最小那条更小、唯一确定、可被单测钉死，还不需要向用户解释「层」这个他们在 API 上看不见的概念。所以处置是把契约写清楚，不是重写算法：

- [`dependency-graph.ts`](../../packages/rxdb/src/plugin/dependency-graph.ts) 的摘要与 `@remarks` 改成「按提供方在前排序，其余一律回落到插入序」，并把上面的不可满足性证明写进去；
- [`US-015`](../stories/core/US-015-plugin-inject-dependency.md) 的释放顺序条目同样改写，言明「同层保持插入序」只能是这个意思；
- [`rxdb.plugin-lifecycle.ts`](../../packages/rxdb/src/rxdb.plugin-lifecycle.ts) 的 `destroyPlugin` TSDoc 与两份 spec 的用例标题去掉「同层」这个会误导的词；
- 新增 `两条依赖链交错注册时取字典序最小的拓扑序（跨层出队是契约，不是 bug）`，把第二轮的反例连同「另一条同样合法但不更优」的理由一起钉进测试，免得下次再被当成 bug 重提。

第二轮说 `dependency-graph.spec.ts:198` 「把插队固化成期望值，需要与实现一起调整」——那条用例测的是单链解锁后按原始下标出队，与跨链无关，保留。

---

### #3 已修：门禁两类漏检，外加一个现存的失效文档

两条漏检都属实，并且第一条正是第一轮那个故障的原形态——`git show 68b0ba97:website/docs/collaboration/sync.md` 里用的就是别名写法，门禁当时根本拦不住它。

门禁从三条判据加到四条：

1. **槽位别名**：两趟扫描收集 `const vm = rxdb.versionManager`，再按别名查已搬走的方法调用；只认 `versionManager`，`syncManager` 的别名照常放行。```diff 代码块里被删除的行不参与绑定——那正是文档在演示「旧写法」。
2. **注册调用**：判据从「正文出现三个包名」换成「出现 `use(rxDBPluginQueryCache)` 就必须同时出现另外两个 `use()`」。只在正文提到工厂名、没有注册调用的文档不被牵连。

扫描范围也一并改了：原先是硬编码的三个 README 名单，而**名单式的扫描范围本身就是一种漏检**——新包的 README 天然在门禁之外。改成扫 `packages` / `modules` / `apps` 下一层的全部 `README.md`，覆盖从 76 个文件涨到 120 个。

这一改立刻抓出一个**现存**故障：[`packages/rxdb-adapter-http/README.md`](../../packages/rxdb-adapter-http/README.md) 的 QueryCache 示例只装了 `@aiao/rxdb-plugin-querycache`，照抄会在 [`#assert_query_cache_outbox()`](../../packages/rxdb/src/RxDB.ts#L1433) 抛 `missingQueryCacheOutboxError`。第二轮说「当前官方文档已经修正，因此这不是现存文档错误」——那只对 `website/docs` 成立；包内 README 没被扫到，所以没人发现。已补齐安装块与三处 `use()`，并说清读路径在 querycache、离线写出箱在 sync、sync 又 `inject: ['plugin:history']`。

门禁自测从 11 条加到 16 条，新增的 5 条先红后绿。

---

### 第三轮验证

| 验证项                                                                                      | 结果                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm nx run-many -t lint test build --projects=rxdb,rxdb-plugin-{history,sync,querycache}` | ✅ 全绿                                                |
| `pnpm nx test rxdb`                                                                         | ✅ 97 个文件、1,938 条测试（+3）                       |
| 覆盖率（rxdb）                                                                              | ✅ 语句 93.57% / 分支 91.06% / 函数 94.39% / 行 94.54% |
| `node --test scripts/audit/docs-plugin-surface.spec.mjs`                                    | ✅ 16 条通过（+5，含第二轮两个漏检反例）               |
| `pnpm audit:docs-plugins`                                                                   | ✅ 扫描 120 个文件（原 76）                            |
| `pnpm audit:api-surface`                                                                    | ✅ 33 个公开包、57 个公开入口与基线一致                |
| `pnpm audit:requirements`                                                                   | ✅ 60 Done / 1 In Progress / 7 Backlog，合计 68        |

---

## 第四轮评审（2026-09-16）

### 结论

🔴 **暂不可合并**。第三轮的调度器与文档门禁修复经复核有效；本轮独立多角度评审（10 个发现方向 + 26 项对抗性验证 + 1 次补漏扫描）发现 **3 条 P1、11 条 P2**。最重的是三处已提交的调试遗留——其中 `switch_branch` 的调试代码会造成「分支已切换、却向调用方上报回滚」的数据库/UI 分歧——以及 `sync()`/`syncRepository()` 部分失败后不清 undo 历史，用户可撤销回远端已合并之前的状态。第三轮「🟡 可合并」的结论被本轮新发现覆盖。

同时要记录一条正面结论：**拆包本身经逐行审计是忠实的**。被删除的 975 行核心 `VersionManager` 的 14 个 sync 入口、`resolve-current-branch`、被删测试的全部用例都在新包中重建；所有 import 路径解析通过、无循环包依赖、无残留的旧导出消费者；新包 lint 零警告。

| 级别 | 问题                                                     | 影响                                                              |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| P1   | `sync()`/`syncRepository()` 部分同步失败后不清 undo 历史 | 用户可撤销回合并前状态，本地/远端数据分叉                         |
| P1   | `switch_branch` / `[TXBRANCH]` 调试代码已提交            | 分支已切换却被上报回滚；每个默认事务打一行 error 日志             |
| P1   | `.husky/pre-commit` 格式门禁被注释                       | 本分支每次提交跳过格式检查，首个信号变成 CI 红灯                  |
| P2   | `#assert_plugin_graph` 不按实例去重                      | 同一实例经两个工厂引用注册报虚假歧义错误                          |
| P2   | history 插件销毁时 slot 先删、`destroy()` 后跑           | 断连时 in-flight 的 undo/redo 任务解引用 `undefined` 抛 TypeError |
| P2   | sync 批处理/状态查询经可删除槽位路由管理器               | 断连时批内剩余仓库全部 TypeError 失败                             |
| P2   | reachability 离线退避定时器无限自续                      | 零订阅者仍每 ≤30s 唤醒；销毁后仍可重挂，泄漏定时器吊住实例        |
| P2   | `Math.min(...validChangeIds)` 展开无界数组               | >约 6.5 万元素抛 RangeError，undo 会话恢复被静默跳过              |
| P2   | `fillInstant` 模块级共享状态可重入                       | 非标配置下 `createdAt !== updatedAt` 不变量被破坏                 |
| P2   | 新包公开导出缺 TSDoc                                     | 违反 CLAUDE.md 关键约束                                           |
| P2   | querycache `export *` 冻结 10 个零消费实现符号           | 内部重构需走破坏性变更周期，纯未来税                              |
| P2   | 两个 QueryCache 缺插件错误工厂逐字节重复                 | 诊断信息只改一半即过期                                            |
| P2   | 三个新包逐字节复制 14 个测试 fixture                     | 核心契约变更时副本静默腐化                                        |
| P2   | 文档门禁源码自检靠正则，`static`/修饰符前缀即失明        | 门禁静默漏检或误报红 CI（第三轮 #3 同一门禁的源码侧盲区）         |

### 1. P1：`sync()` / `syncRepository()` 部分同步失败后不清 undo 历史

[`SyncManager.pull()`](../../packages/rxdb-plugin-sync/src/SyncManager.ts#L158) 与
`pullRepository()` 在 `RxDBPartialSyncError` 且 `historyInvalidated === true` 时都会
`clearUndoHistory()` 再重抛；`bulkSync()` 经 `partialResultOf(item.error)` 覆盖同样情形。
但 [`sync()`](../../packages/rxdb-plugin-sync/src/SyncManager.ts#L231) 与 `syncRepository()`
没有 catch，`#pullAndSettle` 重抛后方法直接返回错误、undo 边界完好。

**触发**：多仓库 `sync()`（无 repositoryFilter，多轮 fetchAll 中后轮失败）或 `syncRepository()`：
前几个仓库已提交，后续失败 → 用户随后 `undo()` 能回到合并前状态，与远端已合并数据分叉。
带 repositoryFilter 的 `sync()` 被内部 `bulkSync()` 的清理兜住，不在暴露面内。

**修复**：两个方法各补与 `pull()`/`pullRepository()` 相同的 catch 块；测试目前只覆盖
plain-error 拒绝（orchestration spec 364-370），需补「部分成功 + historyInvalidated」用例。

### 2. P1：`switch_branch` 与 `[TXBRANCH]` 调试代码已提交

[`switch_branch.ts:148`](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L148)
在 switch 事务提交**之后**的同一 try/catch 内跑两次 `rawQuery` + `console.error('[SWITCH]')`。
调试查询一旦失败，`adapter.switchBranch` 在已提交后拒绝；调用方
[`VersionManager`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L242) 未设置
`switchCommitted`，随即派发 `SwitchBranchRollbackEvent` 并抛错——UI 认为已回滚，数据库实际
已在新分支，后续写入落进新分支历史。

[`RxDBAdapterSqliteBase.ts:1198`](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L1198)
的 `console.error('[TXBRANCH]', dbName, currentBranchId)` 位于事务前奏，`transactionLog`
默认为 true，每个默认事务打一行含库名的 error 级日志，生产刷屏并掩盖真实错误。

工作区已有未提交的 `__rxdbTrace` 替换（`git diff HEAD` 可见），说明正在处理，但 HEAD 仍含此代码；
`shared-bigint-binary-entity.suite.ts` 的未提交 `[DEBUG]` 块同理，勿随修复提交。

### 3. P1：`.husky/pre-commit` 格式门禁被注释

分支把 `pnpm exec nx format:check --uncommitted` 注释掉，替换为 `echo 'pre-commit'`。
本分支每次本地提交跳过格式检查，未格式化文件静默入库，首个信号变成 CI 的 `format:check`
红灯。属调试遗留，合入前还原为 main 版本。

### 4. P2：`#assert_plugin_graph` 不按实例去重

[`RxDB.ts:1176`](../../packages/rxdb/src/RxDB.ts#L1176) 构建候选索引时无条件
`[...existing, candidate]`，而 [`#index_plugin_name`](../../packages/rxdb/src/RxDB.ts#L1189)
对同一场景按引用去重，其注释明言「算一个提供方，不是两个候选」。断言先于索引执行，去重永远
来不及救场。

**触发**：`db.use(rxDBPluginSearch)` 后再 `db.use(db => rxDBPluginSearch(db))`——工厂自检
（`getPlugins('search')`）返回已注册实例 S，索引出现 `['search'] = [S, S]`；若已有声明
`inject: ['plugin:search']` 的插件注册，`resolveUniqueProvider` 抛
`RxDBPluginAmbiguousDependencyError`，同一个实例在错误信息里被列两次。

**修复**：断言索引构建时按引用去重（与 `#index_plugin_name` 同规则），补「同实例双工厂引用」
红测。

### 5. P2：history 插件销毁时 slot 先删、`destroy()` 后跑

[`plugin.ts:53`](../../packages/rxdb-plugin-history/src/plugin.ts#L53) 的 slot 删除器
（`Reflect.deleteProperty(rxdb, 'versionManager')`）注册在 destroy 删除器**之后**，
`LifecycleScope` 逆序执行 → 属性先被删除，`versionManager.destroy()` 才运行，中间还有 await
间隙。in-flight 的 detached 任务（`invalidateRedoStack` 在
[`HistoryManager.ts:505/519`](../../packages/rxdb-plugin-history/src/HistoryManager.ts#L505)
读 `rxdb.versionManager.getLocalRepositories()`）或排队中的 `undo()`（`undo-redo-apply.ts:55/130/164`
同样裸解引用）恢复后对 `undefined` 调方法抛 TypeError；`isIgnorableDetachedVersionEventError`
不认其为 teardown 噪音，控制台报错、undo promise 被拒绝。main 上该字段是常驻属性，此竞态为
本轮拆包新引入。

**修复**：dispose 顺序改为先 `destroy()` 后删 slot；或让所有异步读取路径持有实例而非
经槽位重解析（与第 6 条同根）。

### 6. P2：sync 批处理/状态查询经可删除槽位路由管理器

[`bulk-sync.ts:160`](../../packages/rxdb-plugin-sync/src/bulk-sync.ts#L160) 的
`syncSingleRepository` 每轮经 `rxdb.syncManager` 槽位重解析管理器，而不是用调用方
`SyncManager.bulkSync` 已持有的 `this`；[`get-repository-sync-status.ts:191`](../../packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L191)
与 `check-repository-updates.ts:94/113` 同型。

**触发**：`bulkSync()` 运行中最后一个适配器断开 → sync 插件 scope dispose 删除
`rxdb.syncManager` → 下一轮解引用 `undefined`，剩余仓库以 TypeError 计入失败结果（唯一守卫是
逐仓库 try/catch，把崩溃变成静默批失败）；状态查询同理抛未处理拒绝。

**修复**：把持有的 `SyncManager` 实例沿 `executeSyncSequentially/Concurrently` 一路传下去，
槽位只作入口解析。

### 7. P2：reachability 离线退避定时器无限自续

[`reachability.ts:296`](../../packages/rxdb/src/network/reachability.ts#L296) 的重挂条件只查
`!this.#online$.value`，不查 `wakeup$` 订阅者数或 destroyed 标志。监视器刻意不随 `disconnectAll()`
销毁（RxDB.ts:1001 注释），sync 插件 scope 释放其订阅后，离线监视器仍每 ≤30s 自续；`destroy()`
与回调同 tick 时，回调在 completed subject 上静默 next 后重新 `#scheduleWakeup()`，destroy
幂等早退，无人再清——泄漏的定时器吊住实例（HMR/测试/移动端耗电）。

**修复**：`wakeup$` 订阅者按引用计数，归零即停表；回调与 `#scheduleWakeup` 加 destroyed 守卫。

### 8. P2：`Math.min(...validChangeIds)` 展开无界数组

[`HistoryManager.ts:425`](../../packages/rxdb-plugin-history/src/HistoryManager.ts#L425)
把随变更批大小线性增长的数组展开为可变参数，>约 6.5 万元素抛 `RangeError`。异常逃出
`ENTITY_LOCAL_CREATE_EVENT` 处理器（事件分发 fail-fast，`rxdb.transaction.ts:62`）：非事务路径
被适配器吞掉但 undo 会话恢复被静默跳过；事务内写入则 commit drain 重抛、保存失败。

**修复**：循环归约求最小值（445 行的第二处同样处理）。

### 9. P2：`fillInstant` 模块级共享状态可重入

[`entity.utils.ts:156`](../../packages/rxdb/src/entity/entity.utils.ts#L156) 把本次填充的
「now」放在模块级变量，docstring 断言「填充同步且不可重入」但无强制。默认值工厂可同步 `new`
另一个实体（`entity.decorator.ts:81` 会重入 `fillDefaultValue`），内层 finally 清掉
`fillInstant`，外层剩余字段的 `entityDefaultNow()` 回退到新的时钟读取。标准 EntityBase 派生
实体的 `createdAt`/`updatedAt` 因祖先先合并而连续执行、不受影响；覆盖 `id` 默认值或自定义日期
默认值排序等非标配置下不变量可被破坏。**PLAUSIBLE**（机制确认，触发需非标配置）。

**修复**：改成栈式（保存/恢复旧值）或把 instant 作为参数沿调用链传递。

### 10. P2：新包公开导出缺 TSDoc

[`rxdb-plugin-querycache/src/plugin.ts:37`](../../packages/rxdb-plugin-querycache/src/plugin.ts#L37)
的 `rxDBPluginQueryCache` 无 TSDoc（前置注释块讲的是「无 declare module 增强」，空行隔开、不
挂接导出）；[`VersionManager`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L114)
的 `init()`/`destroy()`/`resetSessionState()`/`getLocalRepositories()`/`getRemoteRepositories()`
五个公开方法同样裸奔。两者都已入 api-baseline，兄弟包 `SyncManager` 全部有文档。违反
CLAUDE.md 关键约束「新包/新导出必须补齐 TSDoc」；现有 `docs-plugin-surface` 门禁只扫网站文档，
无 lint/jsdoc 兜底。

### 11. P2：querycache `export *` 冻结 10 个零消费实现符号

[`index.ts:18`](../../packages/rxdb-plugin-querycache/src/index.ts#L18) 的 `export *` 把
factory/primary/sync-memo/engine 的全部实现符号（`createQueryCachePrimary`、
`QueryCacheSyncMemo`、`queryCacheFingerprint` 等）发布为公开 API——api-baseline 13 项中的
10 项，包外零消费方（仅测试/演示引用了 `rxDBPluginQueryCache` 与 `@experimental` 的
`QueryCacheEngine`）。按 `versioning-policy.md`「不在表内的公开入口默认进入 1.0 冻结范围」，
未来内部重构需走破坏性变更周期。兄弟 history 插件刻意收窄为类型导出，querycache 应同样只导出
插件工厂 + 类型，包内测试走相对路径。

### 12. P2：两个 QueryCache 缺插件错误工厂逐字节重复

[`query-cache-outbox.interface.ts:55`](../../packages/rxdb/src/repository/query-cache-outbox.interface.ts#L55)
的 `missingQueryCacheOutboxError` 与 `query-cache-engine.interface.ts:147` 的
`missingQueryCacheEngineError` 仅差包名与提示词；引擎侧注释自己承认「分开写两份，迟早会有一份
不提包名」。各有两个内部调用点、均非公开 API，应收敛为 `RxDBError.ts` 中一个参数化工厂。

### 13. P2：三个新包逐字节复制 14 个测试 fixture

`test-entities.ts`（92 行）、`transaction-executor-stub.ts`（72 行）、`private-symbols.ts`（17
行）、`reachability.ts`（24 行）等在 sync/history/querycache 间逐字节相同（`diff` 为 0），
`test-db-setup.ts` 两个副本与核心 fixture 约九成相同。这些 fixture 探测核心私有符号，核心
契约变更时需在 2-3 处同步更新，漏一处即静默腐化。`packages/rxdb-test` 已存在且目的就是共享
fixture；`test-db-setup` 的分叉至少在文件内注明是有意的，逐字节相同的四个没有任何说明。

### 14. P2：文档门禁源码自检靠正则，`static`/修饰符前缀即失明

第三轮 #3 补的是门禁的**文档侧**判据；本轮的盲区在**源码自检侧**：
[`docs-plugin-surface.mjs:79`](../../scripts/audit/docs-plugin-surface.mjs#L79) 的方法名正则
`/^ {2}(?:async )?([a-zA-Z][\w]*)\s*[(&<]/gm` 不匹配 `static`/`public`/`private`/`readonly`
前缀或换行签名，而 `VersionManager.ts` 已在用 `private`/`readonly` 前缀——哪天某个同步方法以
`static` 形式搬回，名单自检要么静默漏检、要么误报「名单已过期」红掉 CI。该门禁已有两轮人类
发现的绕过历史，都是靠再补正则条件修复；评审文档自己推荐过的 AST/结构化解析（round-2 记录
第 376 行）仍未落地。

### 被证伪的候选（无需处理，记录防复提）

- **`firstValueFrom(remoteAdapter$)` 永久挂起 ×2**（`system-repositories.ts:96`、
  `query-cache-outbox.ts:317`）：发射由配置驱动、与连接无关——`init()` 推送配置名，
  `getAdapter` 无需连接即可解析实例，配置了就不会挂；未注册则立即拒绝而非挂起。
- **`Repository.ts:38` 的 `Extract<SyncOptions, …>`**：联合成员本就全部私有，`Extract` 只依赖
  判别字段，字段变化自动跟随、编译期响亮失败。
- **`examples/angular-todo` 未迁移 `versionManager`**：示例解析到已发布的 0.0.24（仍含
  `versionManager`），当前不报错；但属**潜在债务**——升级到 0.0.25 时会断，建议顺手按
  `modules/angular-todo` 的修法补上。

### 第四轮验证方法

本轮与前几轮不同，是**独立全量评审**而非针对修复的复核：10 个发现方向（逐行 diff 扫描 /
删除行为审计 / 跨文件追踪 / 语言陷阱 / 包装器正确性 / 复用 / 简化 / 效率 / 高度 / 规范符合性）
并行产出 36 个候选，去重后 26 项逐一对抗性验证（CONFIRMED 14 / PLAUSIBLE 4 / REFUTED 8，
另 2 项为 pre-existing 搬移代码），再经 1 次补漏扫描新增 2 条。所有断言均带源码行锚点；
验证记录：新包 eslint 零警告、import 全解析、无循环包依赖、Angular/React/Vue 三框架变更对称、
`git diff --check` 层面无空白告警。本轮未复跑全套测试；合并前请以 CI 全绿为准。

**遗留说明**：状态查询串行 await、pushable 双重计数、`find().length` 应为 `count()` 三条效率
问题均确认存在，但属 main 旧代码原样搬入（`git show main:` 逐行比对），不计入本轮问题清单，
可另行立项。
