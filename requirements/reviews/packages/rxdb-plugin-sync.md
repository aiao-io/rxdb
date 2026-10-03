---
kind: review-plan
object: rxdb-plugin-sync
source_root: packages/rxdb-plugin-sync
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# rxdb-plugin-sync：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

push/pull、分支同步、冲突处理、依赖排序与 QueryCache outbox orchestration。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-sync`](../../../packages/rxdb-plugin-sync)            |
| Nx 项目             | `rxdb-plugin-sync`                                                           |
| npm 名称            | `@aiao/rxdb-plugin-sync`                                                     |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 79 个；测试/共享套件入口 33 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/SyncManager.ts`](../../../packages/rxdb-plugin-sync/src/SyncManager.ts)
- [`src/pull-round.ts`](../../../packages/rxdb-plugin-sync/src/pull-round.ts)
- [`src/push-repository.ts`](../../../packages/rxdb-plugin-sync/src/push-repository.ts)
- [`src/sync-branches.ts`](../../../packages/rxdb-plugin-sync/src/sync-branches.ts)
- [`src/branch-materialization-source.ts`](../../../packages/rxdb-plugin-sync/src/branch-materialization-source.ts)
- [`src/query-cache-outbox.ts`](../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts)
- [`README.md`](../../../packages/rxdb-plugin-sync/README.md)
- [`package.json`](../../../packages/rxdb-plugin-sync/package.json)
- [`project.json`](../../../packages/rxdb-plugin-sync/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-sync/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-sync/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-sync/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-sync.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项              | 核查动作                                                                                  | 最低复验场景 / 证据要求                                                             | 状态   |
| ---- | ----------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| C1   | 同步状态与重入    | 画 orchestration 状态机，核查监听、并发启动、取消和网络恢复，不以最后异常为空代表已同步。 | 并发 sync、关闭时 push/pull、断线、重连、进程重开；pending/failure 可观察。         | 待核查 |
| C2   | 重试、幂等与冲突  | 追踪 change id/watermark、push 确认、pull conflict 与重复批次处理。                       | 服务端已写但响应丢失、重复/乱序批次、同实体两端更新、永久拒绝；不丢写不重放副作用。 | 待核查 |
| C3   | 拓扑与级联阻塞    | 核查 dependency graph、topological sort、祖先拉取和 cascade blocking。                    | 循环依赖、缺父实体、批内关联、删除与拉取竞争；失败原因明确且不无限循环。            | 待核查 |
| C4   | 分支物化与原子性  | 核查分页 staging、分支 identity、激活/CAS 屏障和同步 skip reason。                        | 续页冲突、分支删除重建、落败 CAS、schema 不匹配；无部分物化、不复活旧分支。         | 待核查 |
| C5   | QueryCache outbox | 核查 count/flush/pending ids 的身份隔离、部分失败和清理条件。                             | 离线增删改、部分成功、重新连接、重复 flush、未知错误；只清理确认已处理的写入。      | 待核查 |
| C6   | 保留与清理        | 追踪 cleanup-expired 对未确认变更、历史和分支引用的保护，并对照现有限制。                 | 水位边界、正在 push、不可达分支、过期策略误配置；不能为了清理速度删未同步数据。     | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **33** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/SyncManager.orchestration.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/SyncManager.orchestration.spec.ts)
- [`src/__tests__/branch-materialization-source.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/branch-materialization-source.spec.ts)
- [`src/__tests__/contracts/push-repository.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/contracts/push-repository.spec.ts)
- [`src/__tests__/pull-round.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/pull-round.spec.ts)
- [`src/__tests__/push-repository.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/push-repository.spec.ts)
- [`src/__tests__/query-cache-outbox.spec.ts`](../../../packages/rxdb-plugin-sync/src/__tests__/query-cache-outbox.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-sync/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-http`](rxdb-adapter-http.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`rxdb-adapter-http`](rxdb-adapter-http.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)。

## 5. 执行命令与环境

前置环境：本地多实例与可控远端；至少用真实 HTTP/Supabase 组合复验一条完整离线写→重连→确认链路。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-sync --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-sync:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-sync --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-sync:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-sync
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
