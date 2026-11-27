# 深度评审报告：`supabase-log-access-baseline` vs `main`

- **评审日期**：2026-11-27
- **分支**：`supabase-log-access-baseline`，基线 `origin/main`
- **范围**：413 个文件（+43105 / −2990 行）
- **方法**：9 路并行评审（核心引擎 / 同步 pull-push / 同步支撑 / supabase 适配器 / history+pglite+sqlite / demo app / dev 脚本+e2e / CI+docker+website / requirements 一致性），每个发现由两名对抗性验证员独立核实（一名核对代码事实与行号，一名核对实际影响与调用点），**两人都确认才保留**；最后跑完整性检查防止漏文件。
- **结论**：确认 23 个问题 —— **6 major、15 minor、2 nit，无 critical**。

## 总体评价

整体质量相当高：API 变更全是向后兼容的加项且带 TSDoc、身份机制全程失败关闭、SQL 构建器无注入面、测试多为真实行为断言而非空壳。主要风险集中在两处：**一处会静默丢关联数据（核心包回归），一处会让同步永久卡死**。

## Major（建议合入前修复）

### 1. 多对多关系静默丢数据 — [relation-cache.ts:440](packages/rxdb/src/entity/relation-cache.ts#L440)（data-loss）

US-228 引入的中间表派生 id 复用逻辑的回归。跨侧「先解绑再重关联」：`owner.tags$.remove(tag)` 后、保存前 `tag.owners$.add(owner)`——`add()` 在 tag 侧缓存和 tag 侧待删集合里都找不到该中间表，进入 `#junction_for` 命中身份缓存里的活实例（`removed=false`）直接复用，但 **owner 侧的 `#remove_junction_set` 仍持有它**。下次保存时 `getNeedRemoveEntities` 把它删掉，而它没有修改、不会重新落库——关联行被删除且不重建，用户无任何报错。改动前这里总是 new 一个新实例（删旧插新，关联得以保留）。

**修复方向**：复用前确认活实例不在任何涉及端点的待删集合中。

### 2. 同步失败时丢弃部分进度，undo 可与已落库数据分叉 — [pull-repository.ts:420](packages/rxdb-plugin-sync/src/pull-repository.ts#L420)（correctness）

`pullCycleUnit` 的 catch 把 `RxDBPartialSyncError` 解包后给每个环成员铺**空进度**，丢掉错误里携带的已提交进度。`fetchAll: true` 多轮拉取时后一轮失败：水位线已推进，但上报空进度 → `SyncManager` 判定 history 未失效 → undo 边界不推进，用户能 undo 回「合并前」内容，与已落库的远端数据分叉。同文件 `pullCascadeNode`（518-529 行）是正确的参照写法，应照它保留 `partialRepositoryProgressOf`。

### 3. 环闭合判定错误导致永久拉取失败 — [pull-cycle.ts:104](packages/rxdb-plugin-sync/src/pull-cycle.ts#L104)（correctness）

`closeCycleReferences` 只看内存里的续拉 `round` 就判定环闭合，但落库事务只写「有 pull 能力且同步开启」的仓库。当可拉成员引用着 `none`（无 pull 能力）或 `RxDBSync.enabled=false` 的环成员时：续拉把它的行并进 round → 判定闭合 → 事务只写可拉成员 → 延迟外键检查失败 → 整批回滚，下次 pull 重演同一序列，**永久失败**，且报的是裸外键错误而非结构化的 `pull-unsupported-member`。

**修复方向**：把无 pull 能力/同步关闭的环成员同样判为 unsupported。

### 4. RLS 自检放行普通视图，可绕过租户隔离 — [RxDBAdapterSupabase.ts:1297](packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L1297)（security）

自检现在对 `relationKind === 'view'` 一律放行。但普通视图（非 `security_invoker`）以视图属主权限执行，任何人只要有视图的 SELECT 权就能绕过底层表的 RLS——正是这个自检存在的目的。实测确认：`rxdb_check_rls` 对普通视图和 `security_invoker` 视图都报 `rlsEnabled=false`，客户端无法区分，不安全的那种被静默放行。

**修复方向**：让 RPC 上报视图的 `security_invoker` 状态（`pg_class.reloptions`），只放行 security_invoker 视图。

### 5. 待推历史清单被 100 行上限截断 — [HistoryManager.ts:960](packages/rxdb-plugin-history/src/HistoryManager.ts#L960)（correctness）

`#fetchPushableHistories` 的 `find()` 没传 `limit`，核心仓储默认归一化为 100。待推变更超过 100 行时清单静默只返回最新 100 行，**清单长度 ≠ 待推计数**，直接违反 `pushableHistories$` 自己 TSDoc 的契约「每次稳定之后长度等于待推数」。同文件其他查询都显式用 `findAll` 或 `MAX_SAFE_INTEGER` 绕开。分支上所有测试（mock 掉了 find，或最多 3 项）都测不到这个规模。

### 6. 分区待拉数与 pull 实际口径不一致 — [check-repository-updates.ts:190](packages/rxdb-plugin-sync/src/check-repository-updates.ts#L190)（correctness）

状态查询的分区路径读进度行时**没有 `remoteBackendId` 过滤**，把旧远端的遗留进度行（`rebindRemoteBackend` 被 `RxDBBucketCleanupBlockedError` 挡住时故意留下的）也算进来。换到新远端后，旧 cursor 通常 ≥ 新 snapshotPoint → UI 报「已全部同步」，而 pull 实际会从头重拉（`bucketed-pull.ts:285` 会检出旧进度重清）；旧 cursor 小时又报幻影待拉数。

## 争议项：团队自己标注的 P1（未处置）

仓库根目录的 [pr-226-review.md](pr-226-review.md) 是评审记录误提交到了根目录（本应放 `requirements/reviews/<package>/`）。它记录了一个 **P1 级跨租户 Realtime 元数据泄露**（统一频道 `rxdb:changes` 向所有 authenticated 客户端广播未分区日志的元数据），处置记录是「**未处置**」，结论是「修复服务端频道授权后再合入」。

验证员确认代码事实全部属实，但对影响有分歧：

- **认为没有扩大读取面**：这些元数据在改动前就经 `rxdb_change` 表对同一批用户可读（改动前无 RLS、GRANT SELECT 给 anon+authenticated），本分支反而收紧了访问（加 RLS、撤 anon、分区频道按 bucket 授权）。
- **认为仍是增量泄露**：被动推送与主动拉取不同，clientId 关联与实时性让任意登录用户可以实时跟踪其他租户的活动。

**需要决策**：要么按记录所述先做服务端频道隔离，要么明确确认「可读面未扩大」的判断并更新处置记录。至少这个文件本身应该移走或删除。

## Minor / Nit（17 条，按区域）

### 同步引擎

- [pull-cycle.ts:115](packages/rxdb-plugin-sync/src/pull-cycle.ts#L115)：闭合续拉没有轮数/总量上限，补不齐时会把整段远端历史拉进内存（O(n²)），最后照样撞外键。
- [pull-cycle.ts:114](packages/rxdb-plugin-sync/src/pull-cycle.ts#L114)（nit）：`Math.max(...fetchedIds)` 在超大数组上有栈溢出风险，同包 `pull-batch.ts:418` 已专门规避过。
- [scoped-sync.ts:225](packages/rxdb-plugin-sync/src/scoped-sync.ts#L225)：指纹规范化用 `localeCompare` 排序键，跨 locale/ICU 版本不稳定，指纹变了会触发整区快照重拉；应改为按码元比较。
- [push-cycle.ts:96](packages/rxdb-plugin-sync/src/push-cycle.ts#L96)：只有复合外键构成的环不并组，互相引用的行可能拆进两批，这类环永远推不上去。
- [entity-manager.ts:591](packages/rxdb/src/entity/entity-manager.ts#L591)：中间表解析为 QueryCache 时 `create() → mutations() → #mutations_query_cache → create()` 无限递归直到栈溢出（库级 QueryCache 配置下触发，报 RangeError 而非可读配置错误）。

### supabase 适配器

- [RxDBAdapterSupabase.ts:1491](packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L1491)：auth 事件回调在 `connect()` 从未调用时也会起 realtime 订阅并派发 EntityRemote 事件，绕过了 RLS 自检，违反适配器自己的「订阅只由 connect() 发起」不变式。
- [pushable-histories.spec.ts:104](packages/rxdb-adapter-pglite/src/__tests__/pushable-histories.spec.ts#L104)（test-quality）：清单=待推数的用例只在 0~3 项规模验证，截断回归（major #5）永远测不到。

### demo app

- [demo-session.ts:49](apps/dev-rxdb-supabase/src/app/demo-session.ts#L49)：切换身份在「注册成功但加入租户失败」时，会话已换但「会话已换」提示被抑制窗口吞掉，页面停在旧身份库且无恢复提示条。
- [history-actions.ts:84](apps/dev-rxdb-supabase/src/app/history-actions.ts#L84)：重做被分支继承拦住时，原因错误报成「没有可重做的修改」（undo 侧同样场景会如实报）。
- [app-header.ts:176](apps/dev-rxdb-supabase/src/app/app-header.ts#L176)（nit）：同步中心开关缺 `aria-controls`，与商品/订单页面板开关不对称。

### dev 脚本与 e2e

- [dashboard.mjs:43](apps/dev-rxdb-supabase/scripts/dev/dashboard.mjs#L43)：起始页给出的远端 e2e 命令缺 `BASE_URL` 和 `--excludeTaskDependencies`，恰在它唯一可见的上下文（dev 链运行中）会挂起；README 里的正确变体没同步过来。
- [remote-sync.spec.ts:301](apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts#L301)：身份守卫用例监听 `/rest/v1/rpc/rxdb_mutations`，而拉取走的是 `rxdb_change` 端点，「一个请求都不发」是恒真断言，抓不住守卫回归。
- [check-ports.mjs:22](apps/dev-rxdb-supabase/scripts/dev/check-ports.mjs#L22)：端口探测没有连接超时（防火墙丢 SYN 时挂 ~75 秒），白名单外的错误码直接报误导性失败。

### CI / docker

- [docker-compose.ci-studio.yml:60](docker/docker-compose.ci-studio.yml#L60)：Studio 的 `SUPABASE_PUBLIC_URL` 回退值 54331 在隔离栈（Kong 端口动态分配）上永远不对，直连 REST 全部失败。

### requirements 漂移

- [US-225-supabase-sync-protocol-access-baseline.md:94](requirements/stories/adapter/US-225-supabase-sync-protocol-access-baseline.md#L94)：AC#14 描述「首次打开自动匿名登录」，但 epic-015 起 demo 打开是访客、匿名登录是手动操作，Done 故事与实现不符。
- [epic-004-future-features.md:70](requirements/epics/epic-004-future-features.md#L70)：US-217 列表项被吞进 US-028 一行，渲染后从故事列表消失。
- [epic-006-working-tree-commits.md:375](requirements/epics/epic-006-working-tree-commits.md#L375)：trusted-write 登记表 5/14 行行号过期，其中一行是本分支自己改的 `undo-redo-apply.ts` 造成的。

## 各区域总体印象

- **rxdb 核心**：US-228/US-035/US-316 实现质量高，身份机制失败关闭，测试有独立黄金向量与真实并发竞争场景——但中间表复用是实打实的数据丢失回归。
- **同步插件**：环调度（US-038）是主要风险区，两个 major 都在这里；其余拓扑/清理算法经验证是可靠的。
- **supabase 适配器**：SQL/RLS 分层清楚、51 个测试扎实；唯一安全问题是视图豁免这个边界。
- **history/pglite/sqlite**：SQL 构建器注入面不存在，唯一实质缺陷是 100 行截断。
- **demo app / e2e / 脚本**：signals + OnPush 干净、脚本测试用真实进程和端口，无 major。
- **CI/docker/website**：SQL 幂等、权限分层清楚、53 条回归测试与文档咬合，仅 Studio 端口一处。
- **requirements**：三个机器检查门（api-surface、baseline、链接检查）全过，剩余是 3 处文本级漂移。

## 修复优先级建议

1 → 3（数据丢失 + 永久卡死）先修，然后 4（安全）、2（undo 分叉）、5（截断）、6（口径）。
