---
kind: review-plan
object: rxdb-adapter-electron
source_root: packages/rxdb-adapter-electron
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-electron：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Electron 桌面 SQLite 与 PGlite adapter/host；两种后端的锁与多窗口语义分别核查。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-electron`](../../../packages/rxdb-adapter-electron)  |
| Nx 项目             | `rxdb-adapter-electron`                                                      |
| npm 名称            | `@aiao/rxdb-adapter-electron`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 76 个；测试/共享套件入口 38 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterElectron.ts`](../../../packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts)
- [`src/electron-sqlite-host.ts`](../../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts)
- [`src/electron-file-host.ts`](../../../packages/rxdb-adapter-electron/src/electron-file-host.ts)
- [`src/node-sqlite-engine.ts`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)
- [`src/pglite/RxDBAdapterElectronPGlite.ts`](../../../packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts)
- [`src/pglite-host/pglite-host-lock.ts`](../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts)
- [`README.md`](../../../packages/rxdb-adapter-electron/README.md)
- [`package.json`](../../../packages/rxdb-adapter-electron/package.json)
- [`project.json`](../../../packages/rxdb-adapter-electron/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-electron/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-electron/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-electron/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./host`、`./pglite`、`./pglite-host`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-electron.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-adapter-pglite: workspace:*`、`@electric-sql/pglite: ^0.5.8`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                          | 最低复验场景 / 证据要求                                                                         | 状态                          |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | renderer / host 边界   | 逐个对照 sqlite-core 协议、TS host 和应用 preload；请求必须归属到正确会话与数据库。               | 过期会话、未知操作、畸形参数、跨窗口请求、巨大消息；host 拒绝后无副作用。                       | 部分核查；见2026-10-05逐C结论 |
| C2   | SQLite 多窗口与事务    | 审查 node:sqlite engine、事务请求队列、关闭/崩溃时资源收束。                                      | 双窗口同库、事务中另一路写入、窗口关闭、host 异常；隔离和错误码可复验。                         | 部分核查；见2026-10-05逐C结论 |
| C3   | PGlite 独占与可选 peer | 检查 PGlite data-dir lock/runtime 与 optional peer 的按需装载；不套用 SQLite 多窗口假设。         | 重复打开同目录、worker 退出、缺 PGlite peer、只用 SQLite 的发布消费；不静态拉入可选后端。       | 部分核查；见2026-10-05逐C结论 |
| C4   | 文件与路径安全         | 追踪 storage 根路径、logical path、符号链接和请求边界；与插件 storage 和 DevTools provider 联审。 | 路径穿越、越界 restore target、锁冲突、文件同名、目录失败；不得访问用户配置之外的路径。         | 部分核查；见2026-10-05逐C结论 |
| C5   | 加密与备份恢复         | 审查 SQLite/PGlite 各自备份锁、restore 事务和 keyring；按不同后端分别记录证据。                   | 恢复并发、失败后重试、二进制与 BigInt、加密归档/tamper；原库可继续打开。                        | 部分核查；见2026-10-05逐C结论 |
| C6   | host 与应用集成        | 将 adapter 单测、应用 electron-conformance 与 packaged E2E 接起来；单纯浏览器 demo 不算桌面证据。 | contextIsolation/sandbox 模式、应用重启持久化、生产打包后的依赖解析；typecheck 抖动先单独复跑。 | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **38** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/pglite-host-lock.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/pglite-host-lock.spec.ts)
- [`src/__tests__/electron-pglite-host-backup.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/electron-pglite-host-backup.spec.ts)
- [`src/__tests__/electron-pglite-host.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/electron-pglite-host.spec.ts)
- [`src/__tests__/pglite-host-data-dir.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/pglite-host-data-dir.spec.ts)
- [`src/__tests__/RxDBAdapterElectron.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/RxDBAdapterElectron.spec.ts)
- [`src/__tests__/backup/desktop-pglite-constants.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/backup/desktop-pglite-constants.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-electron/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：Node 26+ 的 node:sqlite；PGlite 路径还需其实际 peer/runtime。IPC 安全与持久化最终在 Electron 打包应用复验。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-electron --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-electron:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-electron --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-electron:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-electron
```

- `typecheck` 的已知并发 flaky 先串行独立复跑；保留首次失败和复跑日志，不因历史标签忽略稳定可重现的类型错误。

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-electron.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：第二批实际深审

[本对象实际结论与证据](../results/packages/rxdb-adapter-electron.md) · [2026-10-04 执行台账](../execution-2026-10-04.md)。只核销明确标识的包级专题；不把平台 skip、历史绿色门禁或不适用授权边界当成应用已通过。

### 2026-10-04 第六批：真实后端联审

[原应用/PGlite + HTTP + 文件 SQLite 的实际取证](../execution-2026-10-04-sync-http-sqlite.md)。新增 RV-055，RV-052/053/054 补真实后端证据；scope、缓存收敛和配置适用性已分别写入独立执行记录，不给未测 GUI/CORS/Supabase/发布消费通过结论。

### 2026-10-05：加密初始化取消

[实际 Keyring /文件 SQLite /Chromium-PGlite 联审](../execution-2026-10-05-encrypted.md)：RV-058 有三个测量面的失败复验及正常已建凭据保护对照。只登记一个共同根因，不把 memory/管道接缝包装为所有后端安全，完整 C 与对象仍未完成。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                  | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| C1 renderer / host 边界   | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:171-176 requireSession、257-290 parse/dispatch`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/main.ts:124-129 senderFrame`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts:94-104 denyForeignSession`<br>host先parse统一协议再dispatch，未知session返回session_closed；应用IPC验证主frame，再由窗口归属拒绝别人的session。库级host不自行知道Electron sender，权限必须应用bridge落实。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实IPC旧/未知session、跨窗口/子frame、畸形/巨大payload与未知操作，拒绝后无副作用；进程内host旧取证非GUI证据。       |
| C2 SQLite 多窗口与事务    | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/node-sqlite-engine.ts:251-277 open、295-310 execute、351-362 close、375-394 authorizer`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:230-243 execute busy retry`<br>node:sqlite defensive+authorizer拒绝危险能力；多语句带bindings拒绝；close rollback/checkpoint并finally关DB。busy仅BEGIN重试且有预算，不按旧writer lease假设。                                                                                                                                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实同库双窗口/事务另一路写/关窗与host异常、重开；本轮未跑native/GUI、未测全部事务/崩溃矩阵。                        |
| C3 PGlite 独占与可选 peer | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts:113-152 acquirePgliteDirectoryLock`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-runtime.ts:129-165 suspendTransaction`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/package.json:76-86 optional peers`<br>PGlite用独立SQLite exclusive目录锁，不套SQLite多连接假设；事务begin有timeout并拒绝迟到句柄；optional peer声明单独入口。仅源码/包build不证明无peer的consumer。                                          | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控重复同目录打开、worker退出/崩溃锁释放、peer缺失只用SQLite的pack消费；本轮未跑实际worker/消费。                       |
| C4 文件与路径安全         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/electron-file-host.ts:225-259 resolveWithinRoot/canonicalize、356-366 containedPath、640-657 commitWrite`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts:51-59 resolver`<br>logical名与root词法/realpath双边界，允许根内symlink、拒绝越界；文件提交sync→close→rename→目录sync，异常清临时。没有执行旧desktop dist。                                                                                                                                                      | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实穿越/symlink/目录拒绝、锁冲突/同名、restore越界及并发失败；未对所有OS/filesystem认证，不延续历史RV-044为新发现。 |
| C5 加密与备份恢复         | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-restore.ts:130-157 writeData/writeEntry、166-195 claimTarget/discardTarget`<br>`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts:133-147 restore marker`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restore/relaunch`<br>恢复校验写入长度/文件独占，目标reserved+目录锁，marker用于恢复失败状态；E2E源目录删除后新位置restore/relaunch能区别假备份。RV-058已修复，不用旧cancel失败重开。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控SQLite/PGlite两档、恢复中断/目标占用/失败重试、加密tamper/BigInt/binary与原库重开；未跑本轮真实宿主和覆盖率。        |
| C6 host 与应用集成        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/main.ts:151-177 contextIsolation/sandbox/navigation`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src-electron/preload.ts:108-135 narrow bridge`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 resolveExecutable`<br>应用真实IPC通道只暴露request/subscribe且sandbox/contextIsolation开启，runner只找packaged可执行文件、缺失报错不浏览器替代。主控当前包build/typecheck不是packaged E2E。                                                                      | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控冷打包/Electron GUI、两后端重启持久化、多窗口/沙箱、生产依赖解析与consumer；平台不足保持未验证。                     |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
