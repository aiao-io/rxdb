# core 待主控复验、去重与编号的发现

日期：2026-10-05；基线：`44de1138b4d396fc45d6e76ab60476c40fef2223` + 当前工作区。本文件不分配 RV、不修改现有 RV。候选1/2已经主控2026-10-05首次批动态复验；候选3/4仅静态确定、晚加spec待supplement。本文件不分配RV，编号由主控复验去重处理。

## CORE-PENDING-1 · P2 · LifecycleScope 在 acquire 的 setup 内关闭时漏释放新资源

- 触发：合法同步 `setup` 中间经同步回调调用同一 scope 的 `dispose()`，随后返回该资源的 disposer。公开注释只禁 disposer 的 await 后自锁，未禁 setup 中关闭；同步注册源/关闭回调可触发。
- 锚点：`packages/utils/src/lifecycle/lifecycle-scope.ts:101-106` 只在 setup **之前**检查 active；`:192-200` dispose 立即快照并清空登记；`:238-241` setup 返回后无条件登记。此时清单已消费，重复 dispose 只返回首次任务（`:176-178`）。
- 后果：该资源进入已 disposed/disposing 的 scope，后续 dispose 永不触达；getEntries 又返回空数组（`:145-146`），诊断掩盖泄漏。静态根因与主控首批动态复验一致（1 failed/1 passed）。
- 最小修法：处理“setup 返回时 scope 已失活”的所有权交接；清理刚取得的资源并显式拒绝该登记，或保证关闭任务能接管该 disposer。不能仅补状态检查然后丢弃 disposer；不要重跑 setup。
- 回归：`packages/utils/src/__tests__/lifecycle/review-parallel-acquire-close.spec.ts`，关闭中取得的 disposer 必须恰好执行一次；普通获取/重复 dispose 作正常对照。本子任务未自跑重任务；主控2026-10-05首批已执行，见末节。

## CORE-PENDING-2 · P2 · generator 不展开只有字符类/花括号的实体 glob

- 触发：CLI/Vite 传入 `entities: ['./entities/[AB].ts']` 或 `['./entities/{A,B}.ts']`（无 `*`、无 `?`）。
- 锚点：`packages/rxdb-client-generator/src/cli/find-files.ts:25-29` 将这两种 glob 当成字面路径；`:36-41` 真正 glob 从不调用。对照 `src/plugins/vite.ts:16,35-42` 的 GLOB_MAGIC 已识别字符类/花括号，watch 与生成输入语义不一致；`src/cli/build-client-lib.ts:214-220` 将不存在的字面路径交给 AST 分析。
- 后果：存在匹配实体却不能生成/重建，失败不是“零匹配”；普通星号模式不受影响。静态根因与主控首批动态复验一致（2 failed/1 passed）。
- 最小修法：统一 glob magic 判定，使用 glob 的完整 magic 判定或与 Vite 相同的判定；保持显式字面路径与 allowEmpty 既有契约，不改 cwd 语义。
- 回归：`packages/rxdb-client-generator/src/__tests__/cli/review-parallel-glob-patterns.spec.ts` 使用真实临时文件+真实 glob，2 个边界+星号正常对照，不 mock glob。本子任务未自跑重任务；主控2026-10-05首批已执行，见末节。

## CORE-PENDING-3 · P2 · 事务共享套件把关闭失败变成 teardown 通过

- 触发：factory.createDatabase 已返回资源；用例结束或连接失败，database.dispose 拒绝（真实资源未释放/关闭异常）。
- 锚点：`packages/rxdb-test/src/transaction/bootstrap.suite.ts:43-46`、`readiness.suite.ts:35-38`、`isolation.suite.ts:57-60` 均对每个 dispose 使用 `.catch(() => undefined)`。
- 后果：所有关闭失败都变成成功；仅凭这些套件绿不能证明资源隔离，清理故障不在报告中显现。资源是否真的泄漏取决于 factory，不能由静态源码断言；**错误被吞**则静态确定。
- 最小修法：仍尝试释放所有 opened 项，但收集关闭错误后让 afterEach reject（单错原样、多错 AggregateError）；不要让首个关闭错误中断剩余资源，也不要用空 catch 伪装成功。
- 回归：`packages/rxdb-test/src/__tests__/transaction/review-parallel-teardown-rejection.spec.ts` 捕获真实共享套件注册的 case/hook，用故意失败的连接/关闭替身检测 hook 判别力；3 个关闭拒绝边界 +3 个正常关闭对照。这里替身只证明套件行为，**不是**持久化/真实宿主证据；本轮未运行。

## CORE-PENDING-4 · P2 · cloneDeep 把稀疏数组压缩，改变索引/长度

- 触发：公开 cloneDeep 输入稀疏数组，例如 length=3、只有 index=2 为 'tail'。
- 锚点：`packages/utils/src/object/cloneDeep.ts:77-83` 以空数组起步，Array.forEach 跳过 hole，再用 push 重排索引。对照 `createStableKey.ts:19-26` 已显式区分 hole / undefined / 长度，证明仓库已把数组结构视为有意义的内容。
- 后果：输出变为 length=1、index=0 为 'tail'；不是深拷贝等价数据。静态确定，未动态验证。普通密集数组和循环引用的正常分支未据此否定。
- 最小修法：数组结果先保留原长度，逐个已有索引写到同一索引；保留 WeakMap 的预登记，不把 hole 填成 undefined。
- 回归：`packages/utils/src/__tests__/object/review-parallel-clone-array-shape.spec.ts`，1 个稀疏边界 + 密集共享引用 / 数组自引用 2 个正常对照；本轮未运行。

## 2026-10-05 首批验证状态补记

- 候选1：`review-parallel-acquire-close.spec.ts` **1 failed /1 passed**；断言cleanup执行1次，实际0次。本轮动态确认，不代表完整生命周期C已审完。
- 候选2：`review-parallel-glob-patterns.spec.ts` **2 failed /1 passed**；字符类/花括号返回字面路径，普通星号正常。本轮动态确认。
- 候选3/4：晚加，首次批输入/日志不含其执行结果，保持静态结论；主控supplement再补实际红绿。
- 原始证据：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；已提取行号在 `validation-reconciliation.json`，原日期与SHA保留。
