---
kind: review-plan
object: dev-rxdb-miniprogram
source_root: apps/dev-rxdb-miniprogram
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# dev-rxdb-miniprogram：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Taro 微信小程序演示，执行 runtime preflight 与单连接 RxDB Todo 流程。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-miniprogram`](../../../apps/dev-rxdb-miniprogram)            |
| Nx 项目             | `dev-rxdb-miniprogram`                                                       |
| npm 名称            | `dev-rxdb-miniprogram`                                                       |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 21 个；测试/共享套件入口 0 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/app.ts`](../../../apps/dev-rxdb-miniprogram/src/app.ts)
- [`src/runtime-preflight.ts`](../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts)
- [`src/rxdb-demo.ts`](../../../apps/dev-rxdb-miniprogram/src/rxdb-demo.ts)
- [`src/pages/index/index.tsx`](../../../apps/dev-rxdb-miniprogram/src/pages/index/index.tsx)
- [`package.json`](../../../apps/dev-rxdb-miniprogram/package.json)
- [`project.json`](../../../apps/dev-rxdb-miniprogram/project.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-miniprogram/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                 | 核查动作                                                                                                                      | 最低复验场景 / 证据要求                                                                           | 状态   |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| C1   | 真实发布档位         | 对照 Taro scripts、默认 build 与 adapter 支持范围；其它脚本存在不代表对应平台 RxDB 可用。                                     | 微信逻辑层启动、非微信档位/缺能力拒绝；H5/RN 编译不能当微信支持证据。                             | 待核查 |
| C2   | 前置能力与安全随机   | 核查 preflight 的 WebAssembly、文本编码、文件 API 和安全随机检查，拒绝应先于开库。                                            | 缺 WXWebAssembly、随机源/随机池不足、文件 API 抛错；不用 Math.random 或浏览器 mock 过关。         | 待核查 |
| C3   | 单连接与启动生命周期 | 追踪 app/page 生命周期、demo DB 创建、首次载入与失败重试；页面复开不创建并发连接。                                            | 切后台/前台、页面重入、初始化失败、二次启动；单 realm 单连接约束保持。                            | 待核查 |
| C4   | Todo / 持久化 / 限制 | 检查 CRUD、错误呈现、关库重开与实际 VFS 写入；不承诺平台没有的崩溃恢复。                                                      | 增删改、重开持久化、文件错误、数据增长；明确约 10 MB 验证范围与 crash-safe 限制。                 | 待核查 |
| C5   | 资源与测试缺口确认   | 核查 glue/wasm 拷贝、代码包大小、精确依赖与 React18/Taro 隔离；本目录未发现匹配命名的测试文件，需检查其它测试入口后判定缺口。 | 微信 build/DevTools/真机三份证据；不要把 build:h5、adapter test 或 E2E 的存在当作应用单测已覆盖。 | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **0** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

该命名规则未发现测试文件；继续检查配置、内联/外部测试与 E2E 归属后再判断缺口。没有 `test` target 的项目不能用 lint/build 充当业务测试。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-miniprogram`](../packages/rxdb-adapter-miniprogram.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-miniprogram-e2e`](dev-rxdb-miniprogram-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-miniprogram-e2e`](dev-rxdb-miniprogram-e2e.md)、[`rxdb-adapter-miniprogram`](../packages/rxdb-adapter-miniprogram.md)。

## 5. 执行命令与环境

前置环境：微信 DevTools/真机与精确版本资源；Taro 使用的 React 档位以本应用配置为准，不强行套主工作区 React19。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                     |
| ----------- | ------------------------------------------------------------------ |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。    |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。           |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-miniprogram --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-miniprogram:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck build --projects=dev-rxdb-miniprogram --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

- 本项目没有 `test` target；已有多平台 build/dev 脚本不等于承诺这些运行档位受支持。按当前微信范围复验，并与 `e2e-devtools` 联审测试缺口。

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
