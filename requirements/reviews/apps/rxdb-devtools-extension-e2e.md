---
kind: review-plan
object: rxdb-devtools-extension-e2e
source_root: apps/rxdb-devtools-extension-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-devtools-extension-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

加载真实 Chromium 扩展验证 background/content/devtools 页面 relay。

| 项目                | 基线事实                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                            |
| 源码范围            | [`apps/rxdb-devtools-extension-e2e`](../../../apps/rxdb-devtools-extension-e2e) |
| Nx 项目             | `rxdb-devtools-extension-e2e`                                                   |
| npm 名称            | `rxdb-devtools-extension-e2e`                                                   |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）    |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                               |
| 受控文件盘点        | 9 个；测试/共享套件入口 1 个（按文件名，不代表覆盖率）                          |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                       |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/rxdb-devtools-extension-e2e/playwright.config.ts)
- [`src/extension.fixture.ts`](../../../apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts)
- [`src/relay.spec.ts`](../../../apps/rxdb-devtools-extension-e2e/src/relay.spec.ts)
- [`tools/prepare.mjs`](../../../apps/rxdb-devtools-extension-e2e/tools/prepare.mjs)
- [`package.json`](../../../apps/rxdb-devtools-extension-e2e/package.json)
- [`project.json`](../../../apps/rxdb-devtools-extension-e2e/project.json)
- [`tsconfig.json`](../../../apps/rxdb-devtools-extension-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                        | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                                   | 状态                                                                       |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| C1   | 准备产物与 Chromium context | 审查 prepare、extension fixture、持久 context/临时 profile 与扩展路径，确认加载当前 build。 | 冷 prepare/build、陈旧产物、缺 manifest、失败退出；extension id、SHA 和资源路径可查。     | 部分执行；当轮子面已核实：准备/fixture设计；动态产物待证（详本轮逐C表）    |
| C2   | relay 正反向身份            | 从页面 through content/background/devtools 核查真实消息与拒绝；不能只检查 port 建立。       | 错 tab/frame/session、页面伪造、导航后文档变化、旧响应；错误消息无法触发 mutation。       | 部分核销：只证明正向协商设计（详本轮逐C表）                                |
| C3   | 请求关联与资源              | 审查 timeout、断开、乱序、并发请求和队列清理。                                              | 扩展 reload、tab 关闭、DevTools 关开、慢页面、巨大消息；无悬挂 Promise/port。             | 未核销：请求/资源压力专题（详本轮逐C表）                                   |
| C4   | 实际 provider 用户路径      | 对照 rxdb-devtools 与 modules 面板能力，把 relay 测试与 DB/files/settings 的可见效果关联。  | 只读/禁用能力、失败响应、snapshot 缺口、敏感值脱敏；按钮成功不等于权限验证成功。          | 部分核销：none 零业务帧；实际 provider未验（详本轮逐C表）                  |
| C5   | 结论边界与补证              | 检查单一 relay spec 内实际场景和 skip；浏览器证据不代替 Electron/Tauri integration。        | 配置的 Chromium 全套、生产权限与资源、孤儿 profile 清理；未覆盖宿主登记补证而非宣称通过。 | 部分执行；当轮子面已核实：适用范围/未验清单（不等运行通过）（详本轮逐C表） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **1** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/relay.spec.ts`](../../../apps/rxdb-devtools-extension-e2e/src/relay.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/rxdb-devtools-extension-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb-devtools-extension`](rxdb-devtools-extension.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-devtools-extension`](rxdb-devtools-extension.md)。

## 5. 执行命令与环境

前置环境：真实 Chromium 扩展加载与临时 profile；prepare 和 app build 的前置依赖遵循 Nx 当前配置。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                     |
| ----------- | ------------------------------------------------------------------ |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `prepare`   | 扩展 E2E 的构建/装配准备；遵循 dependsOn，不复用未知旧产物。       |
| `e2e`       | 当前 Playwright 全套；记录宿主、浏览器、skip、trace 与数据隔离。   |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-devtools-extension-e2e --json
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=rxdb-devtools-extension-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension-e2e:e2e --skipRemoteCache --skipNxCache
```

- `prepare` 的构建链路必须核对；遵循当前 `dependsOn`，不能把未知来源旧扩展文件加载成功算通过。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/rxdb-devtools-extension-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`rxdb-devtools-extension-e2e`，日期 **2026-10-05**；🟡 完整范围源码/测试设计评审候选；运行未验面已明确留账。
- scope 是范围，不是阅读证明：9/9 个 tracked 有实际展示行，9 个全文已展示；未读 0 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                       | 本轮结论                                   | 实际生产路径 / 符号行                                                                                                                                                                                                                                                    | 事件时序 / 不变量                                                                                                             | 测试判别力 / 已用证据                                                                                                           | 必要未验与补证动作                                                                                                           |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1 准备产物与 Chromium context | 已核销：准备/fixture设计；动态产物待证     | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/tools/prepare.mjs:32-58 rm out / cp builds / variance`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts:82-102 persistent context/worker id`              | 先清 staging，再复制真实两个 dist；缺 manifest/read失败显式抛；Chromium 临时 profile，真实 worker URL 取 id；teardown close。 | 9/9 tracked 全文读；resolved graph e2e depends prepare、prepare depends extension+devtools build；本轮尚未执行。                | 必须冷准备 SHA/manifest 与当前源码对应、browser版本/真实 profile 清理；复制成功不证明源 dist 不陈旧。                        |
| C2 relay 正反向身份            | 部分核销：只证明正向协商设计               | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/relay.spec.ts:116-175 handshakeThroughRelay / session identity / ACK`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts:39-79 mock devtools API only`  | 开panel→reload→手工 emit onNavigated；要求 HELLO 经四段、offers 同 session、仅一个v2 ACK且无legacy ACK。                      | 不按消息条数误判多 HELLO；身份判据有判别力，但当前文件没有错 tab/frame/session、页面伪造、旧 document 的反向 mutation 断言。    | 本轮 Chrome 执行待主控；正向 ACK 不核销身份攻击全矩阵，DevTools 真宿主是 variance。                                          |
| C3 请求关联与资源              | 未核销：请求/资源压力专题                  | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts:89-102 context ownership`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/relay.spec.ts:134-199 只有两条 relay tests`                                | context use 后 close 是已读归属；现套件没有并发 request/timeout/乱序/tab关闭/extension reload/巨大消息断言。                  | 测试存在不等这些路径已测；不存在的断言明确列缺口，不写假通过。                                                                  | 需专门并发/取消/timeout/port重开与句柄计数，用 endpoint unit 不能替真实 reload。                                             |
| C4 实际 provider 用户路径      | 部分核销：none 零业务帧；实际 provider未验 | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/fixture/index.html:30-75 RxDB event substitute / throwing manager getters`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/relay.spec.ts:177-197 none before/after handshake` | 同tick init事件→握手→再发事件；四车道录制；none 下 EVENT/DB_INFO/BRANCHES 都零，避免“尚未连接”假阴性。                        | fixture 是最小事件 RxDB 替身、真实发布 connector；没有实际 DB/files/settings mutation、readonly拒绝/snapshot/脱敏可见结果断言。 | 本轮执行未验；none 特例不能推广 full+omit/readonly provider全权限。补真实 provider 用户路径。                                |
| C5 结论边界与补证              | 已核销：适用范围/未验清单（不等运行通过）  | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/playwright.config.ts:16-32 one worker / trace / fresh server`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts:20-31,82-102 DevTools shim / real relay`   | 两个variance：prepare 加 localhost 静态 host 权限；普通扩展panel shim devtools.*；其余四段真实；配置无Electron/Tauri矩阵。    | 源码全部9文件已读，设计结论可提交收口候选；主控 lint/typecheck通过，但 E2E runtime仍待请求。                                    | trace设置不是当前trace；skip/browser失败/临时profile/产物SHA必须主控报告；不能称真实DevTools宿主或生产optional权限验收完成。 |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/rxdb-devtools-extension-e2e.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/rxdb-devtools-extension-e2e.md`。
