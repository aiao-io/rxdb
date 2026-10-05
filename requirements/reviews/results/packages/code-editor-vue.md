---
kind: review-execution
object: code-editor-vue
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# code-editor-vue：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Vue：共享 CodeMirror 文档/语言契约的框架组件。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/code-editor-vue/src/CodeEditor.vue`](../../../../packages/code-editor-vue/src/CodeEditor.vue)
- [`packages/code-editor-vue/src/code-editor.types.ts`](../../../../packages/code-editor-vue/src/code-editor.types.ts)
- [`packages/code-editor-vue/src/index.ts`](../../../../packages/code-editor-vue/src/index.ts)
- [`packages/code-editor-vue/package.json`](../../../../packages/code-editor-vue/package.json)
- [`packages/code-editor-vue/project.json`](../../../../packages/code-editor-vue/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 EditorView 所有权与同步：核查编辑器只由组件实例创建/释放；共享 document-sync 正确处理外部 value、内部 change 和 selection/IME。
- [ ] C2 动态配置竞态：追踪语言/主题/扩展重新配置与异步语言装载，不能把旧 loader 结果安装到新 props。
- [ ] C3 三端 API / a11y：逐项比较 props/options/change/error、aria 与 keyboard，依共享包规范验证，不凭 demo 视觉一致判断。
- [ ] C4 Vue 生命周期与响应式来源：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- [ ] C5 Vue 类型与 SFC 消费：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：编辑器与预览第七批

C1/C2/C3/C4 已追踪真实 mounted/watch/expose 与 request/view 代次。确认 RV-056（已修复）：同步异常不仅漏 language-error，还中断后续 readonly/disabled 初始化，createApp 的真实编辑区为 readOnly=false/contenteditable=true。最终 **67 passed /1 failed**，原 66 条全部保留通过。真实 CodeMirror 测量不使用原模拟 view spec 替代；浏览器输入/IME/独立 SFC 消费未全量完成。

[本轮实际范围、门禁与剩余项](../../execution-2026-10-04-editor-frameworks.md) · [三端观测](../../evidence/2026-10-04/editor-frameworks/final-observations.json)。七对象严格零警告 lint/typecheck 通过；新红保留，业务实现未改。happy-dom 不是浏览器/辅助技术验收，所有完整 C 项仍需逐项核销。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`code-editor-vue`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：5/21 个 tracked 有实际展示行，3 个全文已展示；未读 16 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                    | 本轮结论                             | 实际生产路径 / 符号行                                                                                                                                                                                                                                   | 事件时序 / 不变量                                                                                                   | 测试判别力 / 已用证据                                                                                                                                                                  | 必要未验与补证动作                                                                                               |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C1 EditorView 所有权与同步  | 部分核销：真实 CM 事务已核销         | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/CodeEditor.vue:81-162 mounted / updateListener / value watch / unmounted`                                                                                                                | 用户编辑发 update:value+change；外部 watch 最小差量，不回发事件/不入 undo；卸载递增代次、清 ref、destroy。          | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/__tests__/CodeEditor.document-sync.spec.ts:21-101 真实 CodeMirror 光标/range/history/差量`；本轮该套件 5/5。            | 真实 IME/浏览器 selection 未核销；同目录整套 mock 的 CodeEditor.spec.ts 不替代这些 real-CM 断言。                |
| C2 动态配置竞态             | 已核销：当前语言身份/错误竞态        | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/CodeEditor.vue:198-260 syncLanguage / updateLanguage / isCurrentLanguageRequest`                                                                                                         | watch 触发后按 description 比较；真正加载才增 request；同步 throw 转 rejection；晚到成功/错误均 request+view 守卫。 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/__tests__/CodeEditor.language.spec.ts:166-230 missing/拒绝/none/过期拒绝/卸载`；本轮 9 个语言用例+同步 throw 对照绿色。 | 已读源码与错误测试；等价列表成功测试中段尚未逐行读，具体未读范围见 inspection。不把 mock spec 或旧红当当轮结论。 |
| C3 三端 API / a11y          | 部分核销：共同 API / 真 textbox 属性 | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/CodeEditor.vue:28-45,262-285,314-333 defaults / access / a11y / expose`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/code-editor.types.ts:126-175 value/emits/handle` | 非严格受控 value；错误/用户事件通道明确；label/labelledBy/describedBy 写 contentDOM；disabled 抑制初始 focus。      | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/__tests__/CodeEditor.a11y.spec.ts:41-87 真实 role/清空/disabled/焦点正反`；本轮 6/6。                                   | 可见 DOM 属性已核销；真实键盘/屏幕阅读器未核销，ShadowRoot consumer 未运行。                                     |
| C4 Vue 生命周期与响应式来源 | 已核销：组件卸载/逻辑取消子项        | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/CodeEditor.vue:138-143,145-172,258-260,314-324 watch / unmounted / current-request / expose`                                                                                             | 所有 watch 在 setup scope；卸载先推进 request、清 viewRef，再销毁；保留旧 expose 的 host getter 也跟 view 置空。    | 真实语言卸载拒绝用例 222-230 绿色；真实文档与 a11y 套件 teardown unmount。                                                                                                             | loader 网络 Promise 不被 AbortController 物理取消；不是泄漏确认。页面 provider 与大规模实例尚属 app/宿主验证。   |
| C5 Vue 类型与 SFC 消费      | 部分核销：SFC 类型/发布条目          | `/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/code-editor.types.ts:136-177 typed emits/expose/theme`；`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue/src/CodeEditor.vue:314-333 defineExpose / template`                   | 公开事件 tuple 与 expose null 语义对齐三端；模板只持有宿主，CM DOM 不靠字符串 HTML 注入。                           | 主控69 lint/typecheck 绿色；68/68 当轮测试；实际 pack 条目/root resolve 成功。                                                                                                         | 独立 SFC consumer 的 vue-tsc 编译/runtime import、SSR hydration 未核销；pack root 可解析不补这两项。             |

### 本轮门禁与适用边界

- 主控69项目 strict lint、69项目 typecheck 的 status exitCode 均为0，head为 `44de1138b4d396fc45d6e76ab60476c40fef2223`、cacheDisabled=true、重任务并发1、测量期间输入无变化。仅承接纳入名单和其测量输入；新加 probe 不在旧报告里就不声称其 lint/type 已过。状态文件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。
- editor 当轮：**68 tests / 0 failed / 0 skipped**；四指标 statements=96.26%、branches=88.88%、functions=100%、lines=100%。JUnit `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor-vue/junit.xml`；coverage `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage/code-editor-vue/coverage-summary.json`。不是使用旧 baseline，Vue mock 与 real-CM suite 的证明面分开。
- framework-editor-coverage 总命令 exitCode=1 的唯一失败为 rxdb-angular（249 pass /16 fail，mock 未命中，主控归因）；**不属于本 editor 包**。本包 JUnit 零失败独立承接。
- 实际 pack root：`/Users/jimmy/Documents/aiao/rxdb/packages/code-editor-vue`；packedFileCount=14，missingDeclaredEntries=[]，root 可解析；tarball SHA `805d0de99935f7e7bc4473416cfb5705107ecbc539c1019312e120662ee56a11`。`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/packed-consumer-entry-check.json` 明确 declarationCompilationExecuted=false、runtimeImportExecuted=false，不能称 typed/runtime consumer 已通过。
- 本组新增仅两份 bounded review-parallel spec，共6个用例（ngModel/FormControl/value 3，permission grant/导航/销毁3），尚待主控。新候选在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/findings.pending.md`，未确认、不写总 RV。
- 验证请求数组 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/validation-requests.json`；真实 IME/selection 补证协议 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/browser-required.md`。未到的结果不阻止已充分的小 C 独立核销，也不把全应用的未审项掩掉。

### 完成条件逐项证据与候选判定

| 原完成条件                                | 当前状态                           | 具体证据 / 余项                                                                                                                    |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 全部受控文件清点并实际检查                | 未满足：仍 partial                 | scope 21；有实际行5，全文3；未读/分段逐文件见 inspection，不能用 manifest 替代。                                                   |
| 每个 C 有明确结论与补证动作               | 满足本轮记账；不表示每个C都通过    | 上表逐C有核销/部分/未核销及具体动作；完整动态核销仅按真实报告。                                                                    |
| 不变量/权限由符号锚定，动态主张有当轮环境 | 已读专题有锚；未审专题不冒称证明   | 上表锚定调用者/被调用者与事件顺序；source-only、Node、happy-dom、真实host区分。                                                    |
| 执行/缓存/skip/失败/覆盖测量面登记        | 主控已有结果已承接，待验证仍显式   | 本轮门禁表和主控 status/JUnit；新probe、browser/host结果尚待，不假定通过。                                                         |
| 上下游/适用三框架/多宿主对照              | 已读接口有对照；完整host矩阵未核销 | common editor defaults/change/error/handle；Angular CVA额外面；Chrome静态授权+DevTools shim variance；小程序reLaunch不等进程重启。 |
| 新问题去重/根因/最小修法/边界与复验       | 当前仅2候选待主控；无新confirm     | FE-PENDING-001/002 记录公开触发与最小修法；不复制旧 RV，不将未验证变confirm；本轮不改业务。                                        |
| 有证据的品味结论，评审/修复/发布分开      | 🟡；只能partial                    | 必须先补未读生产/测试/配置；不因已有门禁/单bug修复宣布对象完成。                                                                   |
