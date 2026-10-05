---
kind: review-execution
object: rxdb-plugin-tree-vue
created: 2026-10-03
review_date: 2026-10-05
baseline: 76a3848e2086f4617b80f7b1a1b896ef76e5719c
execution: partial
task: R2-04
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-plugin-tree-vue：R2-04 实际评审记录

**当前分轴（2026-10-05口径审计）：** 原范围全文审阅与逐C意见交付已完成；完整专题证据仍部分闭合，修复/发布未宣称完成。旧 `execution` 不再单独充当总代码评审完成度；见 [四轴进度审计](../../progress-2026-10-05.md)。

**本地有界交付已完成：原 13 个受控文件全部正文阅读，原 C1–C5 每项已给结论/锚点/补证动作。原完整 C 0/5，局部执行 5/5，不能宣布全对象完成或发布就绪。** 当前评级仅 🟡（证据缺口），没有新增本包确认缺陷；不把未测 tree core 真实 branch 虚标通过。

## 1. 范围与历史区分

- 唯一对象 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue`，scope 指定原受控文件 13 个；本次每个全文读取，sha只是复核、不替代阅读。第一轮“5正文/8未读”已关闭。
- 2026-10-03 `3b3e449e10c6a587056a2ae947eddfd161834f97` 的入口门禁为历史记录，不借其给新文件打勾；2026-10-05 第一轮 `44de1138b4d396fc45d6e76ab60476c40fef2223` 的 partial C 缺口仍逐项保留。
- 主控当前测量 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c`；11 个测试/代码/配置输入与其 build/unit/lint SHA manifest 匹配，README/LICENSE不在该manifest但与本任务scope一致。无源码生成受控文件；dist生成文件追溯 vite/dts，当前输出与真实tar字节一致，**未双构建验证确定性**。
- 本任务唯一主动 Nx 命令是只读 `NX_DAEMON=false pnpm nx show project rxdb-plugin-tree-vue --json`；另做 TypeScript AST语法检查（不是typecheck）。没有跑 build/test/coverage/e2e/server/容器，没有派agent，没有改实现/旧tests/依赖/全局index。

## 2. 已读取的主控真实测量

| 测量        | 本包结论及精确边界                                                                                                                                  | 来源                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| build       | 当前原输入真实构建通过，输出 ES 根与 `.d.ts`；不含新 consumer 编译                                                                                  | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-build.txt:680–701` / 对应status/input SHA JSON                                                    |
| unit        | 本包原 **3 files / 5 tests 通过，0 skip**。十包unit队列exit1不归因本包；新增30用例未进入此测量                                                      | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt:1083–1111`                                                                      |
| coverage    | statements/branches/functions/lines **100/100/100/100**，阈值各项80%；8/8 statements、4/4 functions、8/8 lines，**branches=0/0**，不能外推tree core | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage/rxdb-plugin-tree-vue/coverage-summary.json`                                         |
| lint        | 主控旧输入 `--max-warnings=0` 通过；新spec待跑                                                                                                      | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/ten-packages-current-lint.txt:76–80` / 对应status                                                                      |
| tar/runtime | 本包发布根 source package，tar11文件；真实隔离consumer根import exit0，精确四hooks；根import不是完整应用链路                                         | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/pack-rxdb-plugin-tree-vue.txt` / `consumer-rxdb-plugin-tree-vue-root-import.txt` / `isolated-consumer-validation.json` |
| typed/SFC   | 控制环境node与@types/ms已由主控准备，strict且skipLibCheck=false；本包新正反fixture未编译                                                            | `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/consumer-expectations.json`；主控原consumer记录为fixture-not-yet-written，不能借它称新fixture已通过          |

主控原重任务串行、skipRemoteCache/skipNxCache，无观测期输入变化。新spec/consumer的有效性须独立运行确认；历史workspace typecheck和旧expect-error fixture不能证明tar声明可独立消费。

## 3. 生产不变量与三端静态对照

四函数只选择 method/defaultValue/EntityStaticType 槽位，统一约束TreeEntityType。没有flat fallback、额外订阅或树增量算法。订阅/内容key比较/错误/代次归属 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/hooks.ts:124–257`。当前query开始会保留旧value但同步置hasValue=false、isEmpty=undefined；不能把“旧值仍存在”误报旧结果被宣称可信。

三端实际index/use-tree局部读取，均导出 `useFindDescendants/useCountDescendants/useFindAncestors/useCountAncestors`；find返回数组、默认[]，count返回number、默认0。Angular本仓库同样use命名，未按一般inject约定误报。此静态对照不替代三端真实同一tree fixture运行；不追加Angular route或React StrictMode为本包C4/C5的要求。

## 4. 原 C 逐项结论（原场景不缩小）

### C1 树查询与输入类型 — partial

原动作：对照 Tree repository 和生成泛型，核查 tree options、numeric id、懒查询/层级语义与禁用组合。

原最低场景：numeric/string id、缺 Tree 插件、QueryCache 禁止、深树；错误透明，不 fallback 到扁平查询。

**结论**：partial：四方法名/defaultValue、TreeEntityType/EntityStaticType泛型与无flat fallback已读且原派发测试已通过；numeric/string真实仓储、QueryCache禁止与深树不因wrapper100%而核销。

**已证/已读**：

- 原测试四hooks各派发同名静态仓储方法；原类型fixture只含string id树实体/PlainEntity正反例
- 公开FindTreeOptions与静态类型槽位来源已读；level包含当前节点与find/count计数差异属于tree core语义

**生产与证据锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:23-81`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts:8-43`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts:6-86`

**本次补证已准备，尚未执行**：

- valid/invalid.mts公开FindTreeOptions + numeric/string id + 四hooks类型输入
- 新spec四hook方法缺失透明错误且flat find未调用；只测缺方法mock，不宣称真实未装Tree插件已运行

**必要待证，不改为不适用**：

- numeric/string id实际TreeRepository查询
- 未注册Tree插件的实际仓储链路（区别于缺方法mock）
- QueryCache禁止组合
- 深树/lazy/层级SQL结果

### C2 增量结果与参数切换 — partial

原动作：核查树更新/移动的订阅与请求代次，确保新父节点/过滤条件不沿用旧节点结果。

原最低场景：跨父移动、父删除、快速改 query、空树、销毁；与全量树查询一致。

**结论**：partial：wrapper无独立树算法/订阅；Vue optionsKey与requestId/cleanup源码已读。新增快速参数切换/空发射/停止探针待跑；跨父移动、父删除及全量一致性尚无本包真实fixture证据。

**已证/已读**：

- 订阅责任在useRepositoryQuery，不把旧value消失当不变量：重查保留stale value，hasValue=false/isEmpty=undefined
- tree实际增量和全量一致性责任上游，但原C并不因此变为不适用

**生产与证据锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:23-81`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/hooks.ts:124-257`

**本次补证已准备，尚未执行**：

- 五种Vue输入深改/替换、同值去重、两次快速改参数只取最终query，旧订阅各退订一次
- 旧流晚到next/error不能污染新资源；数组空发射和零计数分别按实际isEmpty契约断言
- 多scope销毁、真实组件卸载；都是静态Observable mock边界

**必要待证，不改为不适用**：

- 真实跨父移动
- 真实父删除
- 真实空树与全量树查询结果一致
- 上述core变更的当前branch回归

### C3 三端 contract 与泄漏 — partial

原动作：逐项对照公共返回类型、加载/错误/空态及 tri-framework-generics fixtures。

原最低场景：同一 tree fixtures 三端运行、consumer 编译、多实例；无需读取 UI 实现细节即可消费。

**结论**：partial：三端公开四运行时出口/TreeEntityType/options槽位/数组[]与count0对齐；主控真实tar root import已通过。三端同一真实tree fixture、多实例真实仓储与独立typed consumer仍待证。

**已证/已读**：

- 三端实际index/use-tree局部对照；命名本仓库均为use，不按通用inject约定误报Angular
- 本包原3files/5tests通过；counter初始0并next后hasValue=true
- 11文件真实tar，根运行时import exit0，四exports；未解析内部源路径

**生产与证据锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:23-81`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/index.ts:13`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/index.ts:14`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-react/src/index.ts:15`

**本次补证已准备，尚未执行**：

- 四hooks全状态/多scope真实Vue probe
- 正反独立.mts；12条目标反例不能以ambient/modules错误冒充成功拒绝

**必要待证，不改为不适用**：

- 同一真实tree fixture三端运行与状态对照
- 三端真实仓储多实例泄漏对照
- tar声明consumer当前正反编译

### C4 Vue 生命周期与响应式来源 — partial

原动作：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。

原最低场景：替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。

**结论**：partial：真实effectScope/ref/computed/getter/reactive来源与onScopeDispose/requestId源码已读；新增30用例含四hooks真实组件props深改/替换/挂卸/晚到与多scope。尚未运行，不借原5tests称本C完整。

**已证/已读**：

- 旧测试运行的确实是Vue effectScope，不是mock useRepositoryQuery
- 本包不创建provider；watch的active effect scope属于Vue组件/调用方，Tree仓储注册仍需上游环境；不追加其他框架route/StrictMode为本C要求

**生产与证据锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/hooks.ts:23`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-vue/src/hooks.ts:124-257`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:23-81`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/__tests__/review-round2-vue-scope.spec.ts`

**本次补证已准备，尚未执行**：

- ref/readonlyRef/computed/getter/reactive深改、替换与结构等价去重
- 四hooks多scope独立stop及晚到结果
- 真实createApp/defineComponent props深改与替换、DOM重渲染、四hooks卸载退订与晚到隔离

**必要待证，不改为不适用**：

- 新Vue scope与组件probe的实际执行/类型检查
- 真实RxDB provider/Tree初始化接线由C1仓储链路补证或主控明确归属，不虚标执行

### C5 Vue 类型与 SFC 消费 — partial

原动作：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。

原最低场景：vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。

**结论**：partial：生成dist声明与实际tar字节对齐，包名imports保留泛型；独立.mts/SFC正反fixture已准备，不使用workspace paths、any或expect-error。vue-tsc/模板错误/emit/readonly身份在主控跑前均待证。

**已证/已读**：

- 真实tar与当前dist/index.js、index.d.ts、use-tree.d.ts字节一致；这是产物映射，不是重复构建确定性
- 公开RxDBResource成员readonly；UseOptions声明支持ref/computed/getter
- 原workspace类型fixture不是独立packed consumer，旧expect-error没有复制进新consumer

**生产与证据锚点**：

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:23-81`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/vite.config.mts:13-17`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/dist/use-tree.d.ts`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/valid.mts`
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/valid.vue`

**本次补证已准备，尚未执行**：

- valid.mts四hooks、numeric/string、readonly/computed/getter、实体/计数精确返回
- invalid.mts十二目标诊断：id×5、非树实体×4、readonly写入、错误结果类型、错误level
- valid.vue四hooks+数值props/emit；invalid.vue错误rootId、emit、实体字段与number方法
- 真实组件probe断言实体对象同identity且不是Vue proxy

**必要待证，不改为不适用**：

- 独立tar strict/skipLibCheck=false正反.mts编译
- 独立tar vue-tsc有效/无效模板及emit契约
- 新spec实体identity运行断言

## 5. 最小新探针与消费者

新 spec `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/__tests__/review-round2-vue-scope.spec.ts` 预期30用例：四hooks各5来源(ref/readonlyRef/computed/getter/reactive)的深改、替换、同值去重、快速两次参数换代；各1个error/requery/无next complete及1个多scope销毁；另2个四hooks缺方法透明错误/真实组件props深改替换挂卸与实体identity。

所有查询用手写静态Observable mock，**useRepositoryQuery、Vue effectScope/watch、createApp/defineComponent真实执行路径未mock**。此测量面证明绑定层，不证明SQL深树/移动删除。数组[]的isEmpty=true与计数0的isEmpty=false按当前RxDBResource契约区分。旧流正常RxJS退订晚到与请求代次保护源码分别记录，未声称已构造绕过RxJS closed的恶意生产者。

消费者 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/valid.mts` / `invalid.mts` 用public ENTITY_STATIC_TYPES、FindTreeOptions与四hooks包根imports，无workspace paths/any/expect-error；有效编译须exit0，无效必须命中12个指定错误，不能仅因ambient缺失/模块解析失败而计通过。`valid.vue` / `invalid.vue` 用numeric props、readonly/computed、精确emits与错误模板；独立vue-tsc正反文件include分离，`valid.mts`是本地实体support，不是包源码alias。实体fixture模拟生成static types，不谎称跑了生成器或真实仓储。

## 6. 原完成条件逐条判定

| 完成条件                                | 判定                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| 全受控内容/配置/测试/构建入口清点与阅读 | **通过：13/13全文，无默认排除，生成输出来源/字节映射已记录**                  |
| 每C有明确结论/证据与原场景              | **通过：C1–C5完整映射；完整C核销仍0/5**                                       |
| 不变量锚点及动态主张准确                | **通过：生产锚点、旧实际测量与新prepared-not-run分开**                        |
| 实际目标/缓存/skip/失败/四指标          | **通过（主控原测量）；新spec门禁/typed/SFC未跑**                              |
| 上下游/三端/实际公开消费链路            | **partial：静态接口和tar根运行时通过，真实仓储/同fixture三端/typed及SFC待证** |
| 候选去重、不虚标未验                    | **通过：本包新增候选0；core真实branch未测试且未冒充通过**                     |
| 全对象评级与完成、发布就绪分开          | **未完成：局部🟡，fullObjectCandidate=false，发布就绪未评定**                 |

## 7. 交付与主控剩余动作

本地阅读/映射/最小补证/记录交付已完成，不因其他包队列阻塞。主控按 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-requests.json` 串行跑本包新spec与lint/typecheck，跑隔离tar `.mts` / vue-tsc consumer，再为原core/三端场景补真实证据或明确裁定。该裁定尚未发生；未把“上游负责”当自动核销理由。

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/file-inspection.json`：13全文区间/关注点/sha与只读上游角色/生成来源。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/c-evidence.json`：原C动作/最低场景、已证、prepared、待证与request映射。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-observations.json`：主控原真实测量、运行边界、tar及语法检查。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/consumer-expectations.json`：正反消费者预期及环境/误判防护。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-requests.json`：主控重任务与仍缺原场景动作。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/closure.json`：局部交付完成与原完整C/全对象未完成分别记。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/findings.pending.md`：无新增本包候选，未验证不登记假问题。

### R2-04 最终冻结交接

2026-10-05，冻结时间 `2026-10-05T11:35:02.083260+08:00`。30用例新spec与5份补证文件（spec、typed正反、SFC正反）已冻结，SHA见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-vue/validation-requests.json` / `closure.json`。本代理结束有界交付，不继续读core/backend或扩任务；主控串行运行冻结输入。原移动/删除/全量一致性、参数实际换代与strict消费者不得无证标过。

## R2 主控验证结算（不扩大子代理原核销范围）

本对象原scope文件已由独占代理全文审阅。源码评审交接、原C最低场景验证、发布就绪三个状态分别保留；存在具体补证未验，不用deadline批量改绿。

[真实tar类型正负/运行时证据](../../evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)、[十包本轮test/四指标](../../evidence/2026-10-05/parallel-round2/validation/ten-packages-current-unit-coverage.txt)、[后四组及修正树夹具复验](../../evidence/2026-10-05/parallel-round2/validation/late-four-and-tree-angular-unit.txt)、[新增spec独立严格类型](../../evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)。reportOnFailure=true只保证失败时产覆盖率，不使失败用例成为通过。

消费环境：在工作区外安装真实发布根tar；NodeNext/strict/skipLibCheck=false，显式Node＋@types/ms对照，裸上游声明缺口保留。原工作区搜索三个包曾解析registry core0.0.25，和当前0.0.26 API不一致，主控独立全0.0.26 tar消费区分环境/产品/夹具；不通过源路径alias或手工软链“修”解析。第三方rrweb/rrdom声明、Vue NodeNext声明/模板、required输入和播放器边界尚未全部核销。

主控只修本轮新增probe的声明推导、审计时间接缝与根StrictMode假设，原失败快照保留；未改业务、原tests、依赖或用户暂存区。

## R3-02：Vue tree SFC / readonly strict 消费结算（2026-10-05）

**R3-02 有界 SFC 补证已交付，不新增问题编号、不扩矩阵、不修改 plan 或原 C 状态；主控最后统一核销。** 本对象 R2 的 13/13 全文阅读与 C1–C5 逐项意见交付已经完成，不能因为必要验证尚未全绿倒记为“未评审”。本轮核实真正 `.vue`、模板与跨 SFC props/emits；不把类型编译当作实际仓储/identity/lifecycle 验证。

| 统计维度                 | 本对象结算                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 全文阅读 / 逐 C 意见交付 | R2 原 13/13 受控文件全文阅读、C1–C5 意见与证据锚点已交付；R3 有界补证意见已交付。必要验证未绿不倒扣这项进度。                   |
| 专题证据核销             | 现有 9 项 SFC 正反/归属对照结算，26/26 目标诊断命中；给主控核销建议，不代改 plan/C 状态。                                       |
| 发布验证                 | 不标全绿：NodeNext 仍受上游 rxdb-vue 声明阻断；主控另通报真实 PGlite 同 fixture 三端删除锚点后 count=-1，上游问题待确认 RV079。 |

### R3 被测来源与执行边界

- 四个被测包都是原独立 consumer 的 **0.0.26 真实 tar**，不是 source aliases 或工作区包软链。tar 507 个文件与已安装副本一致；编译实际加载 core/Vue/tree/tree-vue **104/8/11/2** 份声明，共 125 份，全部与 tar hash 一致，workspace packages 源路径 0。
- 先查已有 `vue-tsc`：独立 consumer 已有 **3.3.12**，本轮没有安装。实际 Node **26.7.0** / TypeScript **6.0.3** / Vue **3.5.43** / RxJS **7.8.2** / language-core **3.3.12** / Volar TypeScript **2.4.28** / node types **26.6.4**，位置、版本、工具文件与 tar hash 全部保存在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/provenance.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/toolchain.json`。
- `strict=true`、`skipLibCheck=false`、`strictTemplates=true`；真正 `vue-tsc --noEmit` 处理 `.vue`，不是 `tsc`/抽取 script。零自写 `any`/ts 抑制、零 type assertion 绕过、零 paths/手工软链。16 次调用全部使用指定 `/tmp/rxdb-review-round3-locked.py`、三个 scopes 的共享串行锁；只有一次轻量配置解析，不跑 Nx/build/unit/coverage。
- 339 个 scopes 输入首尾未变，16 次测量起止 HEAD 都为原 `76a3848…`，编译测量结束时 staged diff 仍与初始一致。收尾只读审计观察到外部并行提交推进 HEAD 至 `72d3bde0303f819b2c88e7fe18130fa231806f1b`、暂存快照变化；不是测量输入漂移，本代理没有执行暂存/提交或撤销外部变化。最终消费代码及修订前代码都保存，不修改 R2 证据。本 results 原前缀完整保留，只追加本段。

### R3 具体正反例与退出状态

| 测量                     | 场景                                                                  | 退出状态 | 精确诊断                     |
| ------------------------ | --------------------------------------------------------------------- | -------- | ---------------------------- |
| invalid-template-bundler | 模板 emit 参数 / 不存在字段 / number 方法错误                         | 2        | TS2339×2、TS2345×1           |
| invalid-inputs-bundler   | 四 hooks 错误 id / 非树实体 / readonly 写入 / 错误结果与 level        | 2        | TS2322×7、TS2345×4、TS2540×1 |
| invalid-parent-bundler   | 父组件 rootId 与 selected handler 参数错误                            | 2        | TS2322×2                     |
| readonly-rules-bundler   | core / tree / Vue UseOptions / 四 wrapper 默认 deep readonly 规则拒绝 | 2        | TS2322×3、TS2345×5           |
| doc-depth-bundler        | 照发布 TSDoc 传 depth                                                 | 2        | TS2353×1                     |
| valid-bundler            | 真实 SFC 正例 + 正确 props/emit 父组件                                | 0        | 0 诊断                       |
| upstream-only-bundler    | 仅引入 rxdb-vue 的 SFC，Bundler 对照                                  | 0        | 0 诊断                       |
| upstream-only-nodenext   | 仅引入 rxdb-vue 的 SFC，NodeNext                                      | 2        | TS2834×7                     |
| valid-nodenext           | 同一有效 wrapper SFC，NodeNext                                        | 2        | TS2305×4、TS2834×7           |

**消费错误 17 个 + 默认 readonly 契约拒绝 8 个 + 文档错配 1 个，共 26/26 个预置目标诊断全部命中；Bundler 负例无额外模块/ambient 错误。** 正例验证四 hooks、numeric/string id、mutable nested rules、Ref/computed/getter/plain/reactive、浅 readonly 与窄标量深 readonly；返回实体/计数类型没有靠宽化绕过。完整目标行号/错误码/原始日志/status/输入 SHA 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/diagnostic-matrix.json`，代码在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/`。

### R3 问题判别与归属（主控去重，不立新编号）

- **R2 readonly “正例”前提不成立，不确认为本 wrapper 类型缺陷。** 真实 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/hooks.d.ts:19` 的 `UseOptions<T>` 只列 T/getter/Ref/ComputedRef；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb/dist/repository/query.interface.d.ts:81–88` 的 `RuleGroup.rules` 是 mutable Array，默认 `FindTreeOptions` 继承该契约。`ReadonlyRulesRejected.vue:18–27` 在 core、tree、上游 Vue 与四 wrapper 同样拒绝 deep readonly rules；完整 options 类型即便当前 where 未赋值仍会拒绝。相反 `Valid.vue:19–43` 的浅只读完整 options/ref 容器、窄标量 deep readonly ref 已通过。不能把“任意 deep readonly”支持偷换成已有承诺，也不能泛化为“所有 readonly 均不支持”。未覆盖所有自定义 WhereType/EntityStaticType 槽位。
- **NodeNext 失败是上游发布声明阻断。** 单独 `UpstreamOnly.vue` 不引入 tree wrapper，Bundler exit 0 / NodeNext exit 2，七个 TS2834 全指向 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/index.d.ts:21/25/29/34/39/44/49` 的 extensionless 导出。有效 wrapper SFC 在 NodeNext 是同七个 TS2834 + 四个 TS2305（wrapper声明两项、消费者两项缺 RxDBResource/UseOptions 的级联）；本 wrapper 自己 root 已导出 `./use-tree.js`。不重复立本 wrapper NodeNext 根因，不宣称修上游后必通过。
- **本 wrapper 确有一处 TSDoc 字段错配（文档候选，建议 P3）。** `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:20` 和真实 tar `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-plugin-tree-vue/dist/use-tree.d.ts:18` 写 `depth`；真实字段是 `level`，README 示例也用 `level`。`DocDepthRejected.vue:4` 照 TSDoc 传 `depth`，exit 2 / 唯一 TS2353，`level` 正例通过。归文档，不把正常拒绝未知字段宣称函数缺陷；本轮不改源码，不添加 depth fallback/alias。公开 README 没有 deep readonly 支持承诺，补充该限制只能列为说明改进。
- **首轮夹具错误未隐藏。** 正例起初模板对自动解包 Ref 多取 `.value`，TS2339 / exit 2；readonly 与父组件反例也受该无关模板错误影响。两处消费模板修正为直接取 entityId，四项新唯一 lock name 重测达预期，没有改 hooks/声明/strict。首轮源码/版本/hash/失败日志留在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/attempt1/`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/matrix-exits.initial.json`；修订记录 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer-revisions.json`。

### 原 C 核销建议（不改状态，由主控统一）

- **C1**：numeric/string id、level 编译子项已补证；本代理未运行真实树仓储、缺插件、QueryCache 禁止、深树/lazy/SQL。真实链路取主控当前证据，不能因静态消费通过标绿；文档候选交主控去重。
- **C3**：建议核销 Vue 独立真实 tar 的 **Bundler strict consumer 编译子项**。主控已有同 fixture 三端真实链路测量，不再笼统写“主控未跑”；其 PGlite count=-1 失败按上游归属保留，不能作为全链路通过。C 状态由主控统一。
- **C5**：建议将真正 SFC 正反、模板字段/方法错误、跨组件 props/emits **参数**、readonly 支持/拒绝边界与 tar 声明映射按 **Bundler + 默认 options 契约**核销；NodeNext 保留上游阻断，本代理没有实体 identity/Vue proxy 运行证据。不自行更新 C5 状态。
- **C2/C4**：不运行移动/删除/全量一致性/参数换代/销毁/晚到/provider，原动态缺口不动；响应式来源“类型可消费”不等于依赖追踪与生命周期正确。
- 本代理额外未验边界：上游修复后 NodeNext、所有自定义 WhereType/生成槽位、emit 返回类型（Vue 生成 listener 目标可出现返回 any，但本轮没有使用它绕过 id 参数检查）、真实仓储/身份/代理、SSR/水合、重复构建确定性、其它工具版本。本代理未验不等于主控未执行；合并主控证据后由主控统一状态，不据此倒扣全文评审交付。

### 主控真实树链路通报（2026-10-05；非本代理新增测量）

主控通报：真实 **PGlite、同 fixture、三端** 在删除查询锚点后测到 **count=-1**；已定位 PGlite 的 `count(*) - 1`，SQLite 对应路径已有 clamp 0，准备确认 **RV079**。本代理不扩矩阵、不另读/改实现、不新立该编号，也不把通报冒充亲跑证据。

该失败归 **上游 PGlite count 实现 / tree 真实查询链路**，不转成 Vue tree wrapper 缺陷；SFC strict 消费通过与运行计数负值风险并存。真实 tree 链路不能标全绿，发布验证保持该风险；主控负责确认、去重和最终 C 状态。此前证据目录里的 C 数字与判定属于本代理先前审计快照，不覆盖主控最新的三维统计或最终状态。

完整证据入口：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/README.md`；结算与边界：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/measurement-summary.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/resolved-declarations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/write-fence.json`。本代理仅写证据和本段，没有改业务、依赖、旧 tests、index，没有执行暂存/提交；交付时的外部并行 Git 状态变化单独记录，未回退。
