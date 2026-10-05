---
kind: review-plan
object: rxdb-plugin-search-react
source_root: packages/rxdb-plugin-search-react
created: 2026-10-03
updated: 2026-10-05
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
round2_read_head: 465f9078e9844af2cbef9936c7321a5576333a01
execution: in-progress
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-search-react：有界收尾计划

**2026-10-05 第二轮：14/14 受控文件已完整阅读；完整 C 1/5（C1）；C2–C5 partial；完整对象候选否，发布未就绪。** 不把交付文档等同于原场景全部通过。

## 1. 唯一范围与版本

- 工作区：`/Users/jimmy/Documents/aiao/rxdb`；唯一对象：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-react`。
- 用户任务号 R2-05，scope/instructions 为 R2-06：按指定 object 和 writeScope 执行，不修改 dispatch/scope，也不写另一任务。
- scope 的 14 个原受控文件/摘要全部相符；新增且只新增自己的 `src/__tests__/review-round2-lifecycle.spec.ts`，未改实现、原 tests、README、依赖或其他对象。
- 原计划 main 基线为 `2e820521187cbfcd1fe76fb705659fea0a548f0e`；历史实测为 `44de1138b4d396fc45d6e76ab60476c40fef2223`；本轮读取 HEAD 为 `465f9078e9844af2cbef9936c7321a5576333a01`。共享工作树持续变化，不称第一轮全门禁是新 HEAD 测量。
- 全文件阅读区间、关注点、源摘要、同族只读边界与忽略的 dist 生成来源见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/file-inspection.json`。sha 核对不是阅读证据。

## 2. 数据与生命周期核查边界

`SearchSourceLike.search(string, SearchOptions?) → SearchHandle` 是真实输入结构；`UseSearchReturn` 是 React value + 稳定命令，不凭空添加实体泛型。query 由用户拥有，results/state/error/hasMore 由 core 拥有。

- `use-search.ts:54–65`：options 字段快照/collections 复制、初次 initialQuery 与重建判据分开；presence 与 core comparator 的差异留最小候选。
- `use-search.ts:106–124`：仅 commit effect 创建 handle；订阅四输出；cleanup 先 unsubscribe，再 destroy，再清当前 ref。
- `use-search.ts:126–143`：命令路由最新 handle，queryRef 播种，返回值 memo。
- `src/index.ts:14–17` / `package.json:23–51`：共享类型、runtime error class、真实 root exports/peers；React peer 当前为 `^19.3.0`，不是旧计划 `^19.2.8`。
- core cancel 等待者缺陷 **RV-062 只引用**；不重登记、不改 core、不把 active 请求取消的期望绿说成该缺陷修好。

## 3. 原 C：动作与最低场景原样保留

| 原 C | 核查动作                    | 原最低复验场景 / 证据要求                                                                                            | 当前状态                                                                                              |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| C1   | SearchHandle 映射           | 逐项核对 results/state/error/hasMore、setQuery/loadMore/clear 到核心 handle，保留空态与错误差异。                    | 空词、无结果、查询失败、清空、末页；框架状态不能吞掉核心错误。                                        | 完整 C；历史证据限定复用 |
| C2   | 快速输入与 options identity | 核查 debounce 的归属、语义相等选项、scope/branch 切换和异步过期结果。                                                | A→B 快速输入、相同值新对象、换库/branch、并发翻页；不重复创建 handle 或串结果。                       | partial；见结果/剩余动作 |
| C3   | 三端类型与依赖闭合          | 对照三端框架 idiom、公开 consumer 与 README 使用；明确必需搜索插件和不支持的 backend。                               | 缺 plugin、typed consumer、同 fixtures parity、卸载；必须依赖能通过 inject 闭合。                     | partial；见结果/剩余动作 |
| C4   | React 生命周期与竞态        | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | partial；见结果/剩余动作 |
| C5   | React 类型与 render 边界    | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | partial；见结果/剩余动作 |

共同底线仍为 TS strict、禁止 any/隐藏警告、TSDoc 与公开类型一致、简洁/单一职责，不加 fallback 掩盖错误。完整分类详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/c-evidence.json`，不因包小而删 branch/取消/错误/多 root/typed consumer。

## 4. 已完成证据与最小追加探针

- 已读 14 个原文件：2 个源码、4 个测试文件、README、LICENSE、manifest/Nx/三个 TS 配置/Vite；无遗漏、无只导航代全读。
- 第一轮 unit：3 files / 24 tests 通过；真实 C1 晚探针三端各 1 test 通过。React 当前探针只有 import 排序/格式化变化，import 集合和非 import token 等价、core 80 个已记录输入未变，限定复用证明见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/historical-reuse.json`。
- 历史四指标（statements/branches/functions/lines）：96.66% / 81.81% / 100% / 100%，各 ≥80%；仅 V8 的 wrapper 测量面，不含本轮新探针，不证明真实 browser/backend/branch。
- 新探针 13 个用例只补边界：真实 core 防抖/串行 A→B、换 source/scope 迟到结果或错误、options 返回 identity/presence、并发分页、clear/unmount 取消已执行分页、两个独立 StrictMode root、SSR 无 render IO、真实 RxDB 缺插件/未安装的错误边界。**本任务未运行。**
- task 目录 `consumer-valid.mts` / `consumer-invalid.mts` 用真实公开类型和包名 imports，无 paths/any/ts-expect-error；所有 hook 类型调用在未执行函数体内，runtime 不顶层调用 hook。

## 5. 主控验证请求（本任务不跑重任务）

以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/resolved-project.json` 为 resolved targets：lint=`eslint .`，test=`vitest`（happy-dom/V8；依赖 `^build`），typecheck=`tsc --build --emitDeclarationOnly`（依赖 build/`^typecheck`）；不把局部 project.json 当完整配置。配置未单独提供本包 browser target。

| 请求                            | project / target                     | 必要面                                                                                          |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| search-react-r2-lint            | rxdb-plugin-search-react / lint      | 新 probe 零警告，不关闭 Hooks lint                                                              |
| search-react-r2-types           | rxdb-plugin-search-react / typecheck | 新 probe strict 类型；记录 build/依赖和 spec 实际 include                                       |
| search-react-r2-hooks           | rxdb-plugin-search-react / test      | 串行本包 unit、新 13 例、原始失败/JUnit/四指标/输入指纹                                         |
| search-react-r2-packed-consumer | 主控 evidence probe，不是 Nx target  | 已测正负 strict 与 root import；保留裸 strict 失败及显式 Node + @types/ms 对照                  |
| search-react-r2-branch-consumer | 主控 runtime surface，不是 Nx target | 一个已有 supported backend 的真实 RxDB branch checkout + 在途分页；不要用换 source 的控制器代替 |

必要未验必须补实际日志或由主控按理由裁定分流，不能标成不适用或因为已分流而变绿。确切 args/reason/criticalForC 已提前写入 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/validation-requests.json`。不等无关后端，不自行 build/test/coverage/e2e/server/容器，不 add/commit/reset/stash/unstage。

主控已回传实际 tar 在显式 Node + @types/ms 环境对照中 **strict valid exit0 / invalid exit2且只有7处消费类型诊断 / root import exit0**。strict=true、skipLibCheck=false、无 workspace aliases/links，fixture摘要一致。原裸 valid2/invalid2 的 utils NodeJS/ms声明失败保存在 bare日志，未改 source mapping。typed子面已完成；不是浏览器/挂载hook完整用户链路通过。

## 6. 原完成条件逐条判定

- [x] **D1** 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。 — complete。
- [x] **D2** 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。 — 通过（分类齐全，不代表全部 C 完整）。
- [ ] **D3** 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。 — partial。
- [ ] **D4** 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。 — partial。
- [ ] **D5** 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。 — partial。
- [ ] **D6** 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。 — partial。
- [ ] **D7** 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。 — partial。

评审完成与修复/发布就绪分开。已确认缺陷可分流，但必要场景缺实测不能核销完整对象。对象结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-search-react.md`；机器 closure：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/closure.json`。

## 7. 历史与当前状态分离

2026-10-03 入口批及 2026-10-05 第一轮 frameworks 的“13 文件、4 文件正文/9 未读、C1 探针未跑”是历史状态，不能沿用为本轮事实：本轮 scope 为14文件全部正文已读，C1 的主控晚测日志已存在。本轮没有删除历史日志/旧 RV；也没有把它们改造成新 HEAD 的执行。

## 最终冻结与交接

2026-10-05 主控已开启含本 newSpec 的 R2 ten current unit+coverage/lint；本任务测试冻结，不再编辑，不等待 all73。C1 完整，C2–C5 仍按原场景保留未验；typed 正负对照已经完成，不再作为待跑请求。新门禁最终结果、新spec strict 类型与同一真实 RxDB branch checkout 的必要测量面归本对象 task owner，最终裁定/分流归主控，不虚标完成。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

当轮确认意见：[RV-076](../RV-076-round2-react-options-presence.md)，公开输入边界与独立正确peer环境复验，不等于所有消费情形失败。
