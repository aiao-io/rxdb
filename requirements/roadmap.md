# 排期与约束

> 本文回答「接下来做什么、什么必须排在什么前面」。当前状态见 [status-overview.md](status-overview.md)，发布执行见 [release-plan.md](release-plan.md)。
>
> 下表是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

## 功能建议

| 优先级 | 建议功能                           | 对应 story                                                             | 建议理由                                                                                                                            | 主要交付边界                                                                                                                              |
| :----: | ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
|   P1   | 插件依赖声明与按需装卸（阶段 A）   | [US-015](stories/core/US-015-plugin-inject-dependency.md)              | US-014 已交付，`install(scope)` 签名冻结、前置解除；search 插件那台 `adapterConnected$` + phase 状态机是**现存**的症状，不是设想    | `inject: ['adapter:local']`、纪元调度与释放时序、search 插件迁移掉 phase 机（阶段 A = AC#1～12）                                          |
|   P2   | 提交图与 HEAD 持久化               | [US-305](stories/collaboration/US-305-commit-graph-head.md)            | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开                                                                                  | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                                                       |
|   P2   | 生成器 default 序列化与显式失败    | [US-018](stories/core/US-018-generator-default-serialization.md)       | 今天 bigint `default` 直接抛原生 `TypeError`、`Uint8Array` 塌缩成 `{"0":1,...}`、函数工厂被静默丢弃，生成的客户端行为与源实体不一致 | 拆 JSON 往返改运行时分派、`default` → 源码字面量映射表、`unsupportedDefaultFactory` / `unsupportedDefaultValue`、`BREAKING CHANGE` 迁移表 |
|   P2   | Electron PGlite 数据目录与事务宿主 | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)     | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议                                               | 主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真                                                                   |
|   P2   | PGlite 原生全文搜索                | [US-703](stories/future/US-703-pglite-full-text-search.md)             | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                                                                           | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                                              |
|   P2   | 子路径入口纳入 API 表面基线        | [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)       | 版本策略把子路径承诺为公开 API，门禁却只扫主入口——承诺与门禁的差额只能靠人工审查补                                                  | 源入口声明收敛到单一真相源、基线格式扩到多入口、资产入口白名单跳过、三处文档收口                                                          |
|   P3   | 多端小程序宿主（先抽契约）         | [US-211 阶段 A](stories/adapter/US-211-multi-miniprogram-platforms.md) | Taro 有 `build:alipay/tt/qq/swan`，适配器只认 `wx`；先抽 host + 可行性矩阵，**不**扩大公开支持声明                                  | `MiniProgramHost`、微信路径零回归、`miniprogram-platform-feasibility.md`；B/C 只吃矩阵 `supported`                                        |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。
>
> [US-012](stories/core/US-012-field-semantic-metadata.md) 已 Done（阶段 A / B / C 全绿，2026-08-17），
> 不再作为建议功能列出；其 DTO 的 wire codec 不变量见下方约束 1。
>
> [US-015](stories/core/US-015-plugin-inject-dependency.md) 上表**只列阶段 A**——阶段 B（插件间依赖图）
> 的用户价值待证，未证不开工，见下方约束 8 与「明确不排期」。
>
> [US-013](stories/core/US-013-lifecycle-scope-primitive.md) / [US-014](stories/core/US-014-plugin-scope-contract.md)
> 已于 2026-08-20 全关，从本表移出，留档见下方「已完成」。

## 已完成（保留记录）

本节存放**已全部关闭、但值得留档**的条目：它们不再参与排期，从上表移出以免被误读成待办。

### 桌面本地 SQLite（Electron / Tauri）✅

- **对应 story**：~~[US-207](stories/adapter/US-207-desktop-local-database.md)~~ ✅ /
  ~~[US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)~~ ✅
- **收口**：**2026-08-18 两条全关**。**三平台打包 CI 已首跑全绿**（2026-08-17 / 2026-08-19 各一次，
  6 个 smoke job + `adapter-consumer` + `gate` 全 success），AC#8 / AC#9 不再有「待首轮触发确认」的尾巴；
  2026-08-20 确认**以 PR 触发的那两次绿为准，不等真实发布触发**。Electron 与 Tauri 的文件持久化、
  重启恢复与共享 host 契约齐备；桌面包边界重整的 JS 侧（US-207 E1～E11）与 Rust 侧（US-210 T1～T7）同日收口。
- **已交付**：Electron `node:sqlite` 文件路径 + Tauri 应用作用域 SQLite、
  `rxdb-adapter-sqlite-core/desktop-host` 共享契约、类型化 IPC / Rust command、
  `packages/rxdb-adapter-tauri/rust/` 普通 crate、真实文件 smoke test。
- **留在别处、不阻塞本行的尾巴**：crate 发 crates.io 与桌面安装包验证见「明确不排期」；
  US-505 的 AC#6/#7 见批次 1 线 C（缺的是那个故事自己的 specs）。

### epic-008 链首：生命周期作用域原语 + 插件作用域契约 ✅

- **对应 story**：~~[US-013](stories/core/US-013-lifecycle-scope-primitive.md)~~ ✅ /
  ~~[US-014](stories/core/US-014-plugin-scope-contract.md)~~ ✅
- **收口**：**2026-08-20 两条全关**，硬序（约束 8）走完。US-013 交付 `@aiao/utils` 侧的原语，
  19 条 AC 由 26 个用例冻结；US-014 的 23 条 AC（含 11b / 11c 共 25 行）全部通过。
  **三处已知泄漏已证伪**：graph 的 repository 注册断连后仍在、`rxdb.storage` 断连一次即永久消失、
  workspace 拆卸后无法重装——三条现在都由「断连 → 重连」的往返测试覆盖。
- **已交付**：`LifecycleScope`（逆序 / 幂等 / 异步 / 错误隔离 / 可嵌套）、`install(scope)` 契约、
  `lifecycle: 'scoped'` 显式标记与 `destroy()` 的废弃周期、`repository(name, config, scope?)`、
  四个插件包迁移、类型契约测试
  [plugin-scope-contract.spec.ts](../packages/rxdb/src/__tests__/contracts/plugin-scope-contract.spec.ts)
  （api-surface 只记 `{name, kind}`，成员签名改动不产生 diff，这个盲区只能由契约测试就地补）、
  [编写插件](../website/docs/plugins/authoring.md) 与
  [插件作用域契约迁移](../website/docs/migration/plugin-scope.md) 两篇文档。
- **有意的可观察行为变化（三条）**：插件之间的拆卸由 `Promise.all` 并发改为注册逆序**串行**；
  `rxdb.workspace` / `rxdb.searchPlugin` 断连后**仍存在**，方法调用抛「本纪元未安装」而非永久终态；
  `workspace.changes$` 跨纪元存活、断连期间静默且不 `complete()`。迁移页按这三条写。
- **解锁**：US-015 阶段 A 的前置就此解除，已进批次 1 线 B。

## 完成计划（2026-08-18 排定）

桌面本地 SQLite（US-207 + US-210）与 epic-008 链首（US-013 + US-014）收口后，
仓库还剩 **13 条**未关闭故事（2 条 In Progress + 11 条 Backlog）。本节只排**顺序与并行度，不排日期**——
依据是硬前置与已冻结的决策，不是估时。同一批内的行**彼此无依赖**，可各开各的 PR；
批次之间才是顺序。每条的关闭判据以对应 story 的 AC 为准，本表只写「什么算这条做完了」。

### 批次 1：零前置，五条线可同时开工

| 线                       | 内容                                                                                                                               | 排它进第一批的理由                                                                                                                                                                                                         | 关闭判据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A｜桥接版本发布**      | 按 [release-plan.md 的执行顺序](release-plan.md) 走完 0～6 步，发一个 `kind=bridge` 的**非迁移**版本                               | **单点解锁 epic-006 整条链**——US-305 / US-306（三阶段）/ US-307 / US-308 共 4 条故事今天一条都排不上，卡的不是代码而是这一次发布。投入是一次发布动作，收益是四条故事的开工权，杠杆比全表任何一条都高                       | `migration-release.json` 的 `release.kind` 改为 `bridge`、`release.version` 与 `packages/rxdb/package.json` 同值、tag 已推送且是 `main` 祖先、`migration-release-gate --release-tag=v<版本>` 全绿，并回写 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 证据                                                                                                                                                                                                  |
| **B｜US-015 阶段 A**     | [US-015](stories/core/US-015-plugin-inject-dependency.md) 阶段 A（AC#1～12）                                                       | 原线 B（US-013 → US-014）已于 **2026-08-20 全关**，见上方「已完成」。前置随之解除：阶段 A 消费的 `install(scope)` 签名已冻结，症状也已证（search 插件那台 `adapterConnected$` + phase 状态机是现存代码，不是设想），零前置 | `inject: ['adapter:local']` 的依赖声明与纪元调度、依赖插件的作用域与 adapter epoch 维护、释放时序、search 插件迁移掉 phase 机。**阶段 B 不含在内**（价值待证，见「明确不排期」）                                                                                                                                                                                                                                                                                                             |
| **C｜US-505 收尾**       | [US-505](stories/plugin/US-505-tauri-local-file-storage.md) 剩 4 条 ⚠️ + 2 条 ⬜                                                   | 桌面 Local-first 的最后一块。两个前置（`apps/dev-rxdb-tauri-e2e`、三平台打包矩阵）2026-08-17 已建好，S1～S5 迁包 2026-08-18 已关——**缺的纯粹是本故事自己的 spec**，没有任何外部依赖                                        | AC#1/#3：打包应用真实重启 + 拷贝应用数据目录后启动；AC#5：≥ 50 MiB 实测 + 「内容不整体进 JS 堆」的内存观测；AC#8：磁盘满（小容量 loopback / ramdisk）；AC#6/#7：三家 webview 与三平台 smoke——**缺的是本故事自己的 specs，不是触发机会**：`release-desktop.yml` 已首跑全绿（见「零散收尾项」第 3 条），但它跑的是 `dev-rxdb-tauri-e2e:desktop-smoke`，而该 project 里今天只有 US-210 的 `desktop-persistence.spec.ts`。写完 specs 后仍需 `workflow_dispatch` 或一次发布才跑得到，本机跑不出来 |
| **D｜两张独立小票**      | [US-018](stories/core/US-018-generator-default-serialization.md)、[US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) | 零前置、互不依赖，谁有空谁上。US-601 顺带认领 [capability-matrix](capability-matrix.md#已知的需求覆盖缺口) 第 2 条缺口，关掉「改这 12 个子路径入口的导出必须在 PR 描述里人工声明破坏性」这条**人肉**门禁——人肉门禁迟早会漏 | US-018 含 `BREAKING CHANGE`（函数工厂 `default` 在生成期抛错），**必须与迁移表同 PR 发布**（约束 1）；US-601 以其 AC 为准                                                                                                                                                                                                                                                                                                                                                                    |
| **E｜US-904 的零前置半** | [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 A（Electron 43 + MV3 stop/go 实证）与阶段 C1（面板抽取）  | 阶段 A 零前置，且它是阶段 D 的**门禁**：判 `unsupported` 则阶段 D 整段不做——这种「可能直接砍掉一整个阶段」的实证越早跑越省。C1 是行为中性的重构，阶段 B 已交付，不必等任何东西                                             | 阶段 A 给出 `decision: supported` 或 `unsupported` 的实证结论（不是推测）；C1 把面板抽成私有 Angular library，行为零变化                                                                                                                                                                                                                                                                                                                                                                     |

### 批次 2：批次 1 解锁后

| 顺序                                                                                                                                                                                                                                                                           | 解锁自     | 说明                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-305](stories/collaboration/US-305-commit-graph-head.md) → [US-306](stories/collaboration/US-306-working-tree-index.md) 阶段 A → B → C →（[US-307](stories/collaboration/US-307-restore-session.md) ∥ [US-308](stories/collaboration/US-308-branch-isolation-conflict.md)） | 线 A       | epic-006 的固定顺序（约束 5），**不可交换**。US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用阶段 C 冻结的 `useWorkingTree()` 与 `bench-working-tree` |
| US-904 阶段 C2 → 阶段 D                                                                                                                                                                                                                                                        | 线 E       | C2 是四段 relay 与 v2 切换；阶段 D 的另外两个前置 US-207 / US-504 **均已 Done**，所以 D 只等 A(supported) + C                                                                                           |
| [US-905](stories/future/US-905-tauri-native-devtools.md) 阶段 1 → 阶段 2                                                                                                                                                                                                       | 线 E、线 C | 阶段 1 只门禁在 US-904 阶段 C（Chrome 是 v2 的参考实现，让 Tauri 当第一个发现协议缺陷的地方是错的）；阶段 2 的 US-210 前置**已 Done**，只剩 US-505。两阶段必须是独立的 PR 序列                          |

### 批次 3：能力补齐（无硬前置，按价值排在后面）

| 故事                                                                           | 为什么不排进批次 1                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)             | 前置（US-207 的 host 契约）已解除，但**两种事务 host 方案至今未选**（IPC 事务 ID 协议 / adapter 完整托管主进程）。选定前必须先让两案各过同一套事务与事件测试再冻结（约束 3） |
| [US-703](stories/future/US-703-pglite-full-text-search.md)                     | 纯能力对称性补齐，无人被它挡住。复用现有搜索公开 API 与跨框架 parity fixture，不得为 PGlite 加 SQLite 专属 fallback（约束 6）                                                |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 阶段 A → B → C | 阶段 A 只抽 host + 写可行性矩阵，**不扩大公开支持声明**；B/C 只吃矩阵里 `decision: supported` 的平台（约束 7）。未关闭的阶段不得改支持声明                                   |

### 零散收尾项（不成故事，随手可带）

1. **`migration-release-gate` 挂进 PR CI**（[release-plan.md 执行顺序第 0 步](release-plan.md)）：
   `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 目前只在打 tag 时跑，
   单测里被 `passingHooks` 桩掉。三条只对 `kind=migration` 生效，桥接发布用不上，
   但下一个迁移周期（US-305）会用上，且这一条**不依赖发布**，可立即做。
2. ~~**补 `sideEffects` 声明**~~ **已补（2026-08-20）**：`rxdb-adapter-sqlite-core` / `rxdb-plugin-storage` /
   `utils` 三个包的 `package.json` 均已写上 `"sideEffects": false`，与 `rxdb` / `rxdb-adapter-electron` /
   `rxdb-adapter-tauri` 等既有声明对齐。「误标 `false` 把真有副作用的模块摇掉」这个风险已逐包排除：
   源码里无裸 `import 'x'`、无顶层执行语句、无模块级全局写入；`@Entity` 只把 metadata 挂到类自身，
   实体靠 `RxDB` 的 `entities` 数组**显式注册**，不依赖模块被加载；`@aiao/utils` 的 `pool` 单例
   所属类没有构造函数，只有一个 `Map` 字段；`requestIdleCallbackPolyfill` 是导出的函数、不在导入期执行。
   三包 `lint` / `test` / `build` 复跑全绿。US-207 E11 在**调用方**用「主 chunk 里只抄字面量」堵的那条路，
   现在**包这一侧**也收紧了。
3. ~~**三平台打包 CI 的首轮结果**~~ **已兑现（2026-08-17 首跑，2026-08-19 复跑）**：
   `release-desktop.yml` 不只在 release 上触发，它对**改动自身**的 PR 也触发（`on.pull_request.paths`
   含这份 workflow 与两个 composite action）——落地当天那条 PR 就是首跑。两次都是
   `electron-smoke` × 3 + `tauri-smoke` × 3 + `adapter-consumer` + `gate` **全绿**
   （[run 32075648469](https://github.com/aiao-io/rxdb/actions/runs/32075648469) /
   [run 32311812029](https://github.com/aiao-io/rxdb/actions/runs/32311812029)），
   Windows / Linux 因此不再是零实测。**注意它不覆盖 US-505**：那两条 AC 缺的是
   `dev-rxdb-tauri-e2e` 里尚未写出的 specs，不是触发机会，见批次 1 线 C。

### 明确不排期

| 项                                                      | 判定                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-015 阶段 B（插件间依赖图）                           | **价值待证**。US-014 已于 2026-08-20 关闭三处泄漏，判据随之生效：必须写出「今天用户踩得到的具体症状」才允许排期；写不出就留在 Backlog（约束 8，这是判据不是建议）                          |
| `US-016` 连接纪元与停机收敛 / `US-017` 三框架宿主作用域 | 文件未创建，不计入任何统计。US-016 价值已证待切片，US-017 价值待证                                                                                                                         |
| `npm deprecate @aiao/rxdb-adapter-desktop`（US-207 E6） | **已判定不做**（2026-08-18）。`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上，未来仍可更新；迁移路径由 `website/docs/migration/desktop-split.md` 指路                              |
| `packages/rxdb-adapter-tauri/rust/` 发 crates.io        | 本轮不发（US-210 T7，`publish = false`）。README 已写清 path / git 依赖的用法与限制，留作后续任务。**2026-08-20 复核：维持不发**，以后再说，不占本轮任何判据                               |
| 桌面安装包（installer / bundle）的自动化验证            | **人工验收，不排自动化**（2026-08-20 判定）。`release-desktop.yml` 跑的是 `tauri build --ci --no-bundle`，只验编译与 smoke、不产安装包；装包能否安装启动由人工过一遍即可，不为此加 CI 作业 |

> **线 A 是一次对外的不可逆动作**（推 tag + `pnpm publish`），本节只做排期，不代表已获授权执行；
> 真要发布时按 release-plan.md 第 4 步跑绿门禁、并单独确认。另注意
> [release-plan.md](release-plan.md) 那条坑：非规范提交信息（`123` 这类）nx 解析不到、一律记为 `none`，
> **一批非规范提交等于零 bump 量，发不出版本**——发布前先确认待发布区间里有规范的 `feat(...)` / `fix(...)`。

## 排期约束

1. US-012 已 Done（阶段 A / B / C 全绿，2026-08-17）。其 DTO 不得重新定义 `bigint/binary` 的值 wire codec
   ——该不变量随 DTO 发布而永久成立。
   [US-018](stories/core/US-018-generator-default-serialization.md) 与 US-012 **无依赖**，可独立推进；
   阶段 C 的透传只涉及 `format` / `enum` / `options` 三项 JSON-safe 数据，不碰生成器的序列化管线结构。
   US-018 含 `BREAKING CHANGE`（函数工厂 `default` 生成期抛错），必须与迁移表同 PR 发布。
2. US-207 已锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约
   （`rxdb-adapter-sqlite-core/desktop-host` 子路径，US-208 / US-210 复用）。「无法保证单连接事务时应
   fail-fast、不得降级成伪事务」作为长期铁律保留，对所有复用该契约的后端同样成立。
3. US-208 与 US-210 均排在 US-207 之后，复用其抽出的 host 契约。US-210 的事务方案已冻结：
   采用「Rust command 持有 `rusqlite::Connection`」（一个 session 一条连接，单连接语义由构造保证），
   「配置单连接池」因做不到（`sqlx` 池连续调用可能落在不同物理连接）被否决。US-208 的两种事务 host 方案
   （IPC 事务 ID 协议 / adapter 完整托管在主进程）仍在 Backlog 未选，选定前必须先通过同一套事务与事件测试再冻结。
4. [US-904](stories/future/US-904-devtools-native-storage-contract.md) 内部四阶段：
   共享链与 Electron 可行性门禁并行 **阶段 A ∥ (阶段 B → 阶段 C)**；只有 Electron 集成要求
   **阶段 A(supported) + 阶段 C + US-207 + US-504 → 阶段 D**。Tauri 按 **US-904 阶段 C → US-905** 推进，
   原生链为 **US-210 → US-505**，US-905 阶段 2 额外要求 **US-210 + US-505**，全程不等待 Electron MV3/US-904 阶段 D。
   US-904 阶段 C1（行为中性的面板抽取）不依赖协议冻结，可与阶段 B 并行开工；
   US-905 阶段 1（窗口/transport + fake provider）可与 US-210/US-505 并行。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry。
   epic-006 内部顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。
   US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用
   阶段 C 冻结的 `useWorkingTree()` 契约与 `bench-working-tree` target，排在其后。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
7. US-209 已 Done，其**能力上限**转为长期口径：WAL、多页面并发、崩溃恢复保证在微信路径上不得扩大；
   文档一律写「实验性」，不得把微信路径列成与 wa-sqlite 同级的受支持适配器
   （落点见 [compatibility.md](../website/docs/compatibility.md) 的能力边界专节）。
   **平台集合**的扩展由 [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 认领：
   阶段 A 先抽宿主契约并写可行性矩阵，仍写「仅微信」；阶段 B/C 只吃矩阵里 `decision: supported` 的平台，
   且新 host 继承同一套能力上限（单连接 / rollback journal / 无崩溃恢复 / ~10MB）。
   未关闭的阶段不得改公开支持声明。
   US-209 AC#8 顺带留下一个新缺口：`exports` 子路径入口的**导出表面**不受 api-surface 门禁保护
   （清单本身已由 `KNOWN_UNCOVERED_SUBPATHS` 核对），见
   [capability-matrix.md](capability-matrix.md) 的「已知的需求覆盖缺口」。
   该缺口由 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领；
   在它交付之前，改动这 12 个子路径入口的导出**必须在 PR 描述里人工声明破坏性**。
8. epic-008 内部 **US-013 → US-014** 为硬序，两条已于 2026-08-20 全关，三处已知泄漏关闭。
   该判据随之生效：**US-015 阶段 B 及其之后的每一条**都必须写出「今天用户踩得到的具体症状」才允许排期；
   写不出就留在 Backlog。US-015 阶段 A 的症状已证（search 插件的 `adapterConnected$` + phase 机）
   且前置已解除，见批次 1 线 B；阶段 B（插件间依赖图）价值待证，未证不开工。`US-016` / `US-017` 同样未落盘。
   US-014 制造的 `IRxDBPlugin` 成员签名变更（`install()` 收形参、`destroy()` 转可选、新增 `lifecycle`）
   由类型契约测试守住，**不扩大 epic-007 的范围**；`destroy()` 的实际移除排在废弃周期结束后，不在本 epic 内。

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
