---
kind: review-plan
object: dev-rxdb-react-e2e
source_root: apps/dev-rxdb-react-e2e
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-react-e2e：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

React 浏览器综合演示的 Playwright 用户流程、跨框架对称和错误路径验证。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-react-e2e`](../../../apps/dev-rxdb-react-e2e)                |
| Nx 项目             | `dev-rxdb-react-e2e`                                                         |
| npm 名称            | `dev-rxdb-react-e2e`                                                         |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W6 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 36 个；测试/共享套件入口 29 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`playwright.config.ts`](../../../apps/dev-rxdb-react-e2e/playwright.config.ts)
- [`src/entity-model.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/entity-model.spec.ts)
- [`src/search-parity.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/search-parity.spec.ts)
- [`src/storage.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/storage.spec.ts)
- [`src/todo-cursor.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/todo-cursor.spec.ts)
- [`src/working-tree.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/working-tree.spec.ts)
- [`package.json`](../../../apps/dev-rxdb-react-e2e/package.json)
- [`project.json`](../../../apps/dev-rxdb-react-e2e/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-react-e2e/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                                            | 最低复验场景 / 证据要求                                                                                | 状态                                           |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| C1   | route / 能力到用例映射 | 逐个 spec 对照应用 routes 与三端能力矩阵；建立“真实用户流程→用例→backend/运行档位”表，不能仅凭 spec 名判断覆盖。    | 已有 Todo/游标、模型、生成器、编辑器、Tree/文件、搜索、OPFS/存储、工作树等逐项标明覆盖/未验证/不适用。 | 部分核销：editor route→测试映射（详本轮逐C表） |
| C2   | fixtures 隔离与真实性  | 核查建库/清库、test API、测试数据、storage scope 与共享 fixtures 的依赖；不允许 UI 与断言共用同一错误转换。         | 全套两遍、单用例、失败后继续、双页面/多 context；无陈旧库或前一用例状态造成假绿。                      | 未核销：隔离/清库专项（详本轮逐C表）           |
| C3   | 断言强度与异步等待     | 逐条检查是否验证可见状态和实际数据、错误路径与失败后无副作用；用事件/条件等待代替任意 sleep。                       | 修改/删除后重新查询、刷新重开、操作拒绝、等待超时；不能只检查按钮可点或截图相似。                      | 部分核销：已读断言判别力（详本轮逐C表）        |
| C4   | 三框架语义对照         | 对照 rxdb-test shared fixtures、search-parity、working-tree 和模型场景，记录真实功能差异，不强制复制框架专属 demo。 | 同输入/同拒绝序列三端结果一致；缺一端的用户能力登记问题，专属诊断页标明不适用。                        | 部分核销：editor 三端差异已落账（详本轮逐C表） |
| C5   | 平台与安全边界         | 核查 worker/OPFS、输入渲染、加密/权限和测试注入；跳过能力要写理由与替代证据。                                       | 离线/重连、恶意文本、多个标签页、WASM 缺失、加密 tamper；只宣称实际运行的浏览器/档位。                 | 未核销：worker/权限/加密专项（详本轮逐C表）    |
| C6   | 可访问性与产物来源     | 核查 search/working-tree a11y、键盘/焦点、console/network error 与 webServer/build/config 一致性。                  | 冷 build 启动、键盘完成主流程、端口冲突、旧产物；日志明确实际 SHA，skip 不算通过。                     | 部分核销：产物/配置；a11y 不足（详本轮逐C表）  |
| C7   | React 专项断言         | 对照 StrictMode root、drag/drop、异步 hook cleanup 与页面卸载，不能只验证首次挂载。                                 | 路由往返、双 mount、拖拽批撤销、搜索换词、加密初始化取消；检查无重复写/泄漏。                          | 未核销：框架专项用户链路（详本轮逐C表）        |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **29** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/entity-model.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/entity-model.spec.ts)
- [`src/search-parity.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/search-parity.spec.ts)
- [`src/storage.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/storage.spec.ts)
- [`src/todo-cursor.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/todo-cursor.spec.ts)
- [`src/working-tree.a11y.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/working-tree.a11y.spec.ts)
- [`src/working-tree.spec.ts`](../../../apps/dev-rxdb-react-e2e/src/working-tree.spec.ts)

运行配置：[`playwright.config.ts`](../../../apps/dev-rxdb-react-e2e/playwright.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

E2E 项目不以 spec 数或场景数折算业务覆盖率；以关键用户旅程、反向场景、实际宿主/平台与 skip 明细验收。生产代码覆盖率归对应应用/包，当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`dev-rxdb-react`](dev-rxdb-react.md)、[`rxdb-test`](../packages/rxdb-test.md)。

Nx 基线图中的直接消费者：未记录。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-react`](dev-rxdb-react.md)。

**三框架 E2E联审**：[`dev-rxdb-angular-e2e`](dev-rxdb-angular-e2e.md)、[`dev-rxdb-vue-e2e`](dev-rxdb-vue-e2e.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：需 Playwright 配置的实际浏览器、配套应用产物与 WASM 资源；先阅读 webServer/ports/清库策略。不得复用未知旧服务或用户数据库。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                     |
| ----------- | ------------------------------------------------------------------ |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `e2e`       | 当前 Playwright 全套；记录宿主、浏览器、skip、trace 与数据隔离。   |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-react-e2e --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-react-e2e:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck --projects=dev-rxdb-react-e2e --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-react-e2e:e2e --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-react-e2e.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/apps/dev-rxdb-react-e2e.md) 与 [续执行汇总](../follow-up-2026-10-03.md)。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`dev-rxdb-react-e2e`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：2/39 个 tracked 有实际展示行，2 个全文已展示；未读 37 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                  | 本轮结论                        | 实际生产路径 / 符号行                                                                                                                                                                                                                                                                                                                           | 事件时序 / 不变量                                                                                                                 | 测试判别力 / 已用证据                                                                                                      | 必要未验与补证动作                                                                                                    |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C1 route / 能力到用例映射 | 部分核销：editor route→测试映射 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/src/code-editor.spec.ts:3-18 现有 editor 用户入口断言`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/app.tsx:11,59-67 singleton / RxDBProvider`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/router.tsx:28-34,36-147 connectLocalAdapter / routes` | goto /code-editor → textbox/初值；Angular 加关键字彩色 token；其他 route/spec 清单未逐条核对。                                    | 已读真实断言，不按 spec 名假设覆盖；code-editor 请求留主控串行执行。                                                       | 全路由/业务/backend/模式映射仍必需；单 editor spec 不代表42/39个tracked已审。                                         |
| C2 fixtures 隔离与真实性  | 未核销：隔离/清库专项           | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/playwright.config.ts:70-81 当前产物 webServer / Chromium`                                                                                                                                                                                                                             | server 明确不复用；Angular failureArchive 在 unexpected failed/timedOut 后执行；fixture 中段尚未读完，不能宣称有界传输/清库通过。 | editor 文件不创建 DB 数据；共享 RxDB test fixtures、DB 清理、失败 teardown 未全部审。                                      | 必要：每用例库名/跨 tab/Worker scope、与实际 UI 不共用错误转换；主控结果仅按执行用例收口。                            |
| C3 断言强度与异步等待     | 部分核销：已读断言判别力        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/src/code-editor.spec.ts:3-18 现有 editor 用户入口断言`                                                                                                                                                                                                                                | visible host 不足，textbox+CREATE TABLE 能检出未挂载；Angular token 多色额外检出 highlight 装饰失效；React/Vue 静态初值更弱。     | 现有 editor 无 fill/type、composition、selection、readonly toggle、语言切换断言；不把测试名字/通过包装成这些行为。         | 其他业务异常/零副作用、条件等待、任意 sleep 尚待逐条审；新增测试动作由后续主控专题负责。                              |
| C4 三框架语义对照         | 部分核销：editor 三端差异已落账 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/src/code-editor.spec.ts:3-18 现有 editor 用户入口断言`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/pages/code-editor.tsx:15-22 useState/onChange`                                                                                                                  | 三端默认 SQL 文档一致；Angular value-only 与 React/Vue 双向状态不同；只有 Angular editor E2E 验高亮颜色。                         | 源码/断言实际对照完成这条子项；不强行复制 Angular 专有回放/归档页面。                                                      | search-parity/working-tree/model/file 操作全矩阵未核销；跨端 shared imports 尚需追到真正 suite。                      |
| C5 平台与安全边界         | 未核销：worker/权限/加密专项    | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/playwright.config.ts:70-81 当前产物 webServer / Chromium`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/rxdb/setup_rxdb_sqlite-wasm.ts:25-88 setup / plugins / init / test API / connector`                                                                          | Angular 8200 IDB，React/Vue 默认能力选择；浏览器运行并不自动证明实际后端、加密或者测试 hook 安全。                                | 无当轮完整 storage/encrypted/worker/OPFS 报告；不复制已修存储旧问题。                                                      | 必要：实际 backend 明示、拒绝前零副作用、当前 fixture/test API gating；unsupported 不可当 passed。                    |
| C6 可访问性与产物来源     | 部分核销：产物/配置；a11y 不足  | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/playwright.config.ts:70-81 当前产物 webServer / Chromium`                                                                                                                                                                                                                             | webServer false 避免借用旧 server；Angular 静态 build，React/Vue vite preview；配置只启用 Chromium，Firefox/WebKit 注释不算覆盖。 | main69 lint/typecheck 绿色；本子任务未运行 browser/server；trace 配置不是 trace 已产生。                                   | search/working-tree a11y、focus/keyboard、console/network、当前 build SHA 与截图/trace需主控实际结果；IMEs 另列必需。 |
| C7 React 专项断言         | 未核销：框架专项用户链路        | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/app.tsx:11,59-67 singleton / RxDBProvider`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react/src/app/router.tsx:28-34,36-147 connectLocalAdapter / routes`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-react-e2e/src/code-editor.spec.ts:3-18 现有 editor 用户入口断言` | 只读到框架 bootstrap 与 editor spec；未把 package TestBed/RTL/Vue mount 证明升格成应用 E2E。                                      | Angular failure-archive 专项中段、React 特有 render/权限/remote-cache、Vue composable 参数/选择/展开路径尚需具体用例证据。 | 须按路由、宿主、运行参数补本轮结果；无需等待外部宿主才核销已完成 editor 小专题。                                      |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/dev-rxdb-react-e2e.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/dev-rxdb-react-e2e.md`。
