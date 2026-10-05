---
kind: review-plan
object: rxdb-adapter-sqlite-core
source_root: packages/rxdb-adapter-sqlite-core
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source-review: in-progress-original-scope
assessment-delivery: partial-checkpoint
scene-validation: focused-red-probes-only
release-validation: not-in-this-task
packages-only-evidence: requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core
---

# rxdb-adapter-sqlite-core：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

SQLite 适配器共同实现：SQL/映射、事务、迁移、FTS、备份及桌面线协议。

| 项目                | 基线事实                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                |
| 源码范围            | [`packages/rxdb-adapter-sqlite-core`](../../../packages/rxdb-adapter-sqlite-core) |
| Nx 项目             | `rxdb-adapter-sqlite-core`                                                        |
| npm 名称            | `@aiao/rxdb-adapter-sqlite-core`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）      |
| 建议波次 / 优先风险 | W1 / 高（排期依据，不是缺陷结论）                                                 |
| 受控文件盘点        | 174 个；测试/共享套件入口 85 个（按文件名，不代表覆盖率）                         |
| 执行状态            | 执行中：本批仅部分专题复核，完整门禁/覆盖率未完成                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSqliteBase.ts`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)
- [`src/Oo1ClientBase.ts`](../../../packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts)
- [`src/execute-sql.utils.ts`](../../../packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts)
- [`src/backup/restore-sqlite-database.ts`](../../../packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts)
- [`src/desktop/desktop-host-protocol.ts`](../../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts)
- [`src/desktop/desktop-sqlite-client.ts`](../../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts)
- [`README.md`](../../../packages/rxdb-adapter-sqlite-core/README.md)
- [`package.json`](../../../packages/rxdb-adapter-sqlite-core/package.json)
- [`project.json`](../../../packages/rxdb-adapter-sqlite-core/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-sqlite-core/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-sqlite-core/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-sqlite-core/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./desktop-host`、`./testing`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-sqlite-core.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-plugin-history: workspace:*`、`@aiao/rxdb-plugin-tree: workspace:*`、`@aiao/rxdb-test: workspace:*`、`vitest: >=4.0.0`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                                                 | 最低复验场景 / 证据要求                                                                      | 状态                                |
| ---- | ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| C1   | 适配器共同契约     | 沿 base adapter 与 Oo1 client 核查连接、查询、执行、关闭的责任边界；列出子适配器必须保证的能力。         | 构造失败、重复关闭、已关闭后调用、多个 client；错误不转成成功空结果。                        | 待核查                              |
| C2   | 事务、触发器与事件 | 检查 BEGIN/COMMIT/ROLLBACK、事务上下文、change trigger 与捕获安装顺序。                                  | 失败回滚、提交后事件、并发事务、触发器安装失败；主表/变更表/工作树写入一致。                 | 部分执行；真实缓存事务/事件，RV-055 |
| C3   | SQL 与类型映射     | 核查 identifier quoting、参数绑定、RuleGroup、排序/分页、批写与关系 SQL。                                | 引号标识符、注入字符串、NULL 游标、BigInt、二进制、日期、空批次；与 PGlite 相同可观察行为。  | 部分执行；RV-046 /RV-061 namespace  |
| C4   | 系统迁移与分支     | 逐项审查版本水位、系统表约束、分支过滤、active 分支唯一性与 schema 重挂。                                | 旧库升级、重复迁移、多 active 行、切分支、远端分支物化；错误时原子回滚。                     | 待核查                              |
| C5   | FTS 与搜索约束     | 核查 FTS5 建表/触发器、CJK 处理和索引生命周期，检查所有子后端是否真实支持所声明能力。                    | 更新/删除同步索引、中文短词、空结果、不存在插件、无 FTS 后端；不偷偷降级为不同语义。         | 待核查                              |
| C6   | 备份与恢复         | 检查备份 SQL、恢复目标锁、blank database 校验、schema 与失败清理。                                       | 错目标、旧连接仍开、损坏归档、中途失败、重试、恢复后重连；原库不被部分覆盖。                 | 部分执行，117 通过 / 21 skip        |
| C7   | 桌面协议与权限边界 | 审查 request/response、会话、能力协商、路径与恢复目标的严格校验；与 Electron/TS 和 Tauri/Rust 两端对照。 | 畸形请求、过期会话、越界整数/路径、大消息、未知操作；双方错误码与 BigInt/binary 编解码一致。 | 待核查                              |
| C8   | 验收覆盖率与调用点 | 审查 coverage-acceptance 的运行/合并及 conformance 接线；一个共享套件变化必须核对所有后端。              | 完整执行验收目标；删除套件无残留入口，不重建 rowsAffectedConformanceSuite。                  | 待核查                              |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **85** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/desktop-host-protocol.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/desktop-host-protocol.spec.ts)
- [`src/__tests__/desktop-sqlite-client.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/desktop-sqlite-client.spec.ts)
- [`src/__tests__/execute-sql.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/execute-sql.utils.spec.ts)
- [`src/__tests__/Oo1ClientBase.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/Oo1ClientBase.spec.ts)
- [`src/__tests__/RxDBAdapterSqliteBase.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/RxDBAdapterSqliteBase.spec.ts)
- [`src/__tests__/backup/memdb-backup-edge.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/backup/memdb-backup-edge.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-sqlite-core/vite.config.mts)、[`vitest.acceptance-root.mts`](../../../packages/rxdb-adapter-sqlite-core/vitest.acceptance-root.mts)、[`vitest.coverage-acceptance.config.mts`](../../../packages/rxdb-adapter-sqlite-core/vitest.coverage-acceptance.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 优先使用本项目 `coverage-acceptance` 的合并证据，复核不同 SQLite 宿主执行面。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-encrypted`](rxdb-adapter-encrypted.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-miniprogram`](rxdb-adapter-miniprogram.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-miniprogram`](rxdb-adapter-miniprogram.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-test`](rxdb-test.md)。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target             | 用途与证据边界                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `lint`                | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`           | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`                | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`               | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `coverage-acceptance` | 专用跨套件覆盖率验收；按实现核对合并范围和四指标门槛。                 |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-sqlite-core --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite-core:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-sqlite-core --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite-core:coverage-acceptance --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-sqlite-core
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [ ] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已执行范围、实际评审意见与证据](../results/packages/rxdb-adapter-sqlite-core.md)；[全仓执行台账](../execution-2026-10-03.md)。

调用当前源码 SQL 构建器，在 Node 26 DatabaseSync 内存库执行 JSON1/NULL 查询。3 个一致性断言均失败；没有运行 browser/Worker/WASM/桌面宿主、事务/备份/迁移或整包覆盖率门禁。

只有上述范围取得本轮证据，未执行项仍待核查，完成清单不勾选。

## 2026-10-04：第二批实际深审

[本对象实际结论与证据](../results/packages/rxdb-adapter-sqlite-core.md) · [2026-10-04 执行台账](../execution-2026-10-04.md)。只核销明确标识的包级专题；不把平台 skip、历史绿色门禁或不适用授权边界当成应用已通过。

## 2026-10-04：树查询与 DevTools 第三批深审

[本对象实际意见与源码/运行证据](../results/packages/rxdb-adapter-sqlite-core.md) · [本批台账](../execution-2026-10-04-tree-devtools.md)。未核销项不由生成器、mock 或其它后端门禁代证。

### 2026-10-04 第六批：真实后端联审

[原应用/PGlite + HTTP + 文件 SQLite 的实际取证](../execution-2026-10-04-sync-http-sqlite.md)。新增 RV-055，RV-052/053/054 补真实后端证据；scope、缓存收敛和配置适用性已分别写入独立执行记录，不给未测 GUI/CORS/Supabase/发布消费通过结论。

### 2026-10-05：加密初始化取消

[实际 Keyring /文件 SQLite /Chromium-PGlite 联审](../execution-2026-10-05-encrypted.md)：RV-058 有三个测量面的失败复验及正常已建凭据保护对照。只登记一个共同根因，不把 memory/管道接缝包装为所有后端安全，完整 C 与对象仍未完成。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 原 base adapter 的非 public QueryCache 目标解析失败，经实际 wa-sqlite 冷缓存复验；同表物理原语写入和读回成功。不外推其它宿主。

确认意见：[RV-061](../RV-061-querycache-sqlite-nonpublic-namespace-target.md)。全批门禁、接缝和中间取证错误见 [本轮执行台账](../execution-2026-10-05-supabase.md)；[源码指纹](../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-sqlite-core.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/8，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 2 failed | 1465 passed | 21 skipped (1488)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:443）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：LA-02/LA-03（轻量回归确认）。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                      | 当前结论/可证反证                                                                                                                                                                                | 原 C 核销 | 剩余必要验证                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:581–621,1484–1512,1716–1728`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–215,265–305`                                                                           | LA-02/03 两个独立关闭窗口已由主控轻量回归证实：工厂晚到仍缓存，oo1 模块晚到仍 ready。失败重试与普通关闭的已有实现不能反证这两个窗口。                                                            | 未核销    | 关闭并发/失败/reconnect/多个 client 完整边界；新回归的 late strict lint/typecheck；真实 Worker/OPFS 资源回收。             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1007–1065,1654–1712`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:38–67,115–127`                                                                     | 真实入口统一入队，executor facade 直发事务连接；COMMIT 后监听异常不误发 ROLLBACK，失败 rollback 会失效 client。这里只核实责任分层，不把 update_hook 的定时批处理等同提交屏障。                   | 未核销    | 触发器安装失败、并发事务、提交/回滚事件及主表/change/working-tree 同一事务的全部契约；当轮 21 skip 单独销项。              |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts:21–28,66–79`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts:17–54`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:409–456,646–724` | 插入值参数绑定，标识符用统一 quoting；加密在 SQL 前执行，结果拒绝非字符串信封、任一列解密失败作废整行。排序/关系 SQL 不由这些入口存在即可推断正确。                                              | 未核销    | RuleGroup/关系 JOIN 全支路、引号标识符/注入、NULL cursor、BigInt/binary/date、空批次与 PG 同 fixture 比较。                |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:787–894`                                                                                                                                                                                                                  | 独占迁移事务内读水位、按当前 active 分支重挂触发器、补唯一约束及水位；失败回滚不可用则丢弃连接。                                                                                                 | 未核销    | 多 active 行/旧库/重复迁移/迁移失败完整动态场景；远端分支物化和切分支源码全边界尚未读完。                                  |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts:18–32`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts:49–50,69–86`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:243–250` | 建表固定 FTS5 external-content/rowid；更新守卫 NULL-safe，valueWrapper 只准裸函数名。引擎 capability 与中文查询端必须另证，不能把生成 DDL 当真实支持。                                           | 未核销    | 全部子后端 FTS 实际探针、CJK 短词、更新/删除/backfill、缺插件/缺 FTS 拒绝；trigger 尾部与查询端全量联审。                  |
| C6  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,114–173,190–194`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1515–1560`                                                                             | 恢复前检查断开状态、独占存储锁、恢复 marker、同引擎 blank database 与必须能力；unsupported 明确报错。LA-02 的关闭窗口不能被“理论有锁”盖过去。                                                    | 未核销    | 归档全解析/限额与中途失败清理尚未完整重读；损坏/错目标/旧连接/重试/重连全部持久化门禁。历史 117 pass/21 skip 只属历史。    |
| C7  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/desktop/desktop-protocol-primitives.ts:31–47,65–85,122–126`                                                                                                                                                                                        | 已核对 UUID 与 SQL/blob/bindings 尺寸边界的公共零件；字符串形状校验不等于 host 签发会话存在或路径授权通过。                                                                                      | 未核销    | 915/941 行两协议、真实 TS host 与 Rust host 会话/路径/越界整数/大消息/未知 op 对照未全部阅读及执行，必须保留待证。         |
| C8  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/scripts/run-coverage-acceptance.mjs:15–27,52–69`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`                                                                               | 验收脚本列 core/wa-sqlite/sqlite/sqlite-wasm/sqliteai 五套、四浏览器 suite、四指标 80% 门槛；普通 test 不等于 acceptance 的 blob/合并验收。未重建 writer lease 或 rowsAffectedConformanceSuite。 | 未核销    | coverage-acceptance 未执行；合并/测量面完整重读与所有 conformance 调用点（含 Tauri）未穷举；不能用库存旧 coverage 过门槛。 |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。


## PKG-sqlite-core packages-only checkpoint（2026-10-05，非完成）

- 冻结原范围179文件 / 54,621行，包含全部测试/fixture/config/docs；`scope.json` 与 `resolved-project.json` 已存在并核对。旧盘点174文件为历史。
- 只审本包；新增 probe 仅在独占 evidence 内，没有改业务、原测试、index 或依赖，没有 Git 改写或派 agent。
- 当前实读进度见本包 `file-inspection.json`；明确旧 requested/truncated ranges 不作为已实读复用。哈希/目录盘点不是阅读。
- 新确认意见 SC-PKG-001（P1，加密 Id 后缀明文旁路）、SC-PKG-002（P2，事务终结事件内 executor 仍 active）见本包 `findings.md`；候选与未测分列，由主控最终去重 RV。RV066/067 已修不复报；非 public QueryCache 刷新/删除归已有 RV061。
- **source-review 仍 in-progress-original-scope；assessment-delivery 为 partial-checkpoint。** 不能据上述局部证据把179文件或原C1–C8记完成。场景/发布验证另列，不把后端全矩阵、真设备或发布门禁作为交付局部源码意见的先决条件。
