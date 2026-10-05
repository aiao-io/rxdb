# rxdb-plugin-search-angular：第二轮候选与去重边界

记录时间：2026-10-05T11:04:50.359525+08:00；阅读 HEAD：`465f9078e9844af2cbef9936c7321a5576333a01`。用户任务 R2-04 / scope 标签 R2-05；唯一对象与原17文件写范围不变。

## SA-R2-required-input-read：README required input 在组件构造时被同步读取

**P2 候选，未运行，不是已确认 RV。** 不以预计 NG0950 当实际失败。

- 文档生产锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/README.md:48–52`，`input.required<RxDB>()` 紧接字段 `useSearch(this.database, ...)`。即使 `startSearch()` 已完成，也不能令 Angular 在字段初始化前给 required input 赋值。
- 实现锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/inject-search.ts:91–92,165–166`，首次 `install(untracked(readSource), ...)` 同步求值 Signal；不是第一次 effect flush 后才读取。
- 最小复验：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-angular/src/__tests__/review-round2-lifecycle.spec.ts:405–412` 的 `RequiredInputHost`，先 `TestBed.createComponent()`、再 `setInput()`。验收断言是应可按 README 创建；主控需看实际错误是否为 NG0950，而不是 Angular JIT fixture / 元数据误用。
- 健康对照：同文件 `SearchHost` 用创建前已可用的注入 source 初始化 Signal，真实 `@Input` setter + `setInput` 改值；配置没有 Angular transformer，不能要求普通 esbuild 推断 `input()` 的 AOT 元数据。
- 最小修法方向：修正文档为创建前已经可用的注入 source；或明确在 inputs 就绪后，用组件 Injector 的注入上下文创建绑定。不要加空 source fallback、不要默改同步初始化公开契约。
- 编号/结论：主控复验去重后裁定；本代理不改 README、实现、旧测试或 RV 台账。

## RV-062：只引用已有 core waiter 缺陷

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/RV-062-parallel-search-cancel.md`；registry 为 confirmed-open / P2。
- 根因在 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search/src/core/search-handle.ts:164–169,245–265`：clear/destroy 丢 pendingQuery，而其中 loadMore waiter 没有结算。
- Angular `loadMore` await active.handle、clear/DestroyRef 转发 core 取消；绑定层未修复上游结算，不能保证任意 pending Promise 都完成。
- 新分页探针只处理**已经开始执行**的分页在换源后迟到完成，不复制造成 RV-062 的 success 订阅同步重入 pending waiter。
- 不重复登记、不给新 RV 号，也不修改原问题。

## 验证缺口不是新增缺陷

当前 real-handle spec 与历史实测 SHA 不同；新13例尚未跑。tar `.mts` 正负编译与根 runtime import 已取得主控的有条件通过；ngc 模板正负例与真实 branch/route 的证据仍待主控。任何 consumer 安装/环境问题先按实际日志归因，不拿 tsc negative 的进程非零当本例正确拒绝，不拿 JIT/TestBed 当真 browser。

## 主控 consumer 对照（11:04，已读日志）

真实 tar 根 import 导出 `SearchExecutionError/useSearch`，正例 exit0、负例 exit2 的五个错误都在本例行（handle/source/options/query/return）。但这份成功显式加载 Node ambient + `@types/ms`；bare 正例仍被上游 utils 的 NodeJS/ms 公共声明卡住。保留普通 consumer 风险，由主控上游去重/裁定，不把环境错误或 bare invalid 的非零冒充正确拒绝。
