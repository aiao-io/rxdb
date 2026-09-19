# next-0915 分支对 main 评审

- **评审日期**：2026-09-16
- **评审分支**：`next-0915`
- **对比基线**：`main` 的 merge-base `68b0ba97dd25fe158564ce194f6fea37fefc8bd1`
- **变更规模**：443 个文件，`+14,884 / -4,465`
- **主线改动**：把 QueryCache 读引擎、历史/分支、推拉同步从 `@aiao/rxdb` 拆成三个插件包
- **结论**：🟡 **可合并**，剩 5 条 P2 债务

四轮评审共报 7 条 P1、15 条 P2；17 条已处理（修复或复核后判定不改），下面留着的 5 条是
**判定为债务、暂不动**的。按本目录 [README](./README.md) 的约定，已处理的条目连同正文一并
删除——修法与判据都写在代码注释与红测里，报告再留一份副本只会与代码漂移。

同时要记录一条正面结论：**拆包本身经逐行审计是忠实的**。被删除的 975 行核心 `VersionManager` 的
14 个 sync 入口、`resolve-current-branch`、被删测试的全部用例都在新包中重建；所有 import 路径
解析通过、无循环包依赖、无残留的旧导出消费者；新包 lint 零警告。

| 级别 | 遗留问题                                            | 影响                                              | 不动的理由                            |
| ---- | --------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| P2   | `fillInstant` 模块级共享状态可重入                  | 非标配置下 `createdAt !== updatedAt` 不变量被破坏 | PLAUSIBLE，触发路径需非标默认值配置   |
| P2   | querycache `export *` 冻结 10 个零消费实现符号      | 内部重构需走破坏性变更周期，纯未来税              | 导出策略取舍，应与 1.0 冻结范围一起定 |
| P2   | 两个 QueryCache 缺插件错误工厂逐字节重复            | 诊断信息只改一半即过期                            | 收益边际，两处各两个内部调用点        |
| P2   | 多个新包复制测试 fixture（逐字节相同者已降到 2 份） | 核心契约变更时副本静默腐化                        | 需独立的 `rxdb-test` 抽取重构         |
| P2   | 文档门禁源码自检靠正则，`static`/修饰符前缀即失明   | 门禁静默漏检或误报红 CI                           | 当下并未失明，属未来形态，见 §5       |

## 遗留债务明细

### 1. P2：`fillInstant` 模块级共享状态可重入

[`entity.utils.ts:156`](../../packages/rxdb/src/entity/entity.utils.ts#L156) 把本次填充的
「now」放在模块级变量，docstring 断言「填充同步且不可重入」但无强制。默认值工厂可同步 `new`
另一个实体（`entity.decorator.ts:81` 会重入 `fillDefaultValue`），内层 finally 清掉
`fillInstant`，外层剩余字段的 `entityDefaultNow()` 回退到新的时钟读取。标准 EntityBase 派生
实体的 `createdAt`/`updatedAt` 因祖先先合并而连续执行、不受影响；覆盖 `id` 默认值或自定义日期
默认值排序等非标配置下不变量可被破坏。**PLAUSIBLE**（机制确认，触发需非标配置）。

**修复**：改成栈式（保存/恢复旧值）或把 instant 作为参数沿调用链传递。

### 2. P2：querycache `export *` 冻结 10 个零消费实现符号

[`index.ts:18`](../../packages/rxdb-plugin-querycache/src/index.ts#L18) 的 `export *` 把
factory/primary/sync-memo/engine 的全部实现符号（`createQueryCachePrimary`、
`QueryCacheSyncMemo`、`queryCacheFingerprint` 等）发布为公开 API——api-baseline 13 项中的
10 项，包外零消费方（仅测试/演示引用了 `rxDBPluginQueryCache` 与 `@experimental` 的
`QueryCacheEngine`）。按 `versioning-policy.md`「不在表内的公开入口默认进入 1.0 冻结范围」，
未来内部重构需走破坏性变更周期。兄弟 history 插件刻意收窄为类型导出，querycache 应同样只导出
插件工厂 + 类型，包内测试走相对路径。

### 3. P2：两个 QueryCache 缺插件错误工厂逐字节重复

[`query-cache-outbox.interface.ts:55`](../../packages/rxdb/src/repository/query-cache-outbox.interface.ts#L55)
的 `missingQueryCacheOutboxError` 与 `query-cache-engine.interface.ts:147` 的
`missingQueryCacheEngineError` 仅差包名与提示词；引擎侧注释自己承认「分开写两份，迟早会有一份
不提包名」。各有两个内部调用点、均非公开 API，应收敛为 `RxDBError.ts` 中一个参数化工厂。

### 4. P2：多个新包复制测试 fixture

`test-entities.ts`、`transaction-executor-stub.ts`、`private-symbols.ts`、`reachability.ts` 等
fixture 逐字节复制于插件包之间（2026-09-18 复核：逐字节相同的 fixture 已从 3 份降到 2 份——
`test-entities.ts` / `transaction-executor-stub.ts` 在 sync/history 间相同，`private-symbols.ts` /
`reachability.ts` 在 sync/querycache 间相同，另有 `fake-table-ref.ts` 在 sync/history 间相同；
querycache 已不再持有 test-entities / transaction-executor-stub）。`test-db-setup.ts` 现有 4 份
互不相同（core / sync / history / working-tree）。这些 fixture 探测核心私有符号，核心契约变更时
需在多处同步更新，漏一处即静默腐化。`packages/rxdb-test` 已存在且目的就是共享 fixture，但上述
fixture 均未下沉到它；`test-db-setup` 的分叉至少在文件内注明是有意的，逐字节相同的几份没有任何说明。

### 5. P2：文档门禁源码自检靠正则，`static`/修饰符前缀即失明

门禁的**文档侧**判据已经补齐；剩下的盲区在**源码自检侧**：
[`docs-plugin-surface.mjs:79`](../../scripts/audit/docs-plugin-surface.mjs#L79) 的方法名正则
`/^ {2}(?:async )?([a-zA-Z][\w]*)\s*[(<]/gm` 不匹配 `static`/`public`/`private`/`readonly`
前缀，也不匹配换行签名——哪天某个同步方法以 `static` 形式搬回 `VersionManager`，名单自检
要么静默漏检、要么误报「名单已过期」红掉 CI。该门禁已有两轮人类发现的绕过历史，都是靠再补
正则条件修复；结构化（AST）解析是更稳的解法，一直没落地。

**降为债务的两点订正**（原报的证据不成立，别据此当成现存故障重提）：报告引的正则写作
`[(&<]`，源码里是 `[(<]`；「`VersionManager.ts` 已在用 `private`/`readonly` 前缀」指的是
[第 59/73/84 行的**属性**](../../packages/rxdb-plugin-history/src/VersionManager.ts#L59)，
而名单只覆盖同步**方法**。也就是说门禁**当下没有失明**，失明的是尚未出现的写法。

## 被证伪的候选（无需处理，记录防复提）

- **`firstValueFrom(remoteAdapter$)` 永久挂起 ×2**（`system-repositories.ts:96`、
  `query-cache-outbox.ts:317`）：发射由配置驱动、与连接无关——`init()` 推送配置名，
  `getAdapter` 无需连接即可解析实例，配置了就不会挂；未注册则立即拒绝而非挂起。
- **`Repository.ts:38` 的 `Extract<SyncOptions, …>`**：联合成员本就全部私有，`Extract` 只依赖
  判别字段，字段变化自动跟随、编译期响亮失败。
- **`examples/angular-todo` 未迁移 `versionManager`**：示例解析到已发布的 0.0.24（仍含
  `versionManager`），当前不报错；但属**潜在债务**——升级到 0.0.25 时会断，建议顺手按
  `modules/angular-todo` 的修法补上。

## 这些条目是怎么查出来的

上面 5 条出自第四轮——那轮是**独立全量评审**，不是针对前几轮修复的复核：10 个发现方向（逐行 diff 扫描 /
删除行为审计 / 跨文件追踪 / 语言陷阱 / 包装器正确性 / 复用 / 简化 / 效率 / 高度 / 规范符合性）
并行产出 36 个候选，去重后 26 项逐一对抗性验证（CONFIRMED 14 / PLAUSIBLE 4 / REFUTED 8，
另 2 项为 pre-existing 搬移代码），再经 1 次补漏扫描新增 2 条。所有断言均带源码行锚点；
验证记录：新包 eslint 零警告、import 全解析、无循环包依赖、Angular/React/Vue 三框架变更对称、
`git diff --check` 层面无空白告警。评审当轮未复跑全套测试，修复轮补跑了
`pnpm nx run-many -t lint test build --projects=tag:js-lib`：82 个任务通过，`rxdb-adapter-electron:test`
首轮闪断、单独复跑 880/880 全绿且 Nx 自标 flaky，按 AGENTS.md:55 判为并发假失败。

**遗留说明**：状态查询串行 await、pushable 双重计数、`find().length` 应为 `count()` 三条效率
问题均确认存在，但属 main 旧代码原样搬入（`git show main:` 逐行比对），不计入上面的债务表，
可另行立项。
