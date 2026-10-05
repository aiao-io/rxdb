---
kind: review-plan
object: rxdb-adapter-supabase
source_root: packages/rxdb-adapter-supabase
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-supabase：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Supabase remote adapter、repository、PostgREST 规则、分页、Realtime 与 RLS 边界。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-supabase`](../../../packages/rxdb-adapter-supabase)  |
| Nx 项目             | `rxdb-adapter-supabase`                                                      |
| npm 名称            | `@aiao/rxdb-adapter-supabase`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 65 个；测试/共享套件入口 34 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSupabase.ts`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)
- [`src/SupabaseRepository.ts`](../../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts)
- [`src/rule_group_builder.ts`](../../../packages/rxdb-adapter-supabase/src/rule_group_builder.ts)
- [`src/pagination.ts`](../../../packages/rxdb-adapter-supabase/src/pagination.ts)
- [`src/supabase.rls.ts`](../../../packages/rxdb-adapter-supabase/src/supabase.rls.ts)
- [`src/handle_supabase_change.ts`](../../../packages/rxdb-adapter-supabase/src/handle_supabase_change.ts)
- [`README.md`](../../../packages/rxdb-adapter-supabase/README.md)
- [`package.json`](../../../packages/rxdb-adapter-supabase/package.json)
- [`project.json`](../../../packages/rxdb-adapter-supabase/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-supabase/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-supabase/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-supabase/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-supabase.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: workspace:*`、`@aiao/rxdb-plugin-tree: workspace:*`、`@supabase/supabase-js: ^2.88.0`、`rxjs: ^7.8.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                 | 核查动作                                                                            | 最低复验场景 / 证据要求                                                                                  | 状态                              |
| ---- | -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| C1   | 身份与 RLS           | 对照 entity_scope、RLS helpers、SQL/RPC、应用配置与 public/privileged key 边界。    | 匿名与受限用户、跨身份读写、scope 参数篡改、RPC 权限；不能用 service-role 绕过策略后称隔离通过。         | 待核查                            |
| C2   | PostgREST 与类型映射 | 审查规则嵌套、escaping、关系、transform 和 error mapping。                          | 特殊标识符、嵌套 AND/OR、null、BigInt/binary、未知列、PostgREST 错误；本地与远端语义可对照。             | 部分执行；RV-060 关系元数据对照   |
| C3   | 批写、分支与 RPC     | 核查 mutations/merge changes 的原子性、幂等、主分支/其它分支的现有边界。            | 批次中途失败、重复调用、分支同步、main 之外变更；把已知限制对照 roadmap，不暗中扩承诺。                  | 部分执行；RV-059 真实大批删除     |
| C4   | 分页与实时失效       | 审查分页 token、Realtime 订阅建立/销毁和过期消息对 repository 的影响。              | 可空列、排序相同、断线重订阅、频道泄露、错 scope 通知；分页不丢行，状态不假绿。                          | 待核查                            |
| C5   | 真实环境测试         | 核查 test-env/Docker 的建表、权限、reset/seed 与测试帐号；mock 只能证明局部映射。   | 隔离 Supabase 全套 CRUD/query/branch/Realtimes；记录实际配置与跳过项，不使用生产帐号。                   | 部分执行；隔离 CI /真实 REST 复验 |
| C6   | 依赖与客户端安全     | 对照 peer exports、前端 bundle、日志和错误提示；核查凭证审计在应用 build 之后运行。 | 没有 privileged key 的生产包、独立 consumer、远端失败诊断；不把 npm 包 API 存在等同于服务端 RPC 已部署。 | 待核查                            |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **34** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/RxDBAdapterSupabase.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/RxDBAdapterSupabase.spec.ts)
- [`src/__tests__/pagination-truncation.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/pagination-truncation.spec.ts)
- [`src/__tests__/adapter-mutations.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/adapter-mutations.spec.ts)
- [`src/__tests__/applyRuleGroup.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/applyRuleGroup.spec.ts)
- [`src/__tests__/branch-contracts.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/branch-contracts.spec.ts)
- [`src/__tests__/errors.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/errors.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-supabase/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-test`](rxdb-test.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-supabase-e2e`](../apps/dev-rxdb-supabase-e2e.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)。

## 5. 执行命令与环境

前置环境：项目 Docker/test-env 对应的隔离 Supabase、schema/RPC/Realtime 与测试身份。test-env 会创建本地服务，先确认隔离资源和清理策略。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                              |
| ----------- | --------------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。             |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。          |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。      |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。                    |
| `test-env`  | 启动隔离 Supabase Docker 测试环境；有环境副作用，先确认实例/端口/数据目录。 |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-supabase --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-supabase:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-supabase --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-supabase:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-supabase
```

- `test` 会经 `dependsOn` 启动 `test-env`；确认隔离 Docker 实例后才能运行，结束后按已有环境约定回收。不得指向生产 Supabase。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-supabase.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 实际 SDK/REST 与普通仓储/metadata 对照，确认两项；1100 行 upsert 截断猜测被否定。未通过 RLS/Realtime/发布消费完整专题。

确认意见：[RV-059](../RV-059-supabase-bulk-delete-url-overflow.md)、[RV-060](../RV-060-supabase-querycache-relation-metadata-missing.md)。全批门禁、接缝和中间取证错误见 [本轮执行台账](../execution-2026-10-05-supabase.md)；[源码指纹](../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。
