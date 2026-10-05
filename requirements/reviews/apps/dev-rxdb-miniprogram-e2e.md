---
kind: review-plan
object: dev-rxdb-miniprogram-e2e
source_root: apps/dev-rxdb-miniprogram-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-miniprogram-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

通过微信 DevTools/automation 驱动的启动、Todo、持久化与安全随机探针。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-miniprogram-e2e`](../../../apps/dev-rxdb-miniprogram-e2e)    |
| Nx 项目             | `dev-rxdb-miniprogram-e2e`                                                   |
| npm 名称            | `@aiao/dev-rxdb-miniprogram-e2e`                                             |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 14 个；测试/共享套件入口 4 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/dev-rxdb-miniprogram-e2e/playwright.config.ts)
- [`src/devtools-environment.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/devtools-environment.ts)
- [`src/runtime-probes.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/runtime-probes.ts)
- [`src/runtime-bootstrap.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/runtime-bootstrap.spec.ts)
- [`src/secure-random.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/secure-random.spec.ts)
- [`src/launch-persistence.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/launch-persistence.spec.ts)
- [`README.md`](../../../apps/dev-rxdb-miniprogram-e2e/README.md)
- [`package.json`](../../../apps/dev-rxdb-miniprogram-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-miniprogram-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-miniprogram-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                     | 核查动作                                                                        | 最低复验场景 / 证据要求                                                                       | 状态                                                  |
| ---- | ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| C1   | 真实 DevTools 与前置条件 | 核查 fixtures、DevTools executable/端口/project、automation 初始化和 skip。     | 环境缺失、连接失败、项目未 build、错误平台；明确未验证，不能换成浏览器 mock 得出通过。        | 部分核销：真实宿主前置与归属（详本轮逐C表）           |
| C2   | runtime bootstrap        | 审查探针实际处于逻辑层，验证 WASM/glue、polyfill、文件 API 和只允许的能力档位。 | 缺 WXWebAssembly、loader 失败、未知档位/第二连接；拒绝先于数据库操作。                        | 部分核销：自包含逻辑层探针设计（详本轮逐C表）         |
| C3   | 安全随机耐久性           | 检查 secure-random 用例是否证明熵来源、池补给和耗尽拒绝，而不只是“随机值不同”。 | 长循环、补给失败、缺安全随机源；不能用统计表象证明密码学安全。                                | 部分核销：随机耐久断言边界（详本轮逐C表）             |
| C4   | Todo 与启动持久化        | 核查实际 CRUD 与完整重开过程，区分 page reload、DevTools 重连与应用进程重启。   | 增删改、离开重入、完整重开、VFS 错误；平台不保证 crash-safe 的部分标限制。                    | 部分核销：CRUD 与持久化测试设计（详本轮逐C表）        |
| C5   | 隔离与设备矩阵           | 核查 DB/USER_DATA_PATH 清理、DevTools session 回收及真机证据来源。              | 重复两轮、失败 teardown、专用测试 project；DevTools 通过不能自动宣称所有真机/小程序平台通过。 | 部分核销：单 worker/归属；设备隔离缺口（详本轮逐C表） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **4** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/launch-persistence.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/launch-persistence.spec.ts)
- [`src/runtime-bootstrap.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/runtime-bootstrap.spec.ts)
- [`src/secure-random.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/secure-random.spec.ts)
- [`src/todo-crud.spec.ts`](../../../apps/dev-rxdb-miniprogram-e2e/src/todo-crud.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/dev-rxdb-miniprogram-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-miniprogram`](dev-rxdb-miniprogram.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-miniprogram`](dev-rxdb-miniprogram.md)、[`rxdb-adapter-miniprogram`](../packages/rxdb-adapter-miniprogram.md)。

## 5. 执行命令与环境

前置环境：微信 DevTools、miniprogram-automator 所需配置和已构建微信项目；本项目目标是 e2e-devtools，不能臆造 :e2e。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                     |
| -------------- | ------------------------------------------------------------------ |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `e2e-devtools` | 真实微信 DevTools 自动化；不是普通浏览器 e2e。                     |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-miniprogram-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-miniprogram-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-miniprogram-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-miniprogram-e2e:e2e-devtools --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-miniprogram-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：生成器、图与小程序第四批深审

[本对象实际意见与复验证据](../results/apps/dev-rxdb-miniprogram-e2e.md) · 本批台账。只核销明确运行面；Node harness 不冒充真实小程序档位。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`dev-rxdb-miniprogram-e2e`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：8/15 个 tracked 有实际展示行，8 个全文已展示；未读 7 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                    | 本轮结论                               | 实际生产路径 / 符号行                                                                                                                                                                                                                                                              | 事件时序 / 不变量                                                                                                      | 测试判别力 / 已用证据                                                                            | 必要未验与补证动作                                                                                         |
| --------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| C1 真实 DevTools 与前置条件 | 部分核销：真实宿主前置与归属           | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/devtools-environment.ts:37-79,96-117 CLI/project/build/service-port fail-fast`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/fixtures.ts:16-27,61-78 owned / connect / launch`          | CLI/project/dist 缺失抛错非 skip；自 launch owned 才 close；接用户既有 ws 非 owned，不擅关 GUI。                       | 本轮未启动 DevTools；不会以浏览器 mock 代替。请求已限定专用 project/USER_DATA_PATH。             | 必要：真实 CLI/基础库/平台及测试专用目录；当前环境可用性未测，不能根据源路径判断已安装。                   |
| C2 runtime bootstrap        | 部分核销：自包含逻辑层探针设计         | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/runtime-probes.ts:27-75 readRandomSource/drawRandomValues explicit args`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/runtime-bootstrap.spec.ts:18-44 runtime source / SQLite version` | toString 探针参数自包含，无 Node imports/闭包；UI 与随机实现来源两条读数；sqlite_version 证明实际 SQL，不只 presence。 | 已读源码，旧 Node 引导回调问题不重报；runtime self-check 徽标仍依赖被测程序，不叫独立 CRUD证明。 | 还须实际 automator 逻辑层运行与缺 glue/runtime 负例；Node/happy-dom单测不能核销。                          |
| C3 安全随机耐久性           | 部分核销：随机耐久断言边界             | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/secure-random.spec.ts:5-28,38-82 pool / refill / overdraw`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/runtime-probes.ts:42-74 cross-evaluate registry`                               | 跨批次 Set 检重复/零；批间250ms明确让位；超池同 tick 必须耗尽拒绝，不用随机不同证明密码学安全。                        | 设计有正/负对照，统计表象只能证明池行为；真实来源与耗尽当轮未运行。                              | 必需实际桥接/补给失败、池来源证据；250ms 不是性能/补给 SLA，通过不能推广真机所有调度。                     |
| C4 Todo 与启动持久化        | 部分核销：CRUD 与持久化测试设计        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/todo-crud.spec.ts:13-54 真实 UI / reLaunch`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/launch-persistence.spec.ts:16-38 serial reset→pending→pass→reset`                             | 独立标题；UI add/remove 与数量；清探针后 pending→reLaunch passed→再清回 pending，避免恒真。                            | toggle 用例只检条目未消失，不检 completed 状态；reLaunch 仅页面重进，不等完整应用进程重启。      | 必须补 completed 状态、完整 close/launch、落盘/错误路径实际报告；不能把注释“跨启动”扩大成 crash recovery。 |
| C5 隔离与设备矩阵           | 部分核销：单 worker/归属；设备隔离缺口 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/playwright.config.ts:25-38 one worker / no browser`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-e2e/src/fixtures.ts:61-78 owned teardown / reLaunch`                                              | 一个 DevTools worker；reset 作用于固定 demo 库，需专用测试 project；non-owned session 不关闭。                         | 8/15 tracked 已读完，README/demo-page/lifecycle spec/配置尚未全文读；无当前真机执行记录。        | 设备矩阵 weapp/tt/alipay、失败 teardown、重复两轮与测试目录清理未核销；不能擅接个人 GUI 清数据。           |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/dev-rxdb-miniprogram-e2e.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/dev-rxdb-miniprogram-e2e.md`。
