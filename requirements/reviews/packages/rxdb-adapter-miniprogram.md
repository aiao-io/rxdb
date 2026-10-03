---
kind: review-plan
object: rxdb-adapter-miniprogram
source_root: packages/rxdb-adapter-miniprogram
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# rxdb-adapter-miniprogram：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

实验性微信逻辑层单 realm/单连接 wa-sqlite adapter 与内存缓冲文件 VFS。

| 项目                | 基线事实                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                |
| 源码范围            | [`packages/rxdb-adapter-miniprogram`](../../../packages/rxdb-adapter-miniprogram) |
| Nx 项目             | `rxdb-adapter-miniprogram`                                                        |
| npm 名称            | `@aiao/rxdb-adapter-miniprogram`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）      |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                                 |
| 受控文件盘点        | 43 个；测试/共享套件入口 15 个（按文件名，不代表覆盖率）                          |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                      |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterWaSqliteMiniProgram.ts`](../../../packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts)
- [`src/runtime-capabilities.ts`](../../../packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts)
- [`src/runtime-polyfills.ts`](../../../packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts)
- [`src/loader.ts`](../../../packages/rxdb-adapter-miniprogram/src/loader.ts)
- [`src/wechat-file-vfs.ts`](../../../packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts)
- [`src/statement-cleanup.ts`](../../../packages/rxdb-adapter-miniprogram/src/statement-cleanup.ts)
- [`README.md`](../../../packages/rxdb-adapter-miniprogram/README.md)
- [`package.json`](../../../packages/rxdb-adapter-miniprogram/package.json)
- [`project.json`](../../../packages/rxdb-adapter-miniprogram/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-miniprogram/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-miniprogram/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-miniprogram/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`./runtime`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-miniprogram.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                    | 核查动作                                                                              | 最低复验场景 / 证据要求                                                                      | 状态   |
| ---- | ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| C1   | 支持边界与前置能力      | 对照 README 的微信逻辑层、同步 WASM、单连接、rollback journal 和约 10 MB 验证范围。   | WAL/Worker/SharedWorker/第二连接及非微信环境明确拒绝；不声称 crash-safe 或通用小程序支持。   | 待核查 |
| C2   | WASM / glue 与 polyfill | 核查 WXWebAssembly、精确依赖资源、文本编码和同步 callback；不要把异步能力伪装成同步。 | 资源不存在、错误 glue、坏 UTF-8、缺能力、API 抛错；初始化错误可见。                          | 待核查 |
| C3   | 安全随机                | 审查随机池补给、耗尽、调用次数与熵来源，不以可用性替代安全性。                        | 长时循环耗尽、补给失败、启动缺随机源；必须拒绝，不回退 Math.random。                         | 待核查 |
| C4   | 文件 VFS 与事务         | 追踪 read/write/truncate/close、文件缓冲、journal、范围验证和 statement cleanup。     | 文件 API 失败、超边界读写、rollback、打开关闭重开、内存压力；明确平台不提供的 fsync/锁保证。 | 待核查 |
| C5   | 真实设备证据            | 对照 mock、real-wasm、miniprogram E2E 的实际宿主；不同证据不能互相替代。              | 微信 DevTools 与真机启动/重开 CRUD 证据分列；无法验证的崩溃恢复写成限制，而非通过。          | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **15** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/loader.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/loader.spec.ts)
- [`src/__tests__/runtime-capabilities.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/runtime-capabilities.spec.ts)
- [`src/__tests__/runtime-polyfills-errors.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/runtime-polyfills-errors.spec.ts)
- [`src/__tests__/runtime-polyfills.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/runtime-polyfills.spec.ts)
- [`src/__tests__/statement-cleanup.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/statement-cleanup.spec.ts)
- [`src/__tests__/wechat-file-vfs-errors.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/wechat-file-vfs-errors.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-miniprogram/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-miniprogram`](../apps/dev-rxdb-miniprogram.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-miniprogram`](../apps/dev-rxdb-miniprogram.md)、[`dev-rxdb-miniprogram-e2e`](../apps/dev-rxdb-miniprogram-e2e.md)。

## 5. 执行命令与环境

前置环境：微信逻辑层 API、WXWebAssembly、精确版本 glue/wasm；需微信 DevTools/真机复验。普通浏览器不支持证明此运行时。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-miniprogram --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-miniprogram:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-miniprogram --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-miniprogram:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-miniprogram
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
