---
kind: review-plan
object: rxdb-plugin-querycache
source_root: packages/rxdb-plugin-querycache
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-querycache：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

SyncType.QueryCache 查询缓存引擎、远端主适配器和离线写语义。

| 项目                | 基线事实                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| 对象类型            | 包                                                                            |
| 源码范围            | [`packages/rxdb-plugin-querycache`](../../../packages/rxdb-plugin-querycache) |
| Nx 项目             | `rxdb-plugin-querycache`                                                      |
| npm 名称            | `@aiao/rxdb-plugin-querycache`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）  |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                             |
| 受控文件盘点        | 31 个；测试/共享套件入口 12 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进行恢复/读写竞争深审；有确认意见，专项及覆盖率未完成               |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/QueryCacheEngine.ts`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts)
- [`src/query-cache-primary.ts`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts)
- [`src/query-cache-sync-memo.ts`](../../../packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts)
- [`src/query-cache-engine.factory.ts`](../../../packages/rxdb-plugin-querycache/src/query-cache-engine.factory.ts)
- [`src/plugin.ts`](../../../packages/rxdb-plugin-querycache/src/plugin.ts)
- [`README.md`](../../../packages/rxdb-plugin-querycache/README.md)
- [`package.json`](../../../packages/rxdb-plugin-querycache/package.json)
- [`project.json`](../../../packages/rxdb-plugin-querycache/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-querycache/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-querycache/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-querycache/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-querycache.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                  | 核查动作                                                                              | 最低复验场景 / 证据要求                                                                 | 状态                                    |
| ---- | --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| C1   | 缓存身份与质量        | 核查查询键、entity/scope/branch 身份、缓存有效性和已缓存/完整结果的区别。             | 相同过滤不同库、分页部分缓存、规则改变、远端 invalidation；不可把部分结果称为完整命中。 | partial / 待证（2026-10-05；见第 8 节） |
| C2   | 离线读取与错误        | 追踪本地/远端 adapter 选择、网络状态和错误分类；仅允许契约明确的离线缓存行为。        | 离线有/无缓存、远端语法/鉴权错误、超时、旧响应；业务错误不能被缓存 fallback 掩盖。      | partial / 待证（2026-10-05；见第 8 节） |
| C3   | 离线写入与 outbox     | 核查 primary adapter、entity manager 与 sync memo/outbox 对本地写、确认与失败的衔接。 | 写成功响应丢失、重试、删除后创建、进程重开、冲突拒绝；不丢写、不重复落库。              | partial / 待证（2026-10-05；见第 8 节） |
| C4   | 插件 scope 与生命周期 | 审查 engine factory、inject、销毁与 reconnect，多库不能共享错误 memo。                | 同 EntityType 多库、热切换 scope、关闭中远端请求、必需插件缺失；明确拒绝和清理。        | partial / 待证（2026-10-05；见第 8 节） |
| C5   | 公开能力收窄          | 对照现有 API baseline 与 Tree/Graph/主适配器的限制，不为满足评审给出隐式支持。        | 不支持的组合显式报错；本地与真实 HTTP/Supabase 的 production-path 场景均有证据。        | partial / 待证（2026-10-05；见第 8 节） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **12** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/QueryCacheEngine.cache-quality.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/QueryCacheEngine.cache-quality.spec.ts)
- [`src/__tests__/QueryCacheEngine.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/QueryCacheEngine.spec.ts)
- [`src/__tests__/query-cache-engine.scope.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/query-cache-engine.scope.spec.ts)
- [`src/__tests__/query-cache-primary.offline-write.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/query-cache-primary.offline-write.spec.ts)
- [`src/__tests__/query-cache-primary.remote-decode.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/query-cache-primary.remote-decode.spec.ts)
- [`src/__tests__/query-cache-sync-memo.spec.ts`](../../../packages/rxdb-plugin-querycache/src/__tests__/query-cache-sync-memo.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-querycache/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-http`](rxdb-adapter-http.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-querycache --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-querycache:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-querycache --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-querycache:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-querycache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-querycache.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 8. 2026-10-04 续评

恢复编排、共享查询、读写竞争的实际台账。新增意见与 C 项取证/剩余矩阵已写入独立执行记录。两包原基线均实际通过，但新增复验确认缺陷，最终门禁保留红；未将所有 C 项或覆盖率标为通过。

### 2026-10-04 第六批：真实后端联审

原应用/PGlite + HTTP + 文件 SQLite 的实际取证。新增 RV-055，RV-052/053/054 补真实后端证据；scope、缓存收敛和配置适用性已分别写入独立执行记录，不给未测 GUI/CORS/Supabase/发布消费通过结论。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 原 engine/session/primary 与公开 EntityManager.findAll 路径，确认关系条件和 namespace 冷缓存两个接缝。历史 Sync/HTTP 测量不重写。

确认意见：RV-060、RV-061。全批门禁、接缝和中间取证错误见 本轮执行台账；源码指纹、最终计数 与 交付校验。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**203 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-querycache` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.46% / 88% / 99.09% / 97.57%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-querycache/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                            | 不变量、正向与反证                                                                                                                                                                                                   | 已有/本轮测试证据                                                                                      | 必要缺口或核销边界                                                                                                                                     |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | partial / 待证 | query-cache-sync-memo.ts:52–57、101–151；QueryCacheEngine.ts:242–299、658–818；query-cache-primary.ts:162–173               | fingerprint 含 where/SWR/fallback 语义，分页在同步后交本地 repo；会话 memo 不跨 Repository 共享。pending id 在 reconcile 中保留，不能把 where 局部同步当全库完整缓存。                                               | memo/engine/primary 及既有 review 回归入口；当前 203/203 通过。RV-061 为现有联审问题，不重复登记。     | 同过滤多库/scope/branch、分页完整性及 namespace 冷缓存 production-path 仍缺全面对照；RV-061 接缝由其它组供证。                                         |
| C2  | partial / 待证 | QueryCacheEngine.ts:521–562、627–640；query-cache-primary.ts:319–337、379–397                                               | offlineFallback 只吞 network 错误；无缓存会 reject。SWR 已发本地缓存后允许远端错误由 onRemoteError 可见而保持既有结果，此语义不能擅自改成所有错误都 reject。共享 error-handler 集合负责回传。                        | 既有 SWR/离线/共享回调复验；当前 203/203 通过。RV-060 关系条件由联审组负责。                           | 真实鉴权/语法/超时、旧响应、合法关系查询及 RLS 等生产错误分类未全面闭合；RV-060 未解决前不宣称全专题通过。                                             |
| C3  | partial / 待证 | query-cache-primary.ts:199–249、293–336；QueryCacheEngine.ts:116–125、785–818；sync/query-cache-outbox.ts:903–928           | create/update/remove 对称清 memo+递增读代次，旧 pull 的写投影被 generation 拦截；离线写先真实本地成功后报告队列；outbox repair 再查 maxChangeId 后的新写以免覆盖。原 RV-053/055 相关路径按当前源确认，不复刻旧观点。 | review-querycache-harness 驱动的既有读写竞争回归与 outbox 套件；当前 querycache 203、sync 452 均通过。 | 响应丢失后投递幂等、多实体 repair/删除重建、进程重开和真实远端冲突拒绝未全覆盖；代次 guard 不能证明所有写入窗口均原子。                                |
| C4  | partial / 待证 | query-cache-engine.factory.ts:31–59；plugin.ts:27–30；query-cache-sync-memo.ts:101–151；上游 Repository.ts:220–227、566–574 | 工厂按 context 创建独立 session，adapter pair 变化清 memo 并推进纪元；clear 清 timer；远端 invalidation 同时清 memo/引擎代次。destroy 只见 session.clear，不能据此假设所有已订阅 SWR 被取消。                        | 工厂/adapter binding/memo 清理与公开 Repository 既有回归；当前 Node 全套通过。                         | 关闭中远端响应、同实体多库、热切 scope/reconnect 的全部资源所有权与晚响应路径仍缺 production-path 复验；这里只记录缺口，不凭静态缺少取消直接登记缺陷。 |
| C5  | partial / 待证 | query-cache-primary.ts:97–105、319–322、428–451；plugin.ts:27–30；联审 RV-060/061                                           | 读 duck 与每个远端写 verb 分别显式拒绝；正常主仓储和直接 QueryCacheEngine 的实验性边界分开。Tree 禁 QueryCache 的上游 registry 已对照，不增隐式 fallback。                                                           | 能力拒绝/entry-type 套件和当前 203/203 通过；主控 lib typecheck 通过。                                 | 真实 HTTP/Supabase 的不支持组合、认证与发布 consumer 尚缺全矩阵，RV-060/061 不由本组重复立项。                                                         |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
