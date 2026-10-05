# R3-04：Working-tree Angular required input / OnPush 夹具归属（冻结）

日期：2026-10-05（Asia/Shanghai）。本轮最小对照已交付，不扩浏览器/route 矩阵。

## 状态三轴

- source-review: complete；assessment-delivery: complete。继承 R2 原 scope 15/15 正文阅读与 5/5 逐 C 意见交付，不把它们归零，也不冒称本轮重读全部文件。
- scenario-validation: partial；旧全验证口径 execution: partial；原完整 C 0/5，releaseReady=false。
- 主控完整对象账仍仅 desktop 残留 1/73，其余 72 有效对象未整包闭合；本轮不改总账，不申请整包闭合。

## 归属判别

1. 实际 R2 文件是 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-angular/src/__tests__/review-round2-lifecycle.spec.ts`，不是用户最初给出的 owner-component 文件名。R2 从头到尾未改；旧源、旧失败日志/输入 hash 已复制到 snapshots。当前聚焦复跑依然 12 例、11 pass/1 fail，先出现 NG0303，后 branch DOM 为 main 而非 feature。
2. 真实 `useWorkingTree()` 无参数，在组件注入上下文取固定 provider 数据库，创建不发 IO；它没有 branchId input。branchId 是消费组件用于显式命令的 UI 输入，不是数据库分支身份。父输入变化不应自动切库/切分支或自动刷新已读 diff。
3. 两个未经过 Angular 输入元数据变换的 JIT 组件（纯 Angular、真实 hook）均 inputs=[]，相同 setInput 触发 NG0303，signal 与 DOM 都仍为 main。纯 Angular 反例排除了“必须有产品 hook 才坏”。
4. 正例由真实 ngc 编译 standalone/OnPush + input.required<string>() + 父模板 `[branchId]="branchId()"`。没有手填 Input/isSignal/ɵcmp，没有降 strict。输出含 Angular 生成的 signal input 元数据和父模板 property 绑定。同一个 setInput API、父 signal 更新均更新真实 happy-dom DOM；仅首帧 detectChanges，后续 await whenStable，没有靠强刷子树掩盖不通知。
5. 编译资产用 `vi.importActual` 的生成声明类型加载。两个 InjectionToken 仅跨 evidence 资产转交真实 useRxDB/useWorkingTree 函数；正例断言它们与真实导出严格同一引用，构造子组件时在真实注入上下文调用。provider/hook/core command 源码均执行，但数据库、workingTree/versionManager 门面来自原共享 stubs，不是真库。
6. 真实模板按钮点击按当前 input 传 feature/undefined，pending → success/status empty 和拒绝 → error 能自动刷新 DOM。拒绝后 UI 选项可为 feature，而上次 status 仍 main：这恰恰区分 UI input 与真实分支，绝不拿桩返回 feature 证明数据库切对了。

结论：R2 这一条旧 DOM 失败归 JIT 输入注册夹具，不是本次已证明的产品故障；没有以此宣称产品全正确。

## 实际测量

| 测量 | 实际结果 |
| --- | --- |
| R2 原 probe | 12 例，11 pass / 1 fail，原失败保留 |
| R3 最终对照 | 8/8，0 fail/skip；运行时 67 次断言 |
| required 父模板正例 | ngc strictTemplates、TS strict、skipLibCheck=false，exit 0 |
| 缺 required 输入负例 | exit 1，仅指定模板 NG8008 |
| number → string 输入负例 | exit 1，仅指定模板 TS2322 |
| 新 probe strict 编译 | tsc noEmit、strict、skipLibCheck=false，exit 0 |
| 新 probe Nx 聚焦 lint | exit 0，0 errors/0 warnings |

逐例断言：7 + 7（JIT 两反例）+ 4（required 缺值）+ 6（同 setInput 正例）+ 11（父首帧/provider 真函数）+ 11（父输入来回变化）+ 12（真实点击成功）+ 9（真实点击拒绝）= 67。以最终 raw log 的 expect.getState().assertionCalls 计数，不把匹配器或编译负例充作测试条数。

所有 14 次实际测试/编译/lint 都经 `/tmp/rxdb-review-round3-locked.py`，指定三项 scope。测试 maxWorkers=1，Nx parallel=1、skipRemoteCache/skipNxCache、excludeTaskDependencies；CI=true、NX_DAEMON=false；没有启动服务/GUI，没有 build，test 解析出的 ^build 依赖被明确排除。coverage 关闭，不提供新覆盖率结论。

早期 R3 资产收集失败（0 tests）和第一次 lint 的 1 warning 均保留 raw log 与 source snapshot；未改任何断言目标来绿化，最终只修 asset 导入夹具。没有 any、TS ignore、skip、lint 禁用、依赖/生产/index 修改。

## 输入指纹及共享 Git 变动

- 各次 locked 测量的 tracked 输入漂移均 0；最终额外捕获 610 项源/配置/声明输入（包括当时未受控新 probe/fixture）及两个编译资产，前后均无 hash 漂移。
- 批次间 HEAD `76a3848e2086f4617b80f7b1a1b896ef76e5719c` → `72d3bde0303f819b2c88e7fe18130fa231806f1b`。共同的 204 个 tracked 输入 hash 全相同；新增 tracked 路径仅本轮 probe，计数 204 → 205。共享提交已经吸收了阶段性 probe/证据；本任务没有执行 git add/commit/reset 或其他 Git 写操作，不能谎称全局 index 从任务开始未变。最终测量期间 index 稳定。
- R2 SHA-256：`051cf96152675639982e5df911ec5872f30426e1b19d18f26aa41e6e4c9b72d0`。
- R3 SHA-256：`0080a508628820624be01c08395e1ae09abb61363e81c1bb21d2a2e721f035b8`。
- 所有严格配置和 built d.ts 输入 hash 单独记录。ngc 用既有构建声明隔离 fixture；运行用真实源码，不是新 pack 的发布 consumer 验证。

## C 核销建议与不核销面

- C4：可核销“输入元数据归属、父 signal → required input → OnPush DOM、显式动作状态通知”子面。未重验真实生命周期/异步建库/route/cleanup，不核销完整 C4。
- C5：可核销本次正确父模板的严格输入正反与新 probe 严格类型子面。未重跑发布 tar consumer、原 README 全模板、模板事件负例、真实 browser/route，不核销完整 C5。
- C1-C3：不增加完整核销。真 DB、真实 branch/revision/CAS/dirty/unreachable/数据未损坏没有执行。facade stub 只证明调用接线/状态表达，不证明数据正确。

## 官方规范确认及工具失败

Angular discovery 已调用；示例工程报告 21，实际 node_modules 的 core/compiler/compiler-cli 为 22.2.1，以运行输入为准。get_best_practices 仍失败（Unexpected response type）；search_documentation version=22 返回空，web.run 未返回可用正文。没有声称拿到该工具规范。

另实际抓取 angular.dev 官方 inputs/signals/testing 页面与 Angular 官方 main 的 JIT input transform 源码，均 HTTP 200，URL/抓取日期/hash 和相关片段保存在 official/live。确认输入是编译期元数据、required 模板检查、OnPush 模板 signal 通知与 whenStable 规则，再以本地 ngc 输出和对照执行验证。22.2.1 tag 原始 URL 返回 404，失败记录保留；live/main 不是精确版本来源，精确版本结论只来自本地源码与本次执行。

## 附件

- 总结与全部实际命令：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/measurement-summary.json`。
- 最终 8 例机器报告：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/r3-vitest-results-final.json`。
- 最终测试 raw log：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/r3-focused-20261005-c/20261005T153427292364.txt`。
- source/hash/旧红/中间红：本目录 snapshots、每次 .inputs.json/.status.json/.txt、*.fingerprint.json。
- 重放：先以同一 shared-lock 三 scope 运行 `pnpm exec ngc -p /Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/tsconfig.fixture-positive.json`，再 shared-lock 运行 measurement-summary 中最终 Nx 聚焦命令。不能把编译前 asset 缺失算成产品故障。
