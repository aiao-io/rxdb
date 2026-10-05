---
kind: review-plan
object: rxdb-adapter-encrypted
source_root: packages/rxdb-adapter-encrypted
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-encrypted：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

AES-GCM 字段加密 wrapper、versioned envelope、keyring 和查询能力约束。

| 项目                | 基线事实                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| 对象类型            | 包                                                                            |
| 源码范围            | [`packages/rxdb-adapter-encrypted`](../../../packages/rxdb-adapter-encrypted) |
| Nx 项目             | `rxdb-adapter-encrypted`                                                      |
| npm 名称            | `@aiao/rxdb-adapter-encrypted`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）  |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                             |
| 受控文件盘点        | 37 个；测试/共享套件入口 14 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                     |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/index.ts`](../../../packages/rxdb-adapter-encrypted/src/index.ts)
- [`src/encrypt-patch.ts`](../../../packages/rxdb-adapter-encrypted/src/encrypt-patch.ts)
- [`src/crypto.ts`](../../../packages/rxdb-adapter-encrypted/src/crypto.ts)
- [`src/envelope.ts`](../../../packages/rxdb-adapter-encrypted/src/envelope.ts)
- [`src/keyring.ts`](../../../packages/rxdb-adapter-encrypted/src/keyring.ts)
- [`src/keyring-storage.ts`](../../../packages/rxdb-adapter-encrypted/src/keyring-storage.ts)
- [`src/validate-encrypted-query.ts`](../../../packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts)
- [`README.md`](../../../packages/rxdb-adapter-encrypted/README.md)
- [`package.json`](../../../packages/rxdb-adapter-encrypted/package.json)
- [`project.json`](../../../packages/rxdb-adapter-encrypted/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-encrypted/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-encrypted/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-encrypted.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: workspace:*`、`rxjs: ^7.8.0`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                                         | 最低复验场景 / 证据要求                                                                             | 状态                                   |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| C1   | 威胁模型与落盘范围 | 列出 entity/change log/working tree/commit/backup 的敏感数据路径，明确加密不等于历史数据可删除。 | 扫描实际后端持久化字节、日志与错误；受保护字段不以明文出现在声明覆盖的路径。                        | 部分执行；敏感路径边界未穷举           |
| C2   | AES-GCM 与 AAD     | 审查 IV、AAD/version、实体/字段/主键绑定和解密失败；不自行实现弱随机或验签 fallback。            | 改 ciphertext、nonce、AAD、错实体/字段、重放 envelope；明确拒绝且不泄露原始敏感值。                 | 部分执行；真实 WebCrypto/AAD 基线      |
| C3   | keyring 生命周期   | 检查持久化、载入、缺键、切换密钥与并发初始化的真实 API；不从测试替身推断安全保证。               | 首次开库并发、keyring 损坏、未知版本、缺安全随机源、关闭重连；失败不能覆盖已有密钥。                | 部分执行；确认 RV-058                  |
| C4   | 序列化与 patch     | 核查部分更新、null/undefined、BigInt/binary/JSON 和关系字段；wrapper 不改变实体原契约。          | 只更新非加密字段、空字段、特殊数值、混合批写、失败回滚；数据可往返且不重复加密。                    | 部分执行；序列化/patch 与实际 row 对照 |
| C5   | 查询能力拒绝       | 核查 metadata-validation 与 encrypted-query validation，列明排序/范围/搜索/关系的允许边界。      | 对加密字段请求不支持的过滤/排序、混合 RuleGroup；在预期位置拒绝，不返回误导空结果。                 | 部分执行；metadata/查询拒绝            |
| C6   | 跨后端组合         | 逐后端对照 sqlite-core、PGlite、Electron、Tauri、浏览器、小程序实际测试调用点。                  | 真实 adapter CRUD/change-log/tamper/backup conformance；不能因为 wrapper 单测绿就宣称所有后端安全。 | 部分执行；Electron/PGlite 实测         |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **14** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/crypto.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/crypto.spec.ts)
- [`src/__tests__/encrypt-patch.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/encrypt-patch.spec.ts)
- [`src/__tests__/envelope.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/envelope.spec.ts)
- [`src/__tests__/keyring-aad-v2.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/keyring-aad-v2.spec.ts)
- [`src/__tests__/keyring-verifier.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/keyring-verifier.spec.ts)
- [`src/__tests__/keyring.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/keyring.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-encrypted/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-devtools`](rxdb-devtools.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：需要 WebCrypto/安全随机源及真实后端；先用本地隔离数据库，禁止使用用户真实密钥或数据作为探针。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-encrypted --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-encrypted:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-encrypted --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-encrypted:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-encrypted
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-encrypted.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

### 2026-10-05：加密初始化取消

[实际 Keyring /文件 SQLite /Chromium-PGlite 联审](../execution-2026-10-05-encrypted.md)：RV-058 有三个测量面的失败复验及正常已建凭据保护对照。只登记一个共同根因，不把 memory/管道接缝包装为所有后端安全，完整 C 与对象仍未完成。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-encrypted.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/6，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 279 passed (279)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:306）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：未新增确认问题；不是整对象通过。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                                                | 当前结论/可证反证                                                                                                                                                                                  | 原 C 核销 | 剩余必要验证                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:409–456,646–724`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:23–44,51–72`                                                                                                                                                   | 实体声明列与 change patch 有明确 envelope 边界；NULL 旁路、非字符串实际 row 不可冒充信封。不是整库加密，不能把 adapter plaintext 内存正常行为当落盘漏密。                                          | 未核销    | entity/change/working-tree/commit/backup 真实持久化字节与错误/日志扫描尚未穷举；未声明覆盖范围不能外推。                             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/crypto.ts:82–93,99–145`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/envelope.ts:126–176,190–206`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/keyring.ts:238–327`                                                                         | 随机 IV、AES-GCM AAD 与 typed PK/namespace/table/column/kid绑定；解密鉴权失败 typed error，lock在途拒绝并清零。v1 需显式 migration，v2失败不重试v1。没有单元格版本计数，不宣称防同身份旧密文回放。 | 未核销    | tamper nonce/AAD/错实体字段/重放完整威胁边界与实际后端回归；279单测绿不是全部存储路径证明。                                          |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/keyring.ts:217–231,407–424,509–575`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:35–37,65–78`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/__tests__/review-aborted-initial-unlock.spec.ts:48–99` | RV-058已重新追当前源：545提交前同步epoch检查，558发布前第二屏障；新回归期待取消后无singleton/A取消后B正常。与原旧红结论相反，不能复报。INSERT OR FAIL 的冲突与其他I/O错误区分。                    | 未核销    | 所有并发首次开库、损坏/未知KDF、随机源缺失、关闭重连/真实存储冲突全边界；写入已在途再lock只保证不发布内存key，不承诺撤销不可逆提交。 |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/serialize.ts:29–69`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:29–43,56–70`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:646–724`                                                                | BigInt要求signed64、binary复制，结构化值JSON；patch只遍历出现的键，NULL不封装，读实际row任一失败整行作废。helper的非字符串patch passthrough不能用于推断row可绕过解密。                             | 未核销    | 部分更新/undefined/特殊数值/关系字段/混合批写/失败回滚与原实体契约完整比较；序列化全函数与后端全部消费点未读完。                     |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts:17–36`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts:21–39`                                                                                                                                                           | where/order/group/projection进入共享 metadata 校验；关系resolver明确传入，SQLite group/projection未实现显式拒绝，且加密错误优先。                                                                  | 未核销    | metadata-validation内部347行所有关系/别名/混合RuleGroup/范围/排序/搜索拒绝分支尚未穷举；不能因入口delegate存在即核销完整C。          |
| C6  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-change-log.spec.ts:1–9`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`       | 已对照真实 adapter suite 接线，WA 日志 suite 用 persistent factory + file reader，而非仅 wrapper mock。当前279 pass仅本包单测；其它对象的默认档位/skip不能折算所有后端安全。                       | 未核销    | SQLite/PGlite/Electron/Tauri/browser/miniprogram 各真实 CRUD/log/tamper/backup 联审及当前持久化扫描；适用三框架用户链路另证。        |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。
