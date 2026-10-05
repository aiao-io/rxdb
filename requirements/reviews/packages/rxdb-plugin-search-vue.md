---
kind: review-plan
object: rxdb-plugin-search-vue
source_root: packages/rxdb-plugin-search-vue
created: 2026-10-03
updated: 2026-10-05
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
read_head: 465f9078e9844af2cbef9936c7321a5576333a01
execution: in-progress
---

# rxdb-plugin-search-vue：第二轮有界收尾计划

**✅值得做：收尾既有 5 个 C，不扩实现。当前 15/15 原 scope 文件全文阅读完成；完整 C 仍为 0/5，主控验证尚未全部落地。** 评审完成与修复/发布就绪分开，不能用旧门禁绿或新测试文件存在核销。

## 1. 唯一范围、编号与基线

- 工作区：`/Users/jimmy/Documents/aiao/rxdb`。
- 用户追加任务 **R2-06**；分配的 `scope.json` 标记 **R2-07**。以用户指定唯一对象与 15 文件为准，保留分配原文，不改 scope 或总调度。
- 包：`@aiao/rxdb-plugin-search-vue@0.0.26`；Nx 对象：`rxdb-plugin-search-vue`。
- 计划原基线：2026-10-03 `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`；第一轮专项测量基线：2026-10-05 `44de1138b4d396fc45d6e76ab60476c40fef2223`。
- 本轮阅读 HEAD：`465f9078e9844af2cbef9936c7321a5576333a01`。持续改动环境下以内容指纹绑定具体测量，不宣称所有历史目标属于一个稳定新 HEAD。
- 原 scope **15 个文件 / 5 个 spec**：LICENSE、README、manifest、project、2 个生产 TS、5 个 spec、3 个 tsconfig、vite 配置，已逐段全文阅读，无导航外排除项。
- 只新增获准的 `src/__tests__/review-round2-component-lifecycle.spec.ts`（6 个 case），不改实现、原 tests、README、依赖、旧 RV、台账或其它包。该新增文件不回写原 15 文件 scope。

本轮机器阅读证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/file-inspection.json`。SHA 是已读版本的绑定，不是阅读凭证。

## 2. 已读公共边界与生成来源

生产入口：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/index.ts:13–16` 与 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-vue/src/use-search.ts:1–234`。

- 根 `exports` 的 `types/import/default` 分别指向 `dist/index.d.ts` / `dist/index.js`；只另暴露 `./package.json`。ESM、`sideEffects=false`、测试与 tsbuildinfo 排除均已核对。
- 必需 peers 为 `@aiao/rxdb`、`@aiao/rxdb-plugin-search`、`rxjs ^7.8.2`、`vue ^3.5.43`。真实使用前先装插件、`await connect()`，按连接纪元读取 `searchPlugin.ready`。
- 三端实际公开入口均是 `useSearch`；均值导出 `SearchExecutionError`、透传 `SearchHandle/SearchOptions/SearchResult/SearchState/SearchSourceLike`。React 的 `setQuery`、Angular 的 WritableSignal、Vue 的 writable Ref 是框架 idiom；不强行改容器。
- 本包无受控生成文件；Vite 的 Vue/dts 插件、`entryRoot/tsconfigPath`、ES lib 入口与 externals 是生成来源。已读取历史真实 tar 的生产源/声明/JS/map 并核对。旧 tar 的 source/JS 与阅读版本一致，当前 ignored d.ts 仅头两行 type import 打印不同；不冒充同一次生成或已做确定性重建。
- 原 README 的 Angular 导航旧称 `injectSearch`，本轮按实际根导出对照；不修改 README，不扩成新的业务任务。

生成/发布静态证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/generated-artifact-inspection.json`。

## 3. 原 C 任务与最低场景（不删、不降格）

| 原 C | 专项 | 原核查动作 | 原最低复验场景 / 证据要求 | 当前结论与剩余动作 |
| --- | --- | --- | --- | --- |
| C1 | SearchHandle 映射 | 逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。 | 空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。 | partial。映射源码与历史 suite 已证；当前 93 行 real-handle spec 与旧运行 fingerprint 不同，主控补跑完整序列。 |
| C2 | 快速输入与 options identity | 核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。 | A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。 | partial。快照、语义去重、旧流释放已读/局部已测；新增真实在途/source/分页探针待跑。同一真实 RxDB branch 与三端同 fixture 仍需具体证据。 |
| C3 | 三端类型与依赖闭合 | 对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。 | 缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。 | partial。API/core inject 安装归属和真实根 import 已证；strict .mts 正负在显式 Node/@types/ms 环境已闭合（裸失败保留）；前置/卸载新 probe、SFC 与当前 parity 待补。 |
| C4 | Vue 生命周期与响应式来源 | 核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。 | 替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。 | partial。scope guard、同步 watch、dispose 顺序与历史 effectScope/SSR 已证；新真实组件多实例/卸载/迟到/四订阅场景待主控执行。 |
| C5 | Vue 类型与 SFC 消费 | 核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。 | vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。 | partial。签名/readonly 与生成声明已读；strict .mts 正负对照已通过，裸依赖失败保留；SFC 正负模板与输出 identity 新 probe 待主控结果。 |

`useSearch` 当前公开 API **不是泛型实体 composable**；本包也不导出 SFC props/emits。按真实 API 检查固定 SearchResult/ref 类型，把模板/props/emits 要求落实到 consumer，不凭计划词汇发明 API，也不删掉场景说不适用。

原 C 证据/生产锚点/未验证测量面：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/c-evidence.json`。

## 4. 主控验证请求与消费者协议

本代理不执行 build/test/coverage/lint/typecheck/e2e/server/容器/安装/consumer 编译。只读获取 resolved 配置；用户指定主控离线真实 tar 安装、严格声明编译与 runtime root import。

| 请求 | 测量面 | 必须保留 |
| --- | --- | --- |
| search-vue-r2-unit | 本包 5 个既有 spec + 6 case 新 probe | 当前内容指纹、串行命令/退出码、testcase/skip/JUnit、V8 四指标；依赖 build 链由主控控制，不扩 affected。 |
| search-vue-r2-sfc-consumer | 实际 tar 的 .mts 正负与 SFC 正负消费者、runtime root import | 无 workspace paths/源 symlink，strict=true，skipLibCheck 状态，具体诊断命中；正负分开，不能用依赖错误代替负例成功。 |
| search-vue-r2-zero-warning | 当前包 lint | max-warnings=0 与已执行内容指纹；旧绿不覆盖新增文件。 |
| search-vue-r2-types | 当前包 workspace typecheck | resolved 为 vue-tsc --build --emitDeclarationOnly，dependsOn build/^typecheck；本地 paths/skipLibCheck 不冒充独立声明/模板验证。 |
| search-vue-r2-same-fixture-branch | 原 C2/C3 同 fixture 与真实 branch/分页 | 新 probe 的 source identity 替换不等价于真实同 DB branch；最小链路证据或由主控明确裁定必要未验证分流。 |

请求已直接落盘：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/validation-requests.json`。

用户指定 `.mts` 使用包名 imports、真实 source/return/ref API，无 `paths`、`any` 或 `ts-expect-error`。另外正负 `.vue` 保留原 C5 的模板/props/emits 面。详细预期在同目录 `consumer-contract.json`。仅 root import 成功不等于调用 createConsumer、组件挂载或实际数据库搜索已运行。

## 5. 已有测量与本轮实测边界

- 2026-10-05 09:06:02 历史本包 **4 files / 28 tests passed**，无 skip；V8 statements/branches/functions/lines 为 **98.57% / 96.42% / 100% / 100%**，四项均 ≥80%。本包源/配置与 core 28 个生产输入未漂移；仅测当前原 scope 的 12 个输入，不含当前 real-handle/本轮新 probe。本包该历史目录没有独立 JUnit，不补造。
- 历史零警告 ESLint 与 workspace Vue typecheck 通过，但不覆盖新增 probe，也不是独立 strict d.ts/SFC 消费。整批 coverage exit=1 来自别的对象；不误写为本包失败。
- 09:34:17 Vue real-core probe 1 passed；Angular/React 同名 probe 亦有通过日志，但 Vue 文件摘要 `f30c85…` 已变为当前 `1be30d…`，不核销新版本。
- **本轮主控 10:58:19 实际 tar 根 import exit=0，真实导出 `SearchExecutionError/useSearch`。** strict=true、skipLibCheck=false、无 workspace alias/link 的正例 tsc exit=2，错误在上游 utils 的 NodeJS/ms 声明；负例命中 14 条预期 fixture 诊断，同时混有同两条依赖错误，不能称干净通过。此次 .mts 是 tsc，不冒称 vue-tsc SFC 模板已测。
- 新 tar SHA 与历史 tar 不同，分别登记。新 consumer 来源/诊断/当前 fixture SHA 绑定，不把早期安装失败当最后状态；不改上游、不补 stub 或打开 skipLibCheck 改绿。

完整命令、环境、cache/输入漂移与日志映射：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/validation-observations.json`。

## 6. 原全对象完成条件逐条保留

- [x] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。（15/15 全文；生成来源另核。）
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。（5 项明确 partial，不代表原最低场景全部核销。）
- [x] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。（历史实测与新探针分开；新探针未测不给动态结论。）
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。（已登记历史/consumer，当前新 unit/quality 门禁待补。）
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。（已静态对照；typed/SFC/branch/parity 必要动态缺口未闭合。）
- [x] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。（无新增确认缺陷，RV-062 只引用；上游 strict 声明失败交主控归因。）
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。（阶段 🟡；没有给全对象最终评级/完成候选。）

## 7. 结论与交付

**静态阅读及有界交付完成；完整评审仍 partial，完整 C 0/5，fullObjectCandidate=false，releaseReady=false。** RV-062 的 core 取消等待者缺陷只引用原登记，不改旧 RV、不重复登记，也不以已分流代替必要验证。

对象实际结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-search-vue.md`。
对象 closure：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-vue/closure.json`。

## 最终交接追加（2026-10-05T11:09:34.173740+08:00）

主控最新直接报告：显式 **Node typings + @types/ms** 后，同一独立实际 tar consumer 的 **strict valid exit=0 / invalid 仅消费类型拒绝 / root import exit=0**。前述裸环境上游 NodeJS/ms 两项失败完整保留，对照环境成功不抹去裸声明闭合风险。本次直接报告未给正负 SFC 模板结果。

主控已启动 current newSpec 的 unit+coverage/lint；本代理不等待、不追加探针、不扩读，也不预判绿。**本代理阅读与文件交付完毕，剩余验证归主控追加。** 原完整 C/全对象候选仍按缺测场景保留 partial，不为释放名额改口。
