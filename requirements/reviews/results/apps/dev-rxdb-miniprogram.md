---
kind: review-execution
object: dev-rxdb-miniprogram
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-miniprogram：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Taro 微信小程序演示，执行 runtime preflight 与单连接 RxDB Todo 流程。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`apps/dev-rxdb-miniprogram/src/app.ts`](../../../../apps/dev-rxdb-miniprogram/src/app.ts)
- [`apps/dev-rxdb-miniprogram/src/runtime-preflight.ts`](../../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts)
- [`apps/dev-rxdb-miniprogram/src/rxdb-demo.ts`](../../../../apps/dev-rxdb-miniprogram/src/rxdb-demo.ts)
- [`apps/dev-rxdb-miniprogram/src/pages/index/index.tsx`](../../../../apps/dev-rxdb-miniprogram/src/pages/index/index.tsx)
- [`apps/dev-rxdb-miniprogram/package.json`](../../../../apps/dev-rxdb-miniprogram/package.json)
- [`apps/dev-rxdb-miniprogram/project.json`](../../../../apps/dev-rxdb-miniprogram/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 真实发布档位：对照 Taro scripts、默认 build 与 adapter 支持范围；其它脚本存在不代表对应平台 RxDB 可用。
- [ ] C2 前置能力与安全随机：核查 preflight 的 WebAssembly、文本编码、文件 API 和安全随机检查，拒绝应先于开库。
- [ ] C3 单连接与启动生命周期：追踪 app/page 生命周期、demo DB 创建、首次载入与失败重试；页面复开不创建并发连接。
- [ ] C4 Todo / 持久化 / 限制：检查 CRUD、错误呈现、关库重开与实际 VFS 写入；不承诺平台没有的崩溃恢复。
- [ ] C5 资源与测试缺口确认：核查 glue/wasm 拷贝、代码包大小、精确依赖与 React18/Taro 隔离；本目录未发现匹配命名的测试文件，需检查其它测试入口后判定缺口。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：生成器、图与小程序第四批深审

[原页面 TypeScript 编译后执行的 Node 生命周期复验](../apps/dev-rxdb-miniprogram-e2e.md) **1 failed /1 passed**：日志。框架 hooks、preflight、demo/open 均是明确接缝，未进行真实 React/Taro 调度、微信 GUI/真机或 Native VFS 句柄泄漏量测；不把 target 名 e2e-devtools 当成真实宿主证明。

人工沿 preflight→prepare runtime→load module→capability checks→connect→activeDemo→page ref、pendingDispose/pendingReconnect与onUnload读取。固定数据库名、页面重启 barrier 不等于当前 pending open 已取消。其它发布档位、真实随机能力与跨启动保存矩阵保留既有测量面，C1/C2/C4/C5 尚未整体核销。业务实现未改。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`dev-rxdb-miniprogram`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：5/40 个 tracked 有实际展示行，3 个全文已展示；未读 35 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                | 本轮结论                                 | 实际生产路径 / 符号行                                                                                                                                                                                                                                                                                     | 事件时序 / 不变量                                                                                                                     | 测试判别力 / 已用证据                                                                          | 必要未验与补证动作                                                                                          |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C1 真实发布档位         | 部分核销：发布档位声明                   | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/package.json:12-32,39-60 Taro scripts / React18 private demo`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/runtime-preflight.ts:81-85 currentDemoRuntime`                                                                 | 只接 weapp/tt/alipay；其余 Taro build 脚本存在不代表 adapter 支持；private demo 与 React18/Taro 隔离。                                | 主控69 lint/typecheck 绿色；实际三平台 build/代码包资源不在本子任务执行。                      | 需 current build 的平台/大小/wasm SHA；没有所有 Taro 平台已支持的结论。                                     |
| C2 前置能力与安全随机   | 部分核销：轻量预检先于开库               | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/runtime-preflight.ts:96-163 random/capability/references`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/rxdb-demo.ts:316-340 prepareRuntime before heavy imports`                                                      | 硬依赖缺失先 blocked/throw；polyfillable 明示；先 runtime.prepare，再重包/glue，再 adapter capability；安全随机来源不靠 Math.random。 | 源码已追；real host 缺能力/随机池耗尽/补给失败当轮未测；mock 能力 presence 不是熵质量。        | 必要：真实逻辑层 reject 先于 connect、weapp/tt/alipay runtime 来源/错误；由主控选择专用宿主验证。           |
| C3 单连接与启动生命周期 | 部分核销：旧页面资源释放路径             | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/rxdb-demo.ts:65-68,200-209,286-289,316-318 releaseActiveDemo / pendingDispose / closeAfterPendingWork`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/pages/index/index.tsx:151-213 start / unload / late demo release` | 启动等旧 dispose/reconnect/benchmark；unload 清 demoRef；迟到 open 在 unloaded 后释放，不继续自检。                                   | 现代码已包含旧 RV-051 释放修复，不复制 Node/卸载旧红；主控 app test/new lifecycle probe 待补。 | 并发 open 尚非完整动态验证；初始化失败中间资源、失败 disconnect、反复重进平台真实测试必需。                 |
| C4 Todo / 持久化 / 限制 | 部分核销：Todo repository/重连路径       | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/rxdb-demo.ts:138-158,241-275,307-313,365-374 CRUD / reopen / SQL probe`                                                                                                                                                                   | save/remove 后重查；重连验证通过 adapter SQL 独立读探针，非只读 UI 徽标；demo DB 名固定。                                             | 小程序 E2E suite 的真实 UI mutation 与 reLaunch 案例已读；没有本轮真实 DevTools执行结果。      | reLaunch 不是应用进程/设备 crash；VFS 错误、完整重开、crash-safe 能力不得超额承诺。                         |
| C5 资源与测试缺口确认   | 部分核销：测试缺口已更正，资源构建未审全 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/package.json:39-80 精确依赖/Taro隔离`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram/src/rxdb-demo.ts:324-328 glue/wasm引用`                                                                                                    | manifest 实际有 src/**tests** 与 config/**tests**，原计划“未发现测试”只是旧导航不能当当前事实；WASM 引用需与 assets 插件产物对应。    | 本轮未读完 config/plugins/benchmark tests，不能凭 tracked 文件名认定通过。                     | 必要：assets/lazy-chunk/realm 插件生产输出/尺寸与 config unit 结果；40 tracked 中只读指定内容，仍 partial。 |

### 本轮门禁与适用边界

- 主控69项目 strict lint、69项目 typecheck 的 status exitCode 均为0，head为 `44de1138b4d396fc45d6e76ab60476c40fef2223`、cacheDisabled=true、重任务并发1、测量期间输入无变化。仅承接纳入名单和其测量输入；新加 probe 不在旧报告里就不声称其 lint/type 已过。状态文件：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。
- 普通 lint/typecheck 不证明浏览器、真实小程序、privileged provider 或全路由用户链路；相应 test/E2E 动态结果尚由主控统一追加，本轮不伪造执行次数/覆盖率。
- 本组新增仅两份 bounded review-parallel spec，共6个用例（ngModel/FormControl/value 3，permission grant/导航/销毁3），尚待主控。新候选在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/findings.pending.md`，未确认、不写总 RV。
- 验证请求数组 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/validation-requests.json`；真实 IME/selection 补证协议 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/browser-required.md`。未到的结果不阻止已充分的小 C 独立核销，也不把全应用的未审项掩掉。

### 完成条件逐项证据与候选判定

| 原完成条件                                | 当前状态                           | 具体证据 / 余项                                                                                                                    |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 全部受控文件清点并实际检查                | 未满足：仍 partial                 | scope 40；有实际行5，全文3；未读/分段逐文件见 inspection，不能用 manifest 替代。                                                   |
| 每个 C 有明确结论与补证动作               | 满足本轮记账；不表示每个C都通过    | 上表逐C有核销/部分/未核销及具体动作；完整动态核销仅按真实报告。                                                                    |
| 不变量/权限由符号锚定，动态主张有当轮环境 | 已读专题有锚；未审专题不冒称证明   | 上表锚定调用者/被调用者与事件顺序；source-only、Node、happy-dom、真实host区分。                                                    |
| 执行/缓存/skip/失败/覆盖测量面登记        | 主控已有结果已承接，待验证仍显式   | 本轮门禁表和主控 status/JUnit；新probe、browser/host结果尚待，不假定通过。                                                         |
| 上下游/适用三框架/多宿主对照              | 已读接口有对照；完整host矩阵未核销 | common editor defaults/change/error/handle；Angular CVA额外面；Chrome静态授权+DevTools shim variance；小程序reLaunch不等进程重启。 |
| 新问题去重/根因/最小修法/边界与复验       | 当前仅2候选待主控；无新confirm     | FE-PENDING-001/002 记录公开触发与最小修法；不复制旧 RV，不将未验证变confirm；本轮不改业务。                                        |
| 有证据的品味结论，评审/修复/发布分开      | 🟡；只能partial                    | 必须先补未读生产/测试/配置；不因已有门禁/单bug修复宣布对象完成。                                                                   |
