# rxdb-plugin-replay-vue：风险候选交主控

- worker：`PKG-replay-vue`；日期：2026-10-05（Asia/Shanghai）。
- **正式新 RV 编号：未自行分配；新候选 1 个。正式编号和与 RV-070 的去重由主控完成。**
- 下列行为已有最小红/绿复验；编号待决不是“失败未复现”。不把其它框架历史问题直接算作本包确认问题。

## [P2 候选，已复现] 首次函数 ref 的 seek 意图在 handle 建立前丢失

本地定位键：`PKG-replay-vue-init-seek`（不是正式问题编号）。owner：Vue Replay维护者；正式编号/与RV-070去重由主控。

### 影响与原承诺

`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/README.md:61` 与 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:9-10` 说明加载完成前 `seek` 会记住目标时刻。组件在 setup 暴露命令，但到 `onMounted` 才建立 handle；消费者在首次函数 ref 回调经公开 `ReplayerRef.seek(500)` 初始化时，调用被可选链丢掉，随后 core 未收到该目标。

### 真实复验与边界

- 只执行一个锁内 Nx test target，一个 spec，2 个用例：**1 failed / 1 passed / 0 skipped**；exitCode=1。
- 红：`function-ref:seek → mountReplayer`，mounts=1，实际 seeks=`[]`，期望 `[500]`。
- 绿对照：`mountReplayer → parent-onMounted:seek → handle.seek:500`，mounts=1，seeks=`[500]`。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/init-ref-probe/init-ref.spec.ts:40-72`；汇总 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/validation-observations.json`；原日志 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/packages-only-replay-vue/init-ref-20261005-01/20261005T163641400530.txt:24-41`。JUnit 确认只有两个 case；重复 stdout/summary 来自 source/merge reporter 拼接，不双算用例。
- 实际 Vue 3.5.43、happy-dom；组件使用当前源码，core 是生命周期边界 spy。证明**Vue 组件未转发初始化 seek**，不冒充真实 rrweb、DOM落位、数据库恢复或发布验证。
- CI=true / NX_DAEMON=false / 单 worker / fileParallelism=false / skipRemoteCache / skipNxCache；共享锁 `/tmp/rxdb-review-heavy-task.lock`，包内13项输入SHA与实读相同，测量中零漂移。排除依赖任务/自动同步以免扩成build或修改原配置，没有skip用例。

### 根因与对照

- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:61-70`：handle直到onMounted建立。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts:86-91`：seek直接可选调用，expose早于handle，未保存意图。
- 安装的Vue runtime源码：`/Users/jimmy/Documents/aiao/rxdb/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:1823-1824` 函数ref同步调用，`6224-6225` mounted hook排入post-render；实测顺序吻合，不靠React时序推断Vue。
- RV-070确认的是React首次layout effect。主控可按共同“命令先暴露、handle后安装”根因去重/扩展既有编号，不能仅凭容器字面相同或不同裁定。

### 最小改进与回归

先保留失败回归，只缓存未有handle期间**最后一次seek**，handle建立后传给core；销毁清意图。play/pause仍保留非就绪空操作，不给全部命令加队列，不新增fallback/API。回归首次函数ref、多次初始化seek、父onMounted正向和卸载后旧句柄。**本评审未修业务/原tests。**

## 非本包新增产品问题

- R3-06旧Replay restore标题投影候选已被合法PGlite正/反对照排除；不能复活成Vue bug。数据库投影/CAS其它边界归core/WorkingTree各自原专题。
- R3-03剩余RAF及同轮loader证据仍是fixture/host归属pending；不把全局调度帧算作Vue视图泄漏。
- C5独立SFC/声明/运行消费与其余原场景尚缺验证，按owner单独记账；不能因没有其它新bug或薄wrapper覆盖率高给🟢。
