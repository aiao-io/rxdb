---
kind: review-plan
object: rxdb-devtools
source_root: packages/rxdb-devtools
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-devtools：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

开发态 connector、线协议、事件缓冲、序列化和浏览器/原生 provider。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-devtools`](../../../packages/rxdb-devtools)                  |
| Nx 项目             | `rxdb-devtools`                                                              |
| npm 名称            | `@aiao/rxdb-devtools`                                                        |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 114 个；测试/共享套件入口 47 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/connector.ts`](../../../packages/rxdb-devtools/src/connector.ts)
- [`src/connector-runtime.ts`](../../../packages/rxdb-devtools/src/connector-runtime.ts)
- [`src/connector-mask.ts`](../../../packages/rxdb-devtools/src/connector-mask.ts)
- [`src/serializer.ts`](../../../packages/rxdb-devtools/src/serializer.ts)
- [`src/provider/limits.ts`](../../../packages/rxdb-devtools/src/provider/limits.ts)
- [`src/provider/logical-path.ts`](../../../packages/rxdb-devtools/src/provider/logical-path.ts)
- [`src/native/native-files-provider.ts`](../../../packages/rxdb-devtools/src/native/native-files-provider.ts)
- [`README.md`](../../../packages/rxdb-devtools/README.md)
- [`package.json`](../../../packages/rxdb-devtools/package.json)
- [`project.json`](../../../packages/rxdb-devtools/project.json)
- [`src/index.ts`](../../../packages/rxdb-devtools/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-devtools/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-devtools/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`、`./testing-providers`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-devtools.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb: *`、`vitest: >=4.0.0`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                               | 状态                                                  |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| C1   | 协议与信任边界         | 从 connector 到 transport/wire 核查版本、session、source、能力协商和消息严格校验。          | 伪造消息、旧 session、错版本、未知 provider、超大 payload；拒绝时无 DB/file 副作用。  | 部分核销：已读身份/授权顺序（详本轮逐C表）            |
| C2   | 数据脱敏与序列化       | 审查 mask、entity info、snapshot、错误与日志，不让调试便利绕过敏感字段保护。                | 加密字段、循环值、BigInt/binary、巨大对象、错误 cause；输出有界且不带敏感明文。       | 部分核销：当前环引用修复/序列化面（详本轮逐C表）      |
| C3   | 缓冲、序号与反压       | 核查 buffer/sequence、慢消费者、断开重连与订阅一次语义。                                    | 突发事件、序号缺口/重复、重连、订阅者中断；有限内存，能识别丢失而非静默假完整。       | 部分核销：有限 buffer/一次订阅结构（详本轮逐C表）     |
| C4   | provider 权限与文件    | 逐项对照 browser/native/settings provider 的 descriptor、只读限制、logical path 与 limits。 | 路径穿越、超配额上传、危险设置写、缺能力、批操作部分失败；按公开拒绝语义处理。        | 部分核销：本地权限与路径子项（详本轮逐C表）           |
| C5   | 环境与生产隔离         | 对照 extension/Electron/Tauri 接线和开发态 gating，核查运行时包是否增加生产攻击面。         | 生产 build、未连接调试客户端、窗口关闭；特权接口不可被普通页面调用。                  | 部分核销：初始化 gate / extension 接线（详本轮逐C表） |
| C6   | 生命周期与 conformance | 核查 reconnect、provider 注册/注销、testing driver 与跨宿主 relay conformance。             | 数据库关闭重连、窗口导航/session rotation、host 退出；无孤儿 port/listener/文件句柄。 | 部分核销：connector detach 路径（详本轮逐C表）        |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **47** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/native/native-files-provider.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/native/native-files-provider.spec.ts)
- [`src/__tests__/connector-providers.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/connector-providers.spec.ts)
- [`src/__tests__/native/settings-provider.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/native/settings-provider.spec.ts)
- [`src/__tests__/provider/logical-path.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/provider/logical-path.spec.ts)
- [`src/__tests__/browser/opfs-files-provider.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/browser/opfs-files-provider.spec.ts)
- [`src/__tests__/browser/settings-provider.spec.ts`](../../../packages/rxdb-devtools/src/__tests__/browser/settings-provider.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-devtools/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-encrypted`](rxdb-adapter-encrypted.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-devtools-extension`](../apps/rxdb-devtools-extension.md)、[`rxdb-devtools-panel`（集成边界）](../../../modules/rxdb-devtools-panel)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`rxdb-devtools-extension`](../apps/rxdb-devtools-extension.md)、[`rxdb-devtools-extension-e2e`](../apps/rxdb-devtools-extension-e2e.md)。

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
NX_DAEMON=false pnpm nx show project rxdb-devtools --json
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-devtools --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-devtools
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-devtools.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：树查询与 DevTools 第三批深审

[本对象实际意见与源码/运行证据](../results/packages/rxdb-devtools.md) · 本批台账。未核销项不由生成器、mock 或其它后端门禁代证。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`rxdb-devtools`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：12/114 个 tracked 有实际展示行，10 个全文已展示；未读 102 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                  | 本轮结论                               | 实际生产路径 / 符号行                                                                                                                                                                                                                                                                                                                                                                                                                                     | 事件时序 / 不变量                                                                                                                         | 测试判别力 / 已用证据                                                                                         | 必要未验与补证动作                                                                                                                      |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C1 协议与信任边界         | 部分核销：已读身份/授权顺序            | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/v2/endpoint.ts:249-377 receive / route / malformed / onRequest`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/v2/authorization.ts:172-182 authorizeOperation`                                                                                                                                                                                                                | negotiation 所有权帧先排除；session open+身份 → capability → 本地 descriptor → mutationPolicy → 登记请求 → provider；不会从对端握手提权。 | 未运行/未读取当轮完整 conformance 报告；源码顺序已核查，不能据此宣称所有伪造/旧 session 都动态通过。          | 需要本轮 endpoint/authorization/session/wire 的拒绝与零 provider 调用断言；v1 全路径、transfer 路由全文仍未审。                         |
| C2 数据脱敏与序列化       | 部分核销：当前环引用修复/序列化面      | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/connector-mask.ts:89-129 WeakMap identity before recursion`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/serializer.ts:61-218 maskEncryptedFields / safeSerialize / Error / Map / Set`                                                                                                                                                                                      | 先按 namespace/metadata mask；环对象先登记输出，serializer 按当前递归路径判环；BigInt/binary 版本信封；Error/cause 进入同路径。           | 确认现代码已含 RV-047 环引用修复；未读本轮完整 serializer/边界测试结果，不复制旧红。                          | metadata 缺省不保证字段 mask；深对象/超大事件、错误 message/stack 敏感值、snapshot 有界需补真实 provider 与主控测试；不宣布全脱敏通过。 |
| C3 缓冲、序号与反压       | 部分核销：有限 buffer/一次订阅结构     | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/buffer.ts:36-60 EventBuffer`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/sequence.ts:6-20 SequenceGenerator`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/connector-subscribe-once.ts:26-99 subscribeOnce`                                                                                                                                                | 正整数容量；满 FIFO 丢最旧；flush 清空；首 next/error/timeout 结算并清 timer；同步 next 用后置退订守卫。                                  | 已读实现；当轮突发、gap detection、慢消费者、sequence 重置/overflow 断言未补，不将 max count 说成 max bytes。 | 字节级反压、gap 的可见诊断、重连序列边界需验证；一个巨大事件仍不同于无限事件数量。                                                      |
| C4 provider 权限与文件    | 部分核销：本地权限与路径子项           | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/v2/authorization.ts:70-93,172-182 操作目录/三层授权`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/provider/logical-path.ts:29-77 段校验/根拒绝`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/provider/limits.ts:22-56 三方 min limit`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/provider/read-only-settings.ts:30-38 只读零 host 动作` | 拒绝 .. 与反斜杠；操作根需末段；传输限额各方合法再取 min；settings export 恒拒绝，不先读 host。                                           | 不靠 UI disabled；实际 browser/native invoke、upload/snapshot/取消全文与本轮测试尚未核销。                    | 必要：路径穿越零物理访问、大小/配额/取消时句柄关闭、失败批处理结果与 provider descriptor 一致。                                         |
| C5 环境与生产隔离         | 部分核销：初始化 gate / extension 接线 | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/connector.ts:227-245,288-297 enabled/browser/opaque-origin gate`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/main.ts:26-45 宿主 token wiring`                                                                                                                                                                                                               | enabled=false/非 window 先返回；opaque origin 要显式 opt-in；面板 token 换宿主，不将 Chrome 权限 API 拖到共享 provider。                  | 实际 main 三端 demo 明确 init connector；本轮不跑生产 build/打包 Electron/Tauri，未宣称攻击面全闭合。         | 普通同 origin 脚本是否可伪造 v2 命令须按协议威胁模型验证；不能把 source/session 当密码学身份。生产消费者 gating/隔离未完成。            |
| C6 生命周期与 conformance | 部分核销：connector detach 路径        | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/connector.ts:259-280 disconnect`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/v2/endpoint.ts:267-269,402-416 dispose / settle before response`                                                                                                                                                                                                                              | 告别先发再关 port；退订 RxDB/listeners/待查询；dispose endpoint + providers；清 helper/buffer/sequence；晚结果必须 settle 成功才回帧。    | Chrome relay conformance 源入口未全文审；需要当轮真实 hosts + provider unregister/close 报告。                | 无完整对象候选：114 tracked 中只读指定路径；registry/openSession/transfer 实现仍需逐段审，不以一处 dispose 推全资源安全。               |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-devtools.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/rxdb-devtools.md`。
