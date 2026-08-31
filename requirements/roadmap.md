# 排期与约束

> 本文回答「接下来做什么、什么必须排在什么前面」。当前状态见 [status-overview.md](status-overview.md)，发布执行见 [release-plan.md](release-plan.md)。
>
> 下表是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

## 功能建议

| 优先级 | 建议功能                   | 对应 story                                                      | 建议理由                                                                                                                       | 主要交付边界                                                                                       |
| :----: | -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
|   P3   | 多端小程序宿主（先抽契约） | [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) | Taro 有 `build:alipay/tt/qq/swan`，适配器只认 `wx`；先抽 host + 可行性矩阵，**不**扩大公开支持声明                             | `MiniProgramHost`、微信路径零回归、`miniprogram-platform-feasibility.md`；B/C 只吃矩阵 `supported` |
|   P2   | 提交图与 HEAD 持久化       | [US-305](stories/collaboration/US-305-commit-graph-head.md)     | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开；卡的是桥接发布而非代码。**整链排期压后**（完成计划批次 4），先交付其余价值 | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                |

> US-208 / US-703 已交付（见下方完成计划），不再作为建议列出。US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。
> epic-006 整链（含桥接发布线 A）排在完成计划批次 4，位于所有其他批次之后。

## 完成计划

桌面本地 SQLite 与 epic-008 链首收口后，仓库还剩 **12 条**未关闭故事（3 In Progress + 2 In Review + 7 Backlog，
口径与计数方式同 [status-overview 状态汇总](status-overview.md#状态汇总)）。本节只排**顺序与并行度，不排日期**——
依据是硬前置与已冻结的决策，不是估时。同一批内的行**彼此无依赖**，可各开各的 PR；批次之间才是顺序。
每条的关闭判据以对应 story 的 AC 为准，本表只写「什么算这条做完了」。

### 批次 1：零前置，三条线 —— 已全部交付 ✅（2026-08-29 / 08-30）

> 线 C（US-505 收尾 spec）、线 E（US-904 阶段 A 判 `supported` + C1/C2）、线 G（US-208 两案对照实验，冻结为
> 「IPC 事务 ID 协议」）均已交付，证据在各自 story，本批不再排期。线 C 的 AC#6/#7 转零散收尾项第 2 条；
> 线 E 的 AC#38/#39/#42 转批次 2 的 US-904 行。

### 批次 2：批次 1 解锁后（两条线均已开工）

| 顺序                                                                     | 解锁自     | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-904 阶段 D                                                            | 线 E       | C2 已于 2026-08-30 交付，阶段 D 同日开工。**已落地**：AC#46（database provider 与 v2 事件推送）、D2（connector→panel 出站传输）、D3（native files provider）、D4（snapshot source 与 settings provider）、dev-only 扩展加载（`devtools-extension.ts` + e2e）。**待补**：AC#48 snapshot 完全未接 wire、AC#50 preload 校验层缺失、AC#53 无 Electron conformance driver、AC#52 真实全链路 E2E 只有骨架 probe——AC#45～#53 全 ⬜。仍须带阶段 A 两条约束：Electron 43 缺 `chrome.permissions` 命名空间（显式能力探测，禁静默 fallback）；扩展面板只在 dock 模式 DevTools 中注册。C 阶段残留 AC#34/#38/#39/#42 待人工浏览器回归 / 跨版本实证 |
| [US-905](stories/future/US-905-tauri-native-devtools.md) 阶段 1 → 阶段 2 | 线 E、线 C | 阶段 1 门禁（US-904 阶段 C）已解除，已于 2026-08-30 开工（窗口 + `tauri-transport.service` / `tauri-host-access.service` + Rust `lib.rs` 接线），但 AC#1～#8 几乎全缺，且有两个硬阻塞：`rxdb-devtools` 窗口无 capability（`invoke`/`listen` 被 Tauri ACL 拒绝、握手起不来）、`devtools_message` command 未 `#[cfg(dev)]`（release 仍注册专用 command）。frontmatter 仍 Backlog，待改 In Progress。阶段 2 的 US-210 前置**已 Done**；US-505 代码部分已随线 C 收尾，故事要等零散收尾项第 2 条的三平台矩阵跑绿才置 `Done`。两阶段必须是独立的 PR 序列                                                                                                                                                                                     |

### 批次 3：能力与验证补齐（无硬前置，按价值排在后面）

| 故事                                                                                                          | 为什么不排进批次 1 / 当前状态                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-208](stories/adapter/US-208-electron-pglite-data-directory.md) **实现本体** ✅（2026-08-30，`In Review`） | 已按线 G 冻结的「IPC 事务 ID 协议」实现：**AC#1～#9、#11 关闭**（`pglite-data-directory.spec.ts` 真实临时目录重启逐值保真、`pglite-transaction-contract.spec.ts` 共享事务套件 11 条零跳过、`pglite-open-failure.spec.ts` open 失败可判别、`electron-pglite-host.spec.ts` 握手 / 会话清场 / 权限）。**AC#10（三平台打包 smoke）仍 ⬜**：接线已写完但本机无法验证，需一次真实三 OS `release-desktop.yml` 矩阵 |
| [US-703](stories/future/US-703-pglite-full-text-search.md) ✅（2026-08-29，`In Progress`）                    | 纯能力对称性补齐。**已提前交付**：AC#1～#7、#9 关闭，无 SQLite 专属 fallback（约束 6 已履行）；AC#8 只剩「wa-sqlite / sqlite-wasm / sqlite / sqliteai 四个 adapter 分别装载跑同一套搜索行为套件 + 三框架 parity 回归」一项，故事因此维持 In Progress                                                                                                                                                                          |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 阶段 A → B → C                                | 阶段 A 只抽 host + 写可行性矩阵，**不扩大公开支持声明**；B/C 只吃矩阵里 `decision: supported` 的平台（约束 7）。未关闭的阶段不得改支持声明                                                                                                                                                                                                                                                                  |
| [US-216](stories/adapter/US-216-server-side-rxdb.md)                                                          | 零前置（US-212 / US-213 / US-214 / US-215 / US-023 全 Done），只动 `apps/` 两个 demo + 新建共享模块，不改 `packages/` 生产代码。留在 Backlog，按价值排期                                                                                                                                                                                                                                                    |

### 批次 4：epic-006 链（整体压后）

> **有意排在最后**：线 A 是 epic-006 整条链的单点解锁——US-305 / US-306（三阶段）/ US-307 / US-308
> 共 4 条故事卡的不是代码而是这一次发布。但这条链今天不是优先交付项：先把批次 1～3 的价值交付完，
> 再启动桥接发布与本批次。线 A 启动时，[release-plan.md](release-plan.md) 的执行顺序与两条硬前提
> 全部照旧生效（动手前按零散收尾项第 3 条重跑 `dry-run` 实测区间）。

| 线 / 链             | 内容                                                                                                                                                                                                                                                                             | 解锁自 | 关闭判据 / 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A｜桥接版本发布** | 按 [release-plan.md 的执行顺序](release-plan.md) 走完 0～6 步，发一个 `kind=bridge` 的**非迁移**版本                                                                                                                                                                             | —      | 五条**全部**成立才算完：① `release.version` **≠ `0.0.25`**（今天清单里的 `bridge/0.0.25` 是 0.0.25 那次发布的如实记录，不是本次成果，不许当判据用、不许改写）；② 与 `packages/rxdb/package.json` 同值；③ tag 已推送且 `git merge-base --is-ancestor v<版本>^{commit} HEAD` 人工跑过并留证；④ `migration-release-gate --release-tag=v<版本>` 全绿；⑤ 回写 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 证据。**④ 单独没有区分力**（三条 bridge 钩子只对 `kind=migration` 生效，桥接发布走不到它们，今天不做任何事直接跑就是绿的）；真正有区分力的是 ① 和 ③，而这两条**没有任何自动化在守** |
| epic-006 链         | [US-305](stories/collaboration/US-305-commit-graph-head.md) → [US-306](stories/collaboration/US-306-working-tree-commits.md) 阶段 A → B → C →（[US-307](stories/collaboration/US-307-restore-session.md) ∥ [US-308](stories/collaboration/US-308-branch-isolation-conflict.md)） | 线 A   | epic-006 的固定顺序（约束 5），**不可交换**。US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用阶段 C 冻结的 `useWorkingTree()` 与 `bench-working-tree`；每条故事按各自 AC 关闭                                                                                                                                                                                                                                                                                                                                                                                           |

### 零散收尾项（不成故事，随手可带）

1. ~~**`migration-release-gate` 挂进 PR CI**~~ ✅ **已完成**（2026-08-29，[release-plan.md 执行顺序第 0 步](release-plan.md)）：门禁已挂进 `ci-template.yml` 的 `setup` job（不带 `--release-tag`，配套 `fetch-tags: true` 与按 `GITHUB_REF_TYPE` 解析 tag）。`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 三条只对 `kind=migration` 生效，下一个迁移周期（US-305）才吃得到。
2. **回填 `EXPECTED_BY_PLATFORM` 三平台真值并跑绿一次三 OS 矩阵**（线 C 的 AC#6 / #7 用）：
   **specs 已就位**（2026-08-29），`tauri-smoke` 的三 OS 矩阵会跑到
   `desktop-webview-capability.spec.ts`。这两条 AC 的判据是三家真实 webview，**本机跑不出来**。
   进度：`darwin` 行是本机核过的真值；`linux` 行已按真实 Ubuntu 观测回填（2026-08-31，CSP 先于 CORS
   拦截、服务端零命中）且 Ubuntu 已绿；`win32` 行仍缺——PR [aiao-io/rxdb#48](https://github.com/aiao-io/rxdb/pull/48)
   的 Release Desktop 首跑 Windows 按设计红在「能力事实与本平台被冻结的取值一致」（用例会把真实观测
   打印成**可直接粘贴**的字面量），同跑还暴露 `desktop-file-storage.spec.ts` 的重启用例在 Windows 超时
   （renderer 60 秒未上报）。按输出回填 `win32`、跑绿后，US-505 即可从 In Progress 关闭。
   这一步不依赖发布、可随时做。
3. **线 A 启动前先跑 `nx release version --dry-run` 看真实版本号**（线 A 已压后到批次 4，启动时执行）：
   `v0.0.25` 已脱离主线，`git describe` 解析到的基准 tag 回退成 `v0.0.24`，而 `v0.0.24..HEAD` 区间里有
   17 条 `feat` + 3 条 `fix`（快照数字，启动前重新实测）。两个后果要在动手前确认：桥接版本会算成 minor bump（0.1.0）而不是 0.0.26；
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
   「配置单连接池」因做不到（`sqlx` 池连续调用可能落在不同物理连接）被否决。US-208 的事务方案**已于 2026-08-30 冻结**：
   两案（IPC 事务 ID 协议 / adapter 完整托管在主进程）在真实 Electron 主进程上过完同一套事务与事件测试（批次 1 线 G），
   语义打平，**选定「IPC 事务 ID 协议」**。「adapter 完整托管在主进程」因接口面随业务事务数线性增长、
   且崩溃后事务仍照跑照提交（无取消点）被否决。本条的前置动作已履行；US-208 实现本体已于 2026-08-30 交付
   （`In Review`，AC#10 待三平台矩阵）。
4. US-904 内部四阶段：共享链与 Electron 可行性门禁并行 **阶段 A ∥ (阶段 B → 阶段 C)**；只有 Electron 集成要求
   **阶段 A(supported) + 阶段 C + US-207 + US-504 → 阶段 D**。Tauri 按 **US-904 阶段 C → US-905** 推进，
   原生链为 **US-210 → US-505**，US-905 阶段 2 额外要求 **US-210 + US-505**，全程不等待 Electron MV3/US-904 阶段 D。
   阶段 A / B / C 已全部交付（2026-08-30），阶段 D 已开工；US-905 阶段 1 亦已开工。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry。
   epic-006 内部顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
   该条已随 US-703 交付履行（2026-08-29）；对后续搜索改动仍有效。
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
