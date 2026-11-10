# codex/full-review-main-20261108 分支代码评审报告

> 评审对象：`origin/codex/full-review-main-20261108` 相对 `origin/main` 的全部代码差异
> 评审时间：2026-11-10
> 评审方式：四组并行静态评审（核心引擎 / 存储适配器 / 框架绑定与应用 / 插件与管理壳），每处发现均核对过上下文与对应测试

## 一、差异全貌与分支构成

| 维度 | 数据 |
| --- | --- |
| 差异规模 | 667 个文件，+36,231 / −2,156 行 |
| 代码（ts/mjs/tsx/vue 等） | 约 450 个文件，新增 20,094 行；其中测试文件 217 个 |
| 文档（md） | 203 个文件（`requirements/reviews/` 评审记录占 162） |
| 分叉点 | `db95eefd`（chore(aiao): 统一 AI 评审规范并稳定三端回归测试 (#207)，2026-11-09） |

分支结构：4 个评审记录提交（`b7dcef3f` → `8b5cb4fc`）→ 一次 merge main（`1b5fb4e4`）→ 17 个以数字命名的 WIP 提交（`788c4baf` → `cd79e417`）。CHANGELOG 显示这些提交承载了大量实质修复：

- **连接生命周期仲裁**：`disconnect()`/`disconnectAll()`/`connect()` 在拆卸窗口内互斥串行，按实例身份 + 停机纪元比对避免旧收尾抹掉新连接。
- **查询管线正确性**：迟到/乱序 CREATE 守卫、事件载荷日期还原、脏实体按持久化值判定成员资格与排序、`in`/`notIn` 日期按时间点比较。
- **写入收尾**：`writeMark()`/`applyWriteResult()` 保留提交之后的新输入（未保存草稿不再被回填覆盖）。
- **安全加固**：`__proto__`/`reservedName` 实体命名拒绝、稀疏数组空位拦截、含 NUL 字符串绑定拒绝（此前静默截断）、库名到 VFS 文件一一对应校验、加密列建表明文 DEFAULT 移除（sqlite-core 侧）。
- **主键列名（`columnName`）打通**：PGlite 全链路按主键物理列定位，此前这类实体记日志时第一次写就报错。
- **备份约束指纹**：`constraintFingerprint` 进备份清单，约束漂移的归档在写目标前即拒绝。
- **同步认领竞态闭环**：push 先认领再按同一口径复查，undo 在写事务里复核水位线，本地回执部分失败抛 `RxDBPartialSyncError`。
- **三端 demo 对齐**：无限滚动、SSR 持久化状态、生成器页、remote-cache object URL 生命周期等。

## 二、评审发现汇总

| 严重程度 | 数量 | 分布 |
| --- | --- | --- |
| 严重 | 1 | 框架绑定与应用组 |
| 重要 | 7 | 框架绑定与应用 2 / 存储适配器 2 / 插件与管理壳 2 / 核心引擎 1 |
| 建议 | 18 | 核心引擎 6 / 框架绑定与应用 5 / 存储适配器 4 / 插件与管理壳 3 |

### 严重

#### S-1 React `usePersistedState` SSR 仍写入进程级共享注册表，跨请求同键换值类型会让整个请求抛错崩溃

- **位置**：`packages/rxdb-react/src/use-persisted-state.ts:99`（hook 体 `registry.entry(namespace, name, initialValue)`）
- **问题**：长驻 SSR 进程里模块级 `registry` 跨请求存活。hook 体在服务端渲染时照常执行 `registry.entry()`，而 `PersistedStateRegistry.entry`（`packages/utils/src/@browser/persisted-state.ts`）对已注册键做 `assertSameTypeTag` fail-fast。两个请求对同一业务键传入不同类型的 `initialValue`（如请求 A 传 `null`、请求 B 传 `{...}`）时，第二个请求在 `renderToString` 中抛错，整个请求 500。同一 RV 里 Vue 侧已用 per-request `ssrRegistries` 显式规避并专门写了「同键跨请求换值类型不抛错」用例；Angular 靠 root injector 每请求一应用天然隔离。React 侧只隔离了**读**（`getServerSnapshot` 不走注册表），**写注册**仍在共享表上，且 SSR spec 没有换类型的用例。
- **建议**：服务端不碰模块级注册表，参照 Vue 的 per-request 分表思路（React 19 `cache()` 或 AsyncLocalStorage）；补一条与 Vue 对称的用例（同键跨请求换值类型不抛错）。

### 重要

#### I-1 PGlite 建表 DDL 仍为加密列写明文 DEFAULT：同源修复只落在 sqlite-core 一侧

- **位置**：`packages/rxdb-adapter-pglite/src/table/create_table_sql.ts:76`（对照 sqlite-core 本次新增的 `property.encrypted !== true` 守卫）
- **问题**：sqlite-core 侧移除了加密列在 DDL 里的明文 DEFAULT 并在 INSERT 前按元数据补默认值随行加密；PGlite 侧没有做同源修复。共享的 `normalizeCreateEntity` 不补默认值，单条 INSERT 缺省加密列时由 PG 应用 DDL 的明文默认值——密文列落明文、读取时 `EncryptedDecryptError`，明文默认值永久留在 pg catalog。`packages/rxdb-adapter-encrypted/README.md` 本次新增的「current version no longer writes it」声明对 PGlite 后端不成立。
- **建议**：PGlite 建表 DDL 同样跳过加密列的 DEFAULT，INSERT 按元数据补缺省加密列随行加密（对齐 `fill_encrypted_defaults`）；补 pglite 版 encrypted-default 用例，README 按后端区分声明。

#### I-2 QueryCache 裸名解析契约变更破坏既有直接调用方，pglite README 未同步

- **位置**：`packages/rxdb-adapter-pglite/src/query-cache/query_cache_target.ts`、`packages/rxdb-adapter-supabase/src/entity_scope.ts`
- **问题**：裸实体名从「全部命名空间里唯一匹配」改为「一律按 public 解析、匹配不到即抛」。sync 插件侧已对齐（public 写裸名、其余写限定名），但适配器公开 API 的直接消费方（宿主应用、devtools 面板用裸名指非 public 实体）会从可用变成抛错——supabase 自己的测试就展示了破坏面（`pullChanges(..., ['RxDBBranch'])` 必须改成 `'rxdb:RxDBBranch'`）。这属于核心哲学「Never break userspace」的可疑变更。supabase README 已更新契约描述，pglite 的 README/TSDoc 没有同步说明。
- **建议**：pglite README 补齐「裸名一律 public、其余命名空间必须写 `namespace:entity`」的契约说明，发布说明标注破坏性变更。

#### I-3 三框架不对称：hydration 快照对齐只落了 React，Vue 与 Angular 仍直接读盘上值初始化

- **位置**：`packages/rxdb-vue/src/use-persisted-state.ts`（`shallowRef(entry.get())`）、`packages/rxdb-angular`（注册表随 root injector、客户端创建即读盘）；对照 React（`getServerSnapshot = () => initialValue` + 专测）
- **问题**：React 侧专门把「hydrate 先用 initialValue 对齐服务端 HTML、提交后切盘上值」做成了带 spec 的契约。Vue 侧同一 RV 只解决了按请求隔离，客户端 setup 里首帧就是盘上值；当盘上值与 SSR 渲染的 `initialValue` 不一致时，hydration 产生文本不匹配警告并整节点替换（首帧值跳动）；Angular 同样没有对齐机制。两端都没有对应 hydration 测试。按三框架对称铁律，这是同一缺陷修复只落了一端的行为差异。
- **建议**：Vue 在 hydration 完成前以 `initialValue` 起步，提交后再切盘上值；Angular 同理（或在 bootstrap 前延迟盘读）。两端各补与 React `hydrate.spec` 对称的用例。

#### I-4 e2e `openDemo` 等待真实 SSE 接通却沿用默认 5 秒断言超时，CI 首屏慢时整套 change-feed 用例成批假失败

- **位置**：`apps/dev-rxdb-http-e2e/src/support.ts:144`（`toHaveText(/已接通|已关闭/)` 未显式给 timeout）
- **问题**：语义从「读意图位」升级为「等适配器 `onOpen` 真实接通」后，等待时间取决于整条链路（页面加载 → WASM/RxDB 初始化 → EventSource 连接）。未显式给 timeout 走 Playwright 默认 5 秒；同文件恢复场景显式给了 `RECOVER_TIMEOUT_MS = 10_000`，说明作者知道接通可能超过 5 秒。CI 负载下首屏超 5 秒会让本 spec 约 8 条依赖 `openDemo` 的用例批量假失败。
- **建议**：给这条断言显式 `{ timeout: 15_000 }`，或在文档写明「首次接通 ≤5s」前提。

#### I-5 benchmarks 新增的 rxdb-factory.spec.ts 没有任何执行入口，回归保护形同虚设

- **位置**：`benchmarks/src/utils/rxdb-factory.spec.ts:1`（新增 141 行）；`benchmarks/project.json`（本次未改）
- **问题**：新增 spec 验证工厂创建/回收 Worker、连接失败回收、两轮八次 dispose 不泄漏等重要行为，但 benchmarks 项目没有 `test` target：唯一的 `test-git-benchmark` 只匹配 `scripts/git-benchmark-*.spec.mjs`。`pnpm test-all` 的 target 集合里 benchmarks 不含 `test`，`nx affected -t test` 会跳过它。该 spec 只被 typecheck 验了类型，从未被运行——TDD 铁律下测试不可执行等于没写。
- **建议**：给 benchmarks 加 `test` target，或把 spec 移到 `scripts/` 下改 `.mjs`；确认 `test-all` 能覆盖到它。

#### I-6 ai-review 覆盖日志「封存检查」与「追加写入」之间仍有竞态窗口，写断的半行可能粘上本批

- **位置**：`scripts/ai-review/ai-review.mjs`（`appendBatch` / `endsWithNewline`，约 486-528 行）
- **问题**：`endsWithNewline(fd)` 检查与 `writeFileSync(fd, ...)` 是两次系统调用、中间无锁。注释只论证了「窗口内别的进程追加**完整一批**」的场景；若另一个进程恰好写入**半行**（写断），本进程检查时末尾仍有换行、不写封存标记，本批 JSON 粘在半行之后合成一条损坏行——该行之前没有封存标记，此后所有 `readCoverage` 调用硬失败，需人工编辑文件修复。这正是本次变更想消除的故障模式，只是窗口更窄。
- **建议**：读侧放宽（损坏行可拆分时收下可解析片段）；或写侧如实化注释并在报错信息附「删除该行后重跑」的操作指引。

#### I-7 `readCellOrigin` 收紧语义后，宿主经 `startEditCell(col, row, value)` 传入的初始值在表格在场时被完全忽略

- **位置**：`packages/rxdb-model/src/entity-table/editors/cell-origin.ts:22`
- **问题**：新实现把 `getCellOriginValue` 返回的 `undefined` 也当作单元格真实值。修复目标只需要「`null` 不得回退 `ctx.value`」，但 `undefined` 一并收进后，新增行/尚未物化的列这类场景里宿主按 VTable 惯例显式传入的预填值被丢弃，编辑器以空值开始（旧实现 `?? ctx.value` 正是为这条路径服务）。`rxdb-model` 是公共包，三端绑定与仓库外宿主都可能走这条流程；仓库内无 `startEditCell` 调用点可验证，新增 spec 只钉住了 `origin === null` 的用例。
- **建议**：只把「表格明确给出 `null`」当权威值，`undefined` 仍回退 `ctx.value`；或补「表格在场、原始值 `undefined`、宿主传入非空初始值」的用例并写进 TSDoc。

### 建议

#### 核心引擎组

1. **`snapshotPayload` 只过滤顶层关系值**（`packages/rxdb/src/gateway/RxDBTabsGateway.ts:95`）：嵌套在普通对象/json 深处的实体实例仍会让 `postMessage` 抛 `DataCloneError`；patch 只含关系对象、不含外键列时过滤后得到空对象 `{}`，从「抛错可见」变成「静默丢弃」。建议递归过滤或把「仅顶层关系键被移除、外键列必须由调用方携带」写成契约。
2. **`urlJoin` 收尾正则仍改写查询值里的 `/?`、`/&`、`/#`**（`packages/utils/src/string/urlJoin.ts:141`）：`urlJoin('http://x.com', '?next=/a/&b')` 得到 `next=/a&b`，消费方按 `&` 切分会多出参数，与本次 TSDoc「查询串原样保留」的承诺不完全一致。建议把替换范围收敛到路径与查询串连接处。
3. **`resolveSafeConstants` 行为收紧的报错可操作性**（`packages/rxdb-client-generator/src/cli/analyze-file.ts:187`）：import 解析失败的工程从「静默生成」变「报错」，建议错误信息覆盖「import 解析失败」这一成因。
4. **`SchemaManager.#register_generated` 重入静默沿用旧类**（`packages/rxdb/src/schema/SchemaManager.ts:355`）：断连重连或应用升级后生成器交回结构不同的同名新类会被静默丢弃、无告警。建议元数据不相等时告警或走迁移通道。
5. **`#lacks_where_columns` 不核对 orderBy 列**（`packages/rxdb/src/repository/QueryManager.ts:558`）：CREATE 负载缺排序列时行按 `undefined` 参与排序、顺序错到下一次整查。建议把 orderBy 顶层 field 并入核对集合。
6. **`#remember_versions` 先解析 `updatedAt` 再判实体类型**（`packages/rxdb/src/repository/QueryManager.ts:516`）：每个 QueryManager 对所有事件实体先 `new Date` 解析再做类型过滤，实体多、事件频繁时是无谓开销。建议交换两行顺序，语义不变。

#### 存储适配器组

1. **`locateFile` 按函数引用参与加载指纹后，内联闭包每次都绕过模块级 WASM 缓存**（`packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts`）：语义上是正确取舍（测试也刻意钉住），但代价未文档化。建议在 TSDoc/README 注明「必须传模块级稳定引用才能命中缓存」。
2. **批量回填「空提交」回退分支没有直接用例**（sqlite-core 与 pglite 的 `rxdb_adapter_mutations.ts`）：同 id 不同实例命中时按空 submitted 走 `applyWriteResult`，该分支近乎不可达，语义依赖核心实现。建议补一条用例钉住干净实体回填后 `modified === false`，或直接改调 `applyExternal`。
3. **批量 UPDATE 跳过判定两后端口径不一**（sqlite-core `rxdb_adapter_mutations.ts` 只判未归一 patch 是否空）：非空但归一后为空的 patch（如只动只读字段）在 sqlite-core 会整批 `saveMany` 抛内部错误，PGlite 侧已改为按归一结果判空并注释了动机。建议 sqlite-core 同步。
4. **事务重排注释表述不精确**（`packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts`）：一致性理由只归给 `BEGIN IMMEDIATE` 的写锁；回退 `BEGIN;`（deferred）的客户端同样由事务内读持有的 SHARED 锁保证，注释建议补一句。

#### 框架绑定与应用组

1. **三端 demo 逐字拷贝 `generator-state.ts` 与 `remote-cache-object-urls.ts` 各三份、无一致性门禁**：后续单端小修会静默漂移。建议上移共享模块或补三份一致的对照 spec。
2. **React `useInfiniteScroll` 查询身份切换的 PENDING 窗口里 `loadMore()` 会短暂按旧查询开订阅**（`packages/rxdb-react/src/useInfiniteScroll.ts`）：无泄漏、无错值，只是瞬时无效订阅。建议 `loadMore`/`refresh` 开头加与 `settled` 同判据的查询身份守卫。
3. **三端 board-restore e2e 按 Playwright 错误文案过滤「执行上下文销毁」**：文案是内部实现细节，版本升级改文案即假失败。建议优先用导航事件表达。
4. **electron-smoke 的预期 404 排除依赖 Chromium 控制台文案精确匹配**：建议放宽为「url 解码后等于探测地址 或 text 含 `app.asar` 与 404」。
5. **`directive-prologue.spec.ts` 用例名与断言相反**（`packages/rxdb-taro/src/__tests__/directive-prologue.spec.ts`）：用例名「文件末尾的指令不需要分号」却断言 `needsSemicolon: true`。建议改名或加注释。

#### 插件、管理壳与基础设施组

1. **`coverage-serve.mjs` 与 `git-stats.mjs` 入口判定未做 realpath**，与同批改动的 `merge-vitest-reports.mjs` 口径不一致：checkout 在符号链接路径（如 `/tmp` → `/private/tmp`）下启动时脚本静默不执行、exit 0。建议三处统一为 `pathToFileURL(realpathSync(process.argv[1])).href`。
2. **`docker/.env.example` 收录 Supabase 官方模板公开默认密钥与弱口令**：本地风险可控，但误带进部署环境等于带公开密钥运行。建议 README 快速开始处补「先改密钥、勿暴露端口」警告（保持与上游模板逐字同步以降低维护成本）。
3. **`merge-vitest-reports.mjs` 的 `closer()` 第三、四条件缺与第一条件的等价性 guard**：可能选中「起点更远但终点更近」的容器，只影响 `borrowHits` 启发式、不算错总数，但偏离「最窄包含区间」语义且无测试。建议补 guard 或注释说明取舍。

## 三、`requirements/reviews/` 评审记录概况

分支新增 160 条 AI 评审记录（RV- 编号），分布在 40 个项目目录（rxdb 27 条、aiao__source 29 条、rxdb-adapter-sqlite-core 11 条等）。状态分布：157 条 `Resolved`、4 条 `Accepted`。

4 条 Accepted（接受不修）均为工具链/基础设施问题：

| 记录 | 标题 | 严重度 |
| --- | --- | --- |
| RV-01a1bb79f59e | CI 新运行检测条件未消费导致无进度熔断持续被重置 | P2 |
| RV-01a1bb9cc424 | 任务转 issue 按局部任务编号去重会吞掉其他 feature 的任务 | P2 |
| RV-01a1bba1e757 | 显式声明的 preset 模板文件缺失时静默丢弃贡献层 | P2 |
| RV-01a1bbd29228 | Docker 首次安装路径未安装 curl 却无条件调用 curl | P1 |

另有两个记录格式小问题：30 条记录 `status` 写成了带引号的 `'Resolved'`，与其余 127 条裸写 `Resolved` 不一致，建议统一（或由 `ai-review.mjs` 归一化时处理）。

## 四、总体评价与建议

**总体质量高。** 四组评审合计 26 条发现中仅 1 条严重，且测试配套极为扎实：每个行为变更几乎都有对应 spec（新增约 25 个测试文件、3000+ 行测试），大量用例是「先钉坏行为再修」的回归测试；三端镜像 spec 齐全；e2e 断言从「标签可见」升级为「内容真实达成」；评审记录与代码修复一一对应、可追溯。

按主题看，本轮修复（连接生命周期、查询管线、草稿保留、命名安全）在核心引擎与适配器组没有严重问题，剩余风险集中在：

1. **三框架对称的既有盲区**：React SSR 共享注册表（S-1）与 Vue/Angular hydration 对齐缺失（I-3）是同一功能的对称性问题，建议合并前至少修掉 S-1——它是长驻 SSR 生产环境可稳定触发的请求崩溃。
2. **修复只落一端的同源问题**：PGlite 加密列明文 DEFAULT（I-1）是 CHANGELOG 声称已修复但实际只修了 sqlite-core 的一侧，且 README 声明与行为不符，建议合并前修复或修正声明。
3. **公开 API 契约变更的文档同步**（I-2）：裸名一律 public 是破坏性变更，需要发布说明。
4. **可执行性门禁**：benchmarks 新增 spec 无执行入口（I-5）违反 TDD 铁律，加一个 `test` target 即可解决。

以上问题均不阻塞分支的整体价值——修复面广、质量高、测试扎实；建议修复 S-1 与 I-1 后合并。

---

*本报告由四组并行评审 agent（核心引擎 / 存储适配器 / 框架绑定与应用 / 插件与管理壳）分组评审后汇总。*
