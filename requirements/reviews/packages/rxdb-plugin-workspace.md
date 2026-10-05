---
kind: review-plan
object: rxdb-plugin-workspace
source_root: packages/rxdb-plugin-workspace
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-workspace：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

未入库 NEW 实体草稿的内存/IndexedDB 恢复与同源广播；不是 working tree。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-workspace`](../../../packages/rxdb-plugin-workspace)  |
| Nx 项目             | `rxdb-plugin-workspace`                                                      |
| npm 名称            | `@aiao/rxdb-plugin-workspace`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 17 个；测试/共享套件入口 4 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBPluginWorkspace.ts`](../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts)
- [`src/workspace-entry.ts`](../../../packages/rxdb-plugin-workspace/src/workspace-entry.ts)
- [`src/workspace-store.ts`](../../../packages/rxdb-plugin-workspace/src/workspace-store.ts)
- [`src/index.ts`](../../../packages/rxdb-plugin-workspace/src/index.ts)
- [`README.md`](../../../packages/rxdb-plugin-workspace/README.md)
- [`package.json`](../../../packages/rxdb-plugin-workspace/package.json)
- [`project.json`](../../../packages/rxdb-plugin-workspace/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-workspace/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-workspace/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-workspace.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                          | 最低复验场景 / 证据要求                                                                 | 状态                                         |
| ---- | ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| C1   | NEW 草稿边界           | 对照 README 与事件监听，核查仅 NEW 草稿、不承诺 UPDATE buffer/DELETE 撤销的语义。 | NEW 顶层修改、save(CREATE)、REMOVE/discard、已有实体修改；主表不因缓存操作被写入。      | partial / 待证（2026-10-05；见第 8 节）      |
| C2   | install / ready 状态机 | 检查 IndexedDB 首次载入、未注册实体恢复、失败后的显式重试。                       | 读取失败、未知 EntityType、重复 install、关闭中 ready；reject 可见，不后台无限重试。    | closed / 本轮核销（2026-10-05；见第 8 节）   |
| C3   | flush 写屏障           | 审查待写/待删集合、失败后恢复与 WorkspaceFlushError 点名。                        | 部分不可克隆值、写失败、并发修改/flush、再次显式重试；可克隆项与失败项正确区分。        | closed / 保留原限定（2026-10-05；见第 8 节） |
| C4   | 快照与跨标签页         | 核查 structuredClone、BroadcastChannel 身份、重复/乱序与同步错误清理。            | 改 list 快照不改内部草稿、同源双页、不同库、损坏记录；corruptedEntries 只反映当前问题。 | partial / 待证（2026-10-05；见第 8 节）      |
| C5   | 生命周期与持久化证明   | 检查 listener/IDB/broadcast 销毁与 package 子入口，不用内存测试代替重开恢复。     | 浏览器 test-browser 刷新/重开、close/reinstall、无法打开 IDB；边界与使用说明一致。      | partial / 待证（2026-10-05；见第 8 节）      |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **4** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/RxDBPluginWorkspace.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts)
- [`src/__tests__/workspace-store.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/workspace-store.spec.ts)
- [`src/__tests__/public-api-docs.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/public-api-docs.spec.ts)
- [`src/__tests__/workspace.browser.spec.ts`](../../../packages/rxdb-plugin-workspace/src/__tests__/workspace.browser.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-workspace/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-model`](rxdb-model.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)。

## 5. 执行命令与环境

前置环境：真实 IndexedDB/BroadcastChannel 浏览器环境；普通 test 的替身不能替代 test-browser 持久化/跨标签页证据。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`         | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`        | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-browser` | 显式浏览器运行时补证；检查 provider、include、环境与清理。             |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-plugin-workspace --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-workspace --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-workspace
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-workspace:test-browser --skipRemoteCache --skipNxCache
```

- `test-browser` 与普通 `test` 的运行面分别记录；专用 coverage 流程是否已纳入 browser project 需读配置，未纳入则补独立测量，不拿 Node summary 代证。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-workspace.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/packages/rxdb-plugin-workspace.md) 与 [续执行汇总](../follow-up-2026-10-03.md)。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。

## 2026-10-04：第二批实际深审

[本对象实际结论与证据](../results/packages/rxdb-plugin-workspace.md) · [2026-10-04 执行台账](../execution-2026-10-04.md)。只核销明确标识的包级专题；不把平台 skip、历史绿色门禁或不适用授权边界当成应用已通过。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**100 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-workspace` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**90.92% / 83.26% / 95.45% / 94.64%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-workspace/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态            | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                          | 不变量、正向与反证                                                                                                                                                                                                            | 已有/本轮测试证据                                                                                                                                                                             | 必要缺口或核销边界                                                                                                              |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证      | RxDBPluginWorkspace.ts:49、633–685、751–775；workspace-entry.ts:54–100                                    | 只监听 NEW/CREATE/REMOVE；NEW 与 patches$ 维护活草稿，CREATE 只在无更新的草稿上清理，REMOVE/discard 删除缓存。没有 UPDATE buffer 或 DELETE 撤销承诺，系统实体身份精确排除。                                                   | RxDBPluginWorkspace.spec.ts:280–361；workspace.browser.spec.ts:214–335 等真实 NEW/修改入口；当前 Node 100/100，通过的是现有状态机面。                                                         | 浏览器真实 save(CREATE)、既有实体 UPDATE 不进入草稿与主表不被缓存操作写入的完整当前链路尚需 browser/应用对照；不扩大 NEW 契约。 |
| C2  | closed / 本轮核销   | RxDBPluginWorkspace.ts:323–349、538–631；workspace-store.ts:75–143                                        | 完整 install/ready 状态机：成功重复 install 复用 Promise；失败 ready 仍 reject，仅显式 install 重试；未知 EntityType 保留草稿；回填及 catch/finally 同用 store 身份，旧纪元不得清新删除意图或标新失败；水合失败回滚半份发布。 | 当前 Node 100/100、0 skip。spec.ts:695–769（未知类型/读失败/水合回滚）、841 起（关闭中 ready）、1408–1489（四顺序）；workspace-store.spec.ts 的 open/blocked/close 故障面全部在当前套件通过。 | 本轮按原 C2 的全部最低场景核销；故障注入为 IDB/实体管理接缝，不宣称浏览器跨页或所有平台持久化通过，后者仍归 C4/C5。             |
| C3  | closed / 保留原限定 | RxDBPluginWorkspace.ts:295–308、816–948                                                                   | 保留 10 月 3 日原核销范围。当前重查：clone 逐项预检，可克隆 setMany 后 delMany；失败较新 save/delete 优先；晚批用 store 身份 guard；unclonable 点名 cacheIds，waiter 只在无 pending/queue 结算。                              | 历史限定单元 96/browser20 证据保留；当前 Node 100/100 复过 delete 阶段失败、新值保护、释放中的 waiter 与晚写入。                                                                              | 不把历史 Chromium 证据伪写成今日通过，不扩大到所有平台/长期故障；当前 browser fresh 由主控后补。                                |
| C4  | partial / 待证      | RxDBPluginWorkspace.ts:358–367、457–465、688–730、801–813；workspace-entry.ts:54–100                      | list structuredClone 深隔离；同 dbName channel、clientId 去自回灌；入站 shape/cacheId/data.id 守卫；sync_errors 在成功发送/删除时清。协议没有全序版本，不能凭两个按序消息称多写者乱序已验证。                                 | spec.ts:364–381、973–1002、1226–1305；browser:465–544 是同页两 channel 的正向/坏消息对照。当前 Node 全套过。                                                                                  | 同源真实双页面、不同库隔离、重复/乱序/多写者冲突的所有原最低场景未完全动态取证，C4 不核销。                                     |
| C5  | partial / 待证      | RxDBPluginWorkspace.ts:429–535；workspace-store.ts:58–71、125–158；package.json:28–42；src/index.ts:14–21 | scope 逆序摘事件/task pump/channel/store；保留实例级 changes$ 而不 complete，重装获得新纪元；IDB versionchange close 后忘记连接可重开；exports 与入口类型核对。构造只发布身份，不偷取资源。                                   | 当前 Node 100/100；browser:389–459、550 起真实重开/versionchange/写失败入口已读，主控 browser 尚待。                                                                                          | 当前真实 Chromium 刷新/重开和 close/reinstall 完整日志及发布消费仍缺；无法打开 IDB 的单元拒绝已证，不代替真实浏览器持久化证明。 |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
