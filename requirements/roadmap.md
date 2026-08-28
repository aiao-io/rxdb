# 排期与约束

> 本文回答「接下来做什么、什么必须排在什么前面」。当前状态见 [status-overview.md](status-overview.md)，发布执行见 [release-plan.md](release-plan.md)。
>
> 下表是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

## 功能建议

| 优先级 | 建议功能                           | 对应 story                                                         | 建议理由                                                                                           | 主要交付边界                                                                                                     |
| :----: | ---------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
|   P2   | 提交图与 HEAD 持久化               | [US-305](stories/collaboration/US-305-commit-graph-head.md)        | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开；卡的是桥接发布而非代码                         | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                              |
|   P2   | Electron PGlite 数据目录与事务宿主 | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md) | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议              | **先做两案对照实验**（批次 1 线 G），再做主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真 |
|   P2   | PGlite 原生全文搜索                | [US-703](stories/future/US-703-pglite-full-text-search.md)         | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                                          | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                     |
|   P3   | 多端小程序宿主（先抽契约）         | [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)    | Taro 有 `build:alipay/tt/qq/swan`，适配器只认 `wx`；先抽 host + 可行性矩阵，**不**扩大公开支持声明 | `MiniProgramHost`、微信路径零回归、`miniprogram-platform-feasibility.md`；B/C 只吃矩阵 `supported`               |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。

## 完成计划

桌面本地 SQLite 与 epic-008 链首收口后，仓库还剩 **11 条**未关闭故事（2 In Progress + 1 In Review + 8 Backlog，
口径与计数方式同 [status-overview 状态汇总](status-overview.md#状态汇总)）。本节只排**顺序与并行度，不排日期**——
依据是硬前置与已冻结的决策，不是估时。同一批内的行**彼此无依赖**，可各开各的 PR；批次之间才是顺序。
每条的关闭判据以对应 story 的 AC 为准，本表只写「什么算这条做完了」。

### 批次 1：零前置，七条线可同时开工

| 线                         | 内容                                                                                                                                                                                                                                                   | 排它进第一批的理由                                                                                                                                                                                                                                                                                                          | 关闭判据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A｜桥接版本发布**        | 按 [release-plan.md 的执行顺序](release-plan.md) 走完 0～6 步，发一个 `kind=bridge` 的**非迁移**版本                                                                                                                                                   | **单点解锁 epic-006 整条链**——US-305 / US-306（三阶段）/ US-307 / US-308 共 4 条故事今天一条都排不上，卡的不是代码而是这一次发布。投入是一次发布动作，收益是四条故事的开工权                                                                                                                                                | 五条**全部**成立才算完：① `release.version` **≠ `0.0.25`**（今天清单里的 `bridge/0.0.25` 是 0.0.25 那次发布的如实记录，不是本次成果，不许当判据用、不许改写）；② 与 `packages/rxdb/package.json` 同值；③ tag 已推送且 `git merge-base --is-ancestor v<版本>^{commit} HEAD` 人工跑过并留证；④ `migration-release-gate --release-tag=v<版本>` 全绿；⑤ 回写 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 证据。**④ 单独没有区分力**（三条 bridge 钩子只对 `kind=migration` 生效，桥接发布走不到它们，今天不做任何事直接跑就是绿的）；真正有区分力的是 ① 和 ③，而这两条**没有任何自动化在守** |
| **B｜US-015 阶段 A**       | ✅ **已完成**。留档见 [status-overview](status-overview.md#待评审1-条)：`inject: ['adapter:local']` + 纪元调度器 + search 插件迁移掉 phase 机；阶段 B 已移出承诺范围（见「明确不排期」）                                                               | —                                                                                                                                                                                                                                                                                                                           | 已达成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **C｜US-505 收尾**         | [US-505](stories/plugin/US-505-tauri-local-file-storage.md) 剩 4 条 ⚠️ + 2 条 ⬜                                                                                                                                                                       | 桌面 Local-first 的最后一块，且是 [US-905](stories/future/US-905-tauri-native-devtools.md) 阶段 2 的硬前置。两个前置（`dev-rxdb-tauri-e2e` project、三平台打包矩阵）已建好，S1～S5 迁包已关——**缺的纯粹是本故事自己的 spec**。但 AC#6 / #7 另含一次代码之外的触发动作（同线 A 性质，成本低得多），已单列为零散收尾项第 4 条 | AC#1/#3：打包应用真实重启 + 拷贝应用数据目录后启动；AC#5：≥ 50 MiB 实测 + 「内容不整体进 JS 堆」的内存观测；AC#8：磁盘满（小容量 loopback / ramdisk）；AC#6/#7：三家 webview 与三平台 smoke——缺的是本故事自己的 specs，不是触发机会。写完 specs 后仍需 `workflow_dispatch` 或一次发布才跑得到，本机跑不出来                                                                                                                                                                                                                                                                                                               |
| **D｜两张独立小票**        | ✅ **已完成**：[US-018](stories/core/US-018-generator-default-serialization.md)（含迁移表同 PR）、[US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)。**发布侧约束 12 尚未行使**——US-018 含 `BREAKING CHANGE`，不得与线 A 桥接版本同批发 | —                                                                                                                                                                                                                                                                                                                           | 已达成；发布时单独走约束 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **E｜US-904 的零前置半**   | [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 A 已 ✅（`decision: supported`）；剩阶段 C1（面板抽取，行为中性）                                                                                                             | 阶段 A 零前置，且是阶段 D 的门禁：判 `unsupported` 则阶段 D 整段不做。C1 是行为中性重构，阶段 B 已交付，不必等任何东西                                                                                                                                                                                                      | 阶段 A 已达成；C1 未开工：把面板抽成私有 Angular library，行为零变化。带出两条阶段 D 约束：Electron 43 缺整个 `chrome.permissions` 命名空间（需显式能力探测，禁静默 fallback）、扩展面板只在 dock 模式 DevTools 中注册                                                                                                                                                                                                                                                                                                                                                                                                    |
| **F｜HTTP 快车道**         | ✅ **整条已关**：[US-020](stories/core/US-020-querycache-repository.md) 阶段 A → B、[US-212](stories/adapter/US-212-http-adapter.md) 阶段 A → B                                                                                                        | —                                                                                                                                                                                                                                                                                                                           | 已达成。US-212 零前置，可直接按 `stable` 发布                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **G｜US-208 两案对照实验** | 让「IPC 事务 ID 协议」与「adapter 完整托管主进程」两案各过同一套事务与事件测试，产出选型结论                                                                                                                                                           | 从批次 3 拆出来的**决策债**，不是开发债：零前置，且结论会显著改变 US-208 的规模估计。与线 E 阶段 A 同性质——先花小钱做实证，避免大钱花错方向。捆在实现里等于把决策也一起推迟                                                                                                                                                 | 两案各有一份可运行实现与同一套事务/事件测试的结果对照，写进 [US-208](stories/adapter/US-208-electron-pglite-data-directory.md) 并**冻结选型**（约束 3）。实现本体留在批次 3                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 批次 2：批次 1 解锁后

| 顺序                                                                                                                                                                                                                                                                             | 解锁自     | 说明                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-305](stories/collaboration/US-305-commit-graph-head.md) → [US-306](stories/collaboration/US-306-working-tree-commits.md) 阶段 A → B → C →（[US-307](stories/collaboration/US-307-restore-session.md) ∥ [US-308](stories/collaboration/US-308-branch-isolation-conflict.md)） | 线 A       | epic-006 的固定顺序（约束 5），**不可交换**。US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用阶段 C 冻结的 `useWorkingTree()` 与 `bench-working-tree`                                                        |
| US-904 阶段 C2 → 阶段 D                                                                                                                                                                                                                                                          | 线 E       | C2 是四段 relay 与 v2 切换；阶段 D 的另外两个前置 US-207 / US-504 **均已 Done**。阶段 A 判 `supported` 后，D 的最后一个不确定前置已解除，现在只等 C。阶段 D 开工时须带上阶段 A 实证出的两条约束（`chrome.permissions` 缺失需显式能力探测；DevTools 必须 dock） |
| [US-905](stories/future/US-905-tauri-native-devtools.md) 阶段 1 → 阶段 2                                                                                                                                                                                                         | 线 E、线 C | 阶段 1 只门禁在 US-904 阶段 C（Chrome 是 v2 的参考实现）；阶段 2 的 US-210 前置**已 Done**，只剩 US-505。两阶段必须是独立的 PR 序列                                                                                                                            |

### 批次 3：能力与验证补齐（无硬前置，按价值排在后面）

| 故事                                                                            | 为什么不排进批次 1                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-208](stories/adapter/US-208-electron-pglite-data-directory.md) **实现本体** | 选型由批次 1 线 G 的两案对照实验冻结，本行只剩实现。**线 G 未出结论前不开工**（约束 3）                                                                                         |
| [US-703](stories/future/US-703-pglite-full-text-search.md)                      | 纯能力对称性补齐，无人被它挡住。复用现有搜索公开 API 与跨框架 parity fixture，不得为 PGlite 加 SQLite 专属 fallback（约束 6）                                                   |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 阶段 A → B → C  | 阶段 A 只抽 host + 写可行性矩阵，**不扩大公开支持声明**；B/C 只吃矩阵里 `decision: supported` 的平台（约束 7）。未关闭的阶段不得改支持声明                                      |
| [US-213](stories/adapter/US-213-http-wire-integration-test.md)                  | ✅ 已完成。零依赖 `node:http` 参考后端 + 真实 fetch，17 条 AC 全绿；`src/` 一行未动，约束 13 的 `it.fails` 出口一次都没用上（协议本身没被打出缺陷）                             |
| [US-214](stories/adapter/US-214-http-browser-demo.md) 阶段 A → B                | ✅ 已完成。三个新 project + 9 条 playwright 用例；`src/` 一行未动，唯一产物改动是协议文档「跨源（CORS）」一节（约束 14）                                                        |
| [US-021](stories/core/US-021-querycache-adapter-fail-fast.md)                   | ✅ 已完成。`missingQueryCacheAdapter` 规则 + 16 条用例；AC#7 记 ⚠️、AC#8 后半句改写，见故事                                                                                     |
| [US-022](stories/core/US-022-querycache-remote-row-contract.md)                 | ✅ 已完成。`assertQueryCacheRowContract` 落在 `rxdb-adapter-sqlite-core`，落地前判、判前不进事务；9 条 AC 全绿。另留一处同族缺口：PGlite 的 `upsert_many_sql.ts` 未检查缺非空列 |
| [US-215](stories/adapter/US-215-conditional-request-silence.md)                 | ✅ 已完成。可选 `onEtagUnreadable`，只报事实不断言成因；9 条 AC 全绿                                                                                                            |

### 零散收尾项（不成故事，随手可带）

1. **`migration-release-gate` 挂进 PR CI**（[release-plan.md 执行顺序第 0 步](release-plan.md)）：
   `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 目前只在打 tag 时跑，
   单测里被 `passingHooks` 桩掉。三条只对 `kind=migration` 生效，桥接发布用不上，
   但下一个迁移周期（US-305）会用上，且这一条**不依赖发布**，可立即做。
2. ✅ **补 `sideEffects` 声明**（已补）：`rxdb-adapter-sqlite-core` / `rxdb-plugin-storage` /
   `utils` 三个包的 `package.json` 均已写上 `"sideEffects": false`。
3. ✅ **三平台打包 CI 首跑**（已兑现）：`release-desktop.yml` 对改动自身的 PR 也触发，
   `electron-smoke` × 3 + `tauri-smoke` × 3 + `adapter-consumer` + `gate` 全绿。
4. **触发一次 `release-desktop.yml` 的 `workflow_dispatch`**（线 C 的 AC#6 / #7 用）：
   写完 US-505 的 specs 后，那两条 AC 需要一次真实的三平台运行才关得掉，**本机跑不出来**。
   这一步不依赖发布、可随时做。注意 workflow 现在跑的是 `dev-rxdb-tauri-e2e:desktop-smoke`，
   **specs 没写完之前触发它没有意义**。
5. **线 A 动手前先跑 `nx release version --dry-run` 看真实版本号**（不依赖发布，可立即做）：
   `v0.0.25` 已脱离主线，`git describe` 解析到的基准 tag 回退成 `v0.0.24`，而 `v0.0.24..HEAD` 区间里有
   11 条 `feat` + 2 条 `fix`。两个后果要在动手前确认：桥接版本会算成 minor bump（0.1.0）而不是 0.0.26；
   且该区间包含已随 0.0.25 发布过的提交，changelog 会把 0.0.25 已发的内容再写一遍，需要决定是否手工裁剪。

### 明确不排期

| 项                                                      | 判定                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-015 阶段 B（插件间依赖图）                           | **已移出 epic-008 承诺范围**。全仓库唯一的 `inject` 是 search 的 `['adapter:local']`，零 `plugin:*` 消费方。**解锁条件 = 出现第一个 `plugin:*` 依赖声明**（约束 8）。US-015 的 `In Review` 是稳态，不是待办 |
| `US-016` 连接纪元与停机收敛                             | **已移出，不再解锁**。原始症状已随 US-015 阶段 A 大部分修复；剩余的资源三步降级为 bugfix 已补齐                                                                                                             |
| `US-017` 三框架宿主作用域                               | **已移出**。三端各自已有原生作用域（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）。**解锁条件 = 三端任一出现可复现的清理泄漏**                                                  |
| US-212 AC#30 行缓存 eviction                            | **已移出 US-212**。执行面只有 core 有、HTTP 包按约束 11 的结构隔离碰不到。**解锁条件 = 出现可复现的缓存膨胀症状（具体实体 + 量级）**                                                                        |
| `npm deprecate @aiao/rxdb-adapter-desktop`（US-207 E6） | **判定不做**。`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上，未来仍可更新；迁移路径由 `website/docs/migration/desktop-split.md` 指路                                                               |
| `packages/rxdb-adapter-tauri/rust/` 发 crates.io        | **本轮不发**（US-210 T7，`publish = false`）。README 已写清 path / git 依赖的用法与限制                                                                                                                     |
| 桌面安装包（installer / bundle）的自动化验证            | **人工验收，不排自动化**。`release-desktop.yml` 跑 `tauri build --ci --no-bundle`，只验编译与 smoke、不产安装包；装包能否安装启动由人工过一遍                                                               |

> **线 A 是一次对外的不可逆动作**（推 tag + `pnpm publish`），本节只做排期，不代表已获授权执行；
> 真要发布时按 release-plan.md 第 4 步跑绿门禁、并单独确认。另注意
> [release-plan.md](release-plan.md) 那条坑：非规范提交信息（`123` 这类）nx 解析不到、一律记为 `none`，
> **一批非规范提交等于零 bump 量，发不出版本**——发布前先确认待发布区间里有规范的 `feat(...)` / `fix(...)`。

## 排期约束

1. US-012 已 Done。其 DTO 不得重新定义 `bigint/binary` 的值 wire codec——该不变量随 DTO 发布而永久成立。
   US-018 与 US-012 **无依赖**，可独立推进；阶段 C 的透传只涉及 `format` / `enum` / `options` 三项 JSON-safe 数据。
   US-018 含 `BREAKING CHANGE`（函数工厂 `default` 生成期抛错），必须与迁移表同 PR 发布——该条已履行，
   但发布侧的约束 12 仍未行使。
2. US-207 已锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约
   （`rxdb-adapter-sqlite-core/desktop-host` 子路径，US-208 / US-210 复用）。「无法保证单连接事务时应
   fail-fast、不得降级成伪事务」作为长期铁律保留，对所有复用该契约的后端同样成立。
3. US-208 与 US-210 均排在 US-207 之后，复用其抽出的 host 契约。US-210 的事务方案已冻结：
   采用「Rust command 持有 `rusqlite::Connection`」（一个 session 一条连接，单连接语义由构造保证），
   「配置单连接池」因做不到（`sqlx` 池连续调用可能落在不同物理连接）被否决。US-208 的两种事务 host 方案
   （IPC 事务 ID 协议 / adapter 完整托管在主进程）仍 Backlog 未选，选定前必须先通过同一套事务与事件测试再冻结（= 批次 1 线 G）。
4. US-904 内部四阶段：共享链与 Electron 可行性门禁并行 **阶段 A ∥ (阶段 B → 阶段 C)**；只有 Electron 集成要求
   **阶段 A(supported) + 阶段 C + US-207 + US-504 → 阶段 D**。Tauri 按 **US-904 阶段 C → US-905** 推进，
   原生链为 **US-210 → US-505**，US-905 阶段 2 额外要求 **US-210 + US-505**，全程不等待 Electron MV3/US-904 阶段 D。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry。
   epic-006 内部顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
7. US-209 已 Done，其**能力上限**转为长期口径：WAL、多页面并发、崩溃恢复保证在微信路径上不得扩大；
   文档一律写「实验性」。**平台集合**的扩展由 US-211 认领：阶段 A 先抽宿主契约并写可行性矩阵；
   阶段 B/C 只吃矩阵里 `decision: supported` 的平台，未关闭的阶段不得改公开支持声明。
   子路径入口的导出表面已由 US-601 纳入 API baseline 守护。
8. epic-008 内部 **US-013 → US-014** 为硬序，两条已全关。判据随之生效：**US-015 阶段 B 及其之后的每一条**
   都必须写出「今天用户踩得到的具体症状」才允许排期；写不出就留在 Backlog。US-014 制造的 `IRxDBPlugin`
   成员签名变更（`install()` 收形参、`destroy()` 转可选、新增 `lifecycle`）由类型契约测试守住，
   不扩大 epic-007 的范围。
9. **过度设计判据，不是建议。** 进入 epic-008 的两条要同时满足：是「资源获取与释放拆成两处」的问题，
   且能写出今天用户踩得到的具体症状。**状态变量复位不算病灶**——`#shutdown()` 里 `#transaction_stack = []`、
   `#connected_sub.next(false)` 这类复位，作用域原语按定义碰不到。
10. **US-212 的发布门禁已解除**：US-020 两阶段全关后，US-212 **零前置，可直接开工并按 `stable` 发布**，
    README / npm 不再需要标 `experimental`。协议不变量仍是硬的：HTTP 是独立 `adapter:remote`，sqlite 是独立
    `adapter:local`，**禁止 HTTP 内部拥有 sqlite**；v1 changelog 方法（`pullChanges` / `mergeChanges` /
    `getChangeCount`）必须 throw unsupported，**不得假空**；`pullChangesBatch` 是 optional 成员，调用点做
    特性探测，不实现即可，实现了也不得返回空数组。
11. **US-212 不再挂在 epic-006 上，改由一条结构隔离不变量替代**：
    > **US-212 MUST NOT 实现或调用 `upsertMany()` / `deleteByIds()` / `getMetadataByIds()`，
    > MUST NOT 持有任何 `QueryCacheLocalAdapter`，构造函数 MUST NOT `new` 任何本地存储。**
    > 该不变量由 US-212 阶段 A 的 AC#19 契约测试冻结。US-306 阶段 A 落地时 MUST 把 HTTP 包纳入其 SC-004
    > 漂移扫描的核对范围。
12. **US-018 不得与线 A 的桥接版本同批发。** 一个「不改 schema、只做迁移锚点」的桥接版本带着
    `BREAKING CHANGE` 是错误的对外信号。US-018 排在桥接版本**之后**单独发。**本条不随 US-018 关闭而失效**：
    线 A 发布前必须先确认这批破坏性改动不在同一发布区间内——判据是发布区间的提交范围，不是故事状态。
13. **US-213 暴露的协议缺陷不在该故事内修。** 若参考后端按文档逐字实现后暴露出协议本身不自洽，US-213
    MUST NOT 改 `src/`、也 MUST NOT 改参考后端去迁就客户端。处置是：该用例标 `it.fails` 或单列
    `describe.skip`，在故事里记为「协议缺陷 → 另开 US」，由新故事带着自己的 breaking-change 与迁移表走
    发布流程。本条对后续接入方仍然有效。
14. **US-214 同样不改 `src/`，唯一例外是 `http-protocol.md` 的「跨源（CORS）」一节**：那**不是改协议**，
    是把一个客观存在、只是没写下来的浏览器前置补进文档，且**只增不改**。demo 后端的 `__control/*` 是演示
    开关**不是协议的一部分**，MUST NOT 出现在 `http-protocol.md`。**「另开 US」条款已行使**：US-214 打出的
    产物侧缺陷分别落成 US-021（core 静默永挂）、US-022（远端行列契约）、US-215（ETag 静默降级）。

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
