# 评审：epic-015、US-033 与 US-225（按身份授权的同步）

| 项       | 内容                                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 评审对象 | [epic-015](requirements/epics/epic-015-identity-scoped-sync.md)、[US-033](requirements/stories/core/US-033-identity-scoped-read-sync.md)、[US-225](requirements/stories/adapter/US-225-supabase-sync-protocol-access-baseline.md) 及其[验收记录](requirements/stories/adapter/US-225-evidence.md) |
| 快照     | 分支 `supabase-log-access-baseline` 的 `26521c24`，对比 `origin/main` 的 `37149348`。本地 `main`（`160f7930`）落后一个提交（#227），所以不按它比                                                                                                                                                  |
| 日期     | 2026-11-19                                                                                                                                                                                                                                                                                        |
| 评审者   | Claude（`claude-fable-5-2`），Claude Code 会话                                                                                                                                                                                                                                                    |
| 方法     | 通读三份需求；把其中的论断对到参考 SQL、同步插件、Supabase 适配器与核心契约的源码；拿不准的数据库行为在本检出位的隔离测试栈上实测（事务内建临时对象后回滚）；跑 `node scripts/audit/requirements-consistency.mjs`（通过）                                                                         |
| 没做的   | US-225 的 20 条 AC 没有重跑，只抽查了权限状态；外部产品的文档没能联网核对                                                                                                                                                                                                                         |

下文每条结论标注**实证**（读了源码或跑了命令，命令见文末「复验」）或**推断**（由需求文本与现状推出，尚无实现可测）。

评审之后已按文中的顺序改了需求，改动记在文末「处理记录」。正文描述的仍是评审时的快照，其中的 AC 编号是改写之前的。

## 结论

| 问题             | 结论                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| 是否可行         | US-225 可行且已落地。US-033 技术上做得出来，但有 5 处要在阶段 A 之前解决，否则验收会失败或失真                        |
| 是否有更好的方案 | 有。分区日志只记「哪个区的哪一行变了」，正文在拉取时按调用者身份从业务表读。epic 已把它列为远期目标，建议提前做成底座 |
| 是否有优化空间   | 有。先把「每个身份一个库」拆出去交付；冻结 epic 的 4 条待定决策后再进阶段 A；补齐分阶段格式                           |

逐份判定：

- **US-225**：🟢 好。只有一处文档缺口。
- **epic-015**：✅ 方向值得做（按授权分区、授权与筛选分开、每个身份一个库）。正文需要按主题重排。
- **US-033**：⚠️ 需澄清后再开工。

## 一、是否可行

### US-225

需求写法完整：修复前症状带代码引用，20 条 AC 各有证据入口，验收记录里有红、绿和一次变异。抽查与需求一致（实证）：隔离栈上 anon 对 `rxdb_change` 没有读权限，authenticated 有。

一处缺口（实证）：分支 ID 在一个后端里全局唯一，而且由人起名，[分支文档](website/docs/collaboration/branch.md)的示例是 `createBranch('feature-1')`。[`rxdb_claim_branch`](docker/sql/02-rxdb-sync-functions.sql) 让第一个登记或推送的人成为所有者，之后别人得到 `rxdb: branch … belongs to another user`。于是两个正常用户起了同名分支，后推的一方被拒；任何已登录用户（含匿名登录）也可以先把常见的名字登记掉。

AC#6 把拒绝当作预期行为，这没有问题，但[适配器文档](website/docs/adapters/supabase.md)的「非 main 分支按所有者写入」一节没有提醒。建议在该节写明：分支 ID 全库唯一、先到先得，起名带用户前缀或随机后缀；被占用时只能由管理员改 `rxdb_branch_owner`。

### US-033 成立的前提

- **生成列的写法可用（实证）。** 需求里的 `CASE WHEN visibility = 'public' THEN 'public' ELSE 'tenant:' || tenant_id END`，在 `tenant_id` 为 `uuid` 或 `text` 时都能建成 `STORED` 生成列。
- **快照点的推理成立（实证）。** [`rxdb_change_serialize_append`](docker/sql/02-rxdb-sync-functions.sql) 在语句级 `BEFORE INSERT` 触发器里取事务级咨询锁并持有到提交，日志 id 顺序等于提交顺序。所以「先读已提交的最大 id，再拉快照，再从该 id 增量」不会漏行。
- **「停下 + 显式改绑」有现成做法（实证）。** 见 [`RemoteBackendMismatchError`](packages/rxdb-plugin-sync/src/remote-backend.ts) 与 `rebindRemoteBackend()`。
- **按库内数据在连接期拒绝连接有先例（实证）。** [`UnclaimedRxDBCapabilityError`](packages/rxdb/src/system/capability-watermark.ts) 复用的正是 `rxdb_migration` 水位行。

### 阶段 A 之前要解决的 5 处

#### 1. 条件一变就重新对账，滚动时间窗口会每次同步都全量重拉

需求（「实体同步规则筛选」）：

> 进度与条件指纹绑定。指纹只说明条件变了，说明不了是放宽还是收窄，所以条件一变，就按新条件重新对账受影响的「区 × 实体」

现状（实证）：[同步文档](website/docs/collaboration/sync.md)给 `remote.filter` 的标准示例是滚动时间窗口，并写明「每次 pull 时都会重新执行」：

<!-- prettier-ignore -->
```ts
filter: () => ({
  combinator: 'and',
  rules: [{ field: 'updatedAt', operator: '>=', value: subDays(new Date(), 30) }]
})
```

后果（推断）：这类实体每次同步求出的边界值都不同，指纹每次都变，于是每次同步都按区重拉全量快照，增量失去意义。指纹又不能简单地忽略取值：AC#7 的「近 30 天改成近 60 天」同样只是取值变了，却必须补拉。

建议：

- 进度行里存上一次的规则原文，不只存指纹。
- 形状相同、只有比较边界朝收窄方向移动时（`>=` / `>` 的值变大，`<=` / `<` 的值变小），判为纯收窄：不重拉快照，只在本地清掉不再匹配的行。
- 其余变化才重新对账，包括 AC#7（边界朝放宽方向移动）与 AC#19（换分类）。
- 补一条 AC：规则没改、只是时间流逝时，同步不触发快照重拉。

#### 2. 同一条筛选在仓库里已有两套语义不同的服务端求值器

需求把下面这句定为全部 AC 的对照基准，并要求客户端自己判断行是否离开条件（技术笔记「自动清理」：「拉到的每条变更按规则判断修改后的行是否仍匹配」）：

> 同步完成后，本地可见的行与字段必须等于服务端以该身份、同一筛选重新查询业务表的结果

现状（实证）：同一条 `RuleGroup` 在服务端已有两套求值器，NULL 语义不同。

| 求值器                                                                                                                     | 用在哪                                                         | 字段为 NULL 时 `!= 'x'`、`notIn ['x']` |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| [`rxdb_jsonb_matches_rule`](docker/sql/02-rxdb-sync-functions.sql)，`!=` 实现为 `IS DISTINCT FROM`                         | `rxdb_pull_changes` 在日志的 `beforeData` / `afterData` 上筛选 | 命中                                   |
| [`normalize_field_filter`](packages/rxdb-adapter-supabase/src/rule_group_builder.ts)，翻译成 PostgREST 的 `neq` / `not.in` | 仓储查询业务表                                                 | 不命中（SQL 三值逻辑）                 |

后果（推断）：今天筛选只用来少拉数据，`pullChanges` 的注释写明它「不是行级隔离边界」，多拉无害。US-033 把筛选结果定成验收基准，还要加第三套（客户端）求值器，却没有规定快照、增量、清理和对照查询各用哪一套。只要其中两处不同，带 NULL 的行就会让「本地等于服务端重查」不成立。

建议：在需求里指定唯一的求值语义，以业务表上的 SQL 比较为准。其余入口要么复用它，要么共用一组一致性用例（NULL、大小写、日期边界），逐个入口跑。第二节的方案能把同步路径上的服务端求值收成一处。

#### 3. `rxdb_change` 没开 RLS，初始化脚本里还有一行关闭

需求（「读授权」）：

> 带分区的日志行只对能读该区的身份可见，anon 能读公开区

现状（实证）：

- 隔离栈上 `rxdb_change` 的 `relrowsecurity = false`。
- [01-rxdb-system-tables.sql](docker/sql/01-rxdb-system-tables.sql) 里有 `ALTER TABLE IF EXISTS public.rxdb_change DISABLE ROW LEVEL SECURITY;`。
- [生产权限脚本](docker/sql/production/rxdb-change-grants.sql)只做 GRANT 与 REVOKE，不开 RLS。
- [init-db.sh](docker/init-db.sh) 的加载顺序是 01、02、03、04，最后才是生产权限脚本。

后果（推断）：anon 要经 `SECURITY INVOKER` 的拉取读公开区，就得重新拿到 `rxdb_change` 的表级读权限，此后 RLS 是 anon 与全部日志之间唯一的屏障。开启 RLS 的语句只要排在 01 那一行之前执行（写进 01 靠前的位置，或某次单独重跑 01），就会被关回去，回到 US-225 修掉的症状 1。

建议：

- 范围里写明删除 01 的这一行，开启 RLS 的语句放在最后执行的脚本里。
- 是否加 `FORCE` 取决于写日志的属主角色有没有 `BYPASSRLS`，在阶段 A 定。
- SQL 回归加断言：任一受支持的执行顺序之后 `relrowsecurity` 为真，且 anon 直接 `SELECT` 读不到非公开区的行。

#### 4. 旧拉取路径读分区实体的行为没有定义

需求（AC#18）只规定了旧协议的推送与通知：

> 推送被拒，不写任何日志、不回落到共享日志；全局频道里没有该实体的通知

现状（实证）：没有筛选时，适配器的拉取不走 RPC，直接读表。[`pullChanges`](packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)：

<!-- prettier-ignore -->
```ts
let query = this.#client
  .from('rxdb_change')
  .select('*')
  .gt('id', sinceId)
```

`pullChangesBatch` 与 `getChangeCount` 相同。

后果（推断）：如果分区日志与旧日志同表、靠 RLS 裁剪，旧客户端（或没把该实体配成分区同步的新客户端）拉到的是按区裁过、却只有一个游标的流。后加入的区里 id 小于游标的行永远拉不到，退出的区不清理，全程不报错。epic 目标 2 禁止「声明了隔离而后端不具备」时静默降级，这是它的镜像情形。

建议：AC#18 增加一行「拉取已登记的分区实体」。

- 旧版本客户端：读不到该实体的任何日志。零行好过半截数据。
- 新版本客户端：连接时核对客户端与服务端对「哪些实体走分区」的认识，不一致即报错。

实现上最省事的是分区日志单独成表，见第二节。

#### 5. AC#21 的落点与核心包的改动没有交代

需求：

- AC#21：「打开即报身份不匹配，查询拿不到 A 的任何行；本地数据不动」。
- 技术笔记：「不新增核心导出（核心命名门禁）；身份绑定优先复用 `rxdb_migration` 水位行」。
- 实现文件只列了 `docker/sql/`、`packages/rxdb-plugin-sync/`、`packages/rxdb-adapter-supabase/`、`website/docs/`。

现状（实证）：

- 现有的同类守卫 [`assertRemoteBackend`](packages/rxdb-plugin-sync/src/remote-backend.ts) 只在与远端交换数据之前比对，不拦本地查询。
- 插件 `install()` 抛错会让 `connect()` 失败（[`IRxDBPlugin.install`](packages/rxdb/src/rxdb-plugin.ts)）。但 [`RxDBPluginSync`](packages/rxdb-plugin-sync/src/plugin.ts) 只声明 `inject = ['plugin:history']`，并在注释里说明刻意不依赖适配器。
- 远端适配器契约 [`RxDBAdapterRemoteBase`](packages/rxdb/src/rxdb-adapter.ts) 在核心包。

后果（推断）：要让本地查询也拿不到行，守卫必须在连接期生效。这要求它能读本地库，并且在离线时知道当前身份，两件事需求都没交代从哪来。另外按区拉取、按区快照、查询调用者能读的区、报告当前身份，这些方法都要进远端适配器契约，核心包与 API 基线必然改动。

建议：

- 写明守卫的位置（连接期，仿能力认领水位）。
- 写明当前身份的来源：应用在配置里传入，还是适配器从本地会话读。
- 把 `packages/rxdb/` 加进实现文件，并标注要过 API 基线。
- HTTP 等其他远端适配器是否实现同一契约，也在这里定。

### 需要补进需求的缺口

1. **建模约束没写（实证）。** 生成列不能引用其他表，实测报 `cannot use subquery in column generation expression`。子表必须自己带租户键和可见性字段；父行由公开改私有时，子行要逐行更新才会换区。另外一行只能属于一个区，「同时共享给两个团队」表达不了。文档（AC#15）应写明。
2. **`rxdb_bucket` 会进日志正文（实证）。** 触发器用 `to_jsonb(NEW)` 记录正文，实测结果带着生成列。要么在触发器里剔除，要么把它定义成行的一部分，并用用例钉住客户端落库的行为。
3. **AC#20 只防迟到的「移除」（推断）。** 设想行从区 1 换到区 2，再换回区 1。区 2 的一页在换回之前取到，却在区 1 的新版本之后落库，旧正文就会盖掉新版本。随后区 2 的「移除」按来源区匹配，把这一行删掉，而区 1 已经没有后续变更可以补回。规则应统一为「日志 id 大于本地版本才应用」，对写入和移除都生效，并补这条对称用例。
4. **AC#22 的后半条无法按字面验收（推断）。** 「远端把 A 移出该区，之后旧响应才到」要求丢弃旧响应，但客户端在下一轮同步之前不知道自己被移出，而「撤权的即时性」又写在范围外。应改成本地判定：每轮同步开始时取一次可读的区并记下轮次，落库前核对本轮没有被更新的轮次取代。
5. **往返次数没有上限（推断）。** 带筛选的拉取现在限定单实体，否则报 `pullChanges: a row-level filter requires exactly one repository scope`。照此形状，每个区、每个实体各一次往返：5 个区、20 个实体，每轮同步 100 次请求，没有变化也要发。阶段 A 应把按区拉取设计成一次请求带多组（区、实体、游标）。
6. **owner 的目标没有 AC 覆盖（实证加推断）。** epic 的立项目标是「没登录的用户能看到全部公开数据」，决策 7 却规定公开区只同步规则选中的一部分。同一实体的同步类型互斥：[`RepositorySyncType`](packages/rxdb/src/sync-contract/sync-type-utils.ts) 是单值，`filter` 与 `querycache` 二选一。其余公开行怎么在线浏览，US-033 没有 AC。要么补一条，要么在范围外写明由哪个故事负责。

## 二、是否有更好的方案

### 建议：分区日志不带正文，正文按调用者身份从业务表读

epic 的目标「区内细分的权限」已经写了这个形状：

> 日志只标记哪个区的哪一行变了，正文按当前身份从业务表批量读取

US-033 把它排在后续故事，首版先做「日志带正文、按区由 RLS 裁决」。建议反过来，首版就不带正文。

做法如下，要先经阶段 A 的试验验证，不是定稿：

- 分区实体的日志行只有元数据：日志 id、区、实体、行 id、操作（写入或移除）。
- 按区拉取是一个 `SECURITY INVOKER` 函数。它取该区该实体游标之后的日志行，按行 id 去重、留最大的日志 id，再与业务表连接。连接受调用者的 RLS 与列权限约束，并附加 `rxdb_bucket = 该区` 与实体同步规则。
- 连得上，返回当前行。连不上（已删除、已换区、不可见或不再匹配），返回「移除」。
- 快照就是同一个连接去掉游标条件。

| 首版方案要承担的                                                                                                                      | 不带正文之后                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 行换区时，在业务事务里把旧区的历史日志正文置空（AC#5、#17）。事务此时还持有全库的日志追加锁，批量把数据从公开改私有时所有写入都得排队 | 不需要，日志里没有正文                                                                       |
| 有列级授权的实体拒绝登记（AC#16）                                                                                                     | 直接支持，列权限由业务表裁决                                                                 |
| 快照读业务表，增量读日志正文，靠「区内可见范围一致」的约定保证两者等价                                                                | 同一条读路径，天然等价                                                                       |
| 快照与增量的筛选可能落在不同的求值器上，行离开条件靠客户端判断（问题 2）                                                              | 快照与增量走同一个函数、同一套求值；行因修改而离开条件时由服务端返回「移除」，客户端不必求值 |
| 已删除的行、被覆盖的旧值留在区日志里。后加入该区的成员把游标设为 0 直接调用拉取就能读到，需求只在行换区时抹正文                       | 日志里没有可读的内容                                                                         |
| 一行改 100 次，拉 100 条                                                                                                              | 只取当前值                                                                                   |
| `rxdb_bucket` 混进日志正文（缺口 2）                                                                                                  | 不存在                                                                                       |

不变的部分：分区生成列、`rxdb_caller_buckets()`、按区游标、加入拉快照、退出整块删除、来源区与版本规则、幂等推送、日志 id 等于提交顺序。实体同步规则本身被改写时仍要重新对账（问题 1），与仓储查询之间的 NULL 语义仍要对齐（问题 2），这两点两种方案相同。

代价：

- 每页多一次按主键的连接。
- 客户端拿不到逐条 patch。只读故事用不上；US-034 做冲突裁决时要另定基线，例如上次同步到的行。
- 拉取必须走新函数，不能像现在这样直接读表。

它和设计评审否掉的方案不是一回事。被否掉的是「以身份直读业务表再对账」，理由是只覆盖查过的范围、加入退出租户要全量对账、每次同步拉回全部元数据、Supabase 下不能写远端（US-033 技术笔记第一条）。这里保留了分区日志与推送通道，增量仍只取变更过的行，四条都不适用。原始设计稿的同步规则表也是这个分工：「业务表直读走该表 RLS，changelog pull 走单独授权的 change-feed」（`git show dded3edc:redesign.md`）。

### 两个次级选择

**分区日志单独成表。** 首版方案要给 `rxdb_change` 加分区列、开 RLS、把 anon 的读权限放回来，旧日志靠「分区列为空」区分。单独一张表可以让 `rxdb_change` 保持 US-225 的状态：

- AC#14「旧行为不变」不需要另外证明。
- 问题 3 的屏障只落在新表上，anon 仍然碰不到旧表。
- 问题 4 里旧路径读不到分区实体的任何日志。

**`rxdb_caller_buckets()` 的扩展点。** 需求说「平台默认给 `public` 与 `user:<auth.uid()>`，应用按自己的成员表补上租户区」，没说怎么补。如果做法是应用 `CREATE OR REPLACE` 这个函数，[迁移指南](website/docs/migration/supabase-sync-access.md)的升级步骤会重跑 02，应用的版本就被盖回默认值（推断）。失败方向是拒绝而不是泄露，但后果不小：租户区从返回值里消失，每个客户端下一次同步都会按「退出该区」整块删掉本地数据。建议平台函数固定，内部调用应用登记的函数或约定的成员视图。

### 参照

PowerSync 的 bucket 是同一类设计（凭记忆，本次没能联网核对其文档）。定「重新对账的代价上限」和日志保留策略之前，可以对照它怎么做日志压缩、校验和，以及游标过期后的重拉。

## 三、优化空间

1. **把「每个身份一个库」拆出去先交付。** 阶段 C（AC#10～13、#21）不依赖分区协议。它解决的是今天就存在的症状：「同一个本地库换了身份，上一个账号同步下来的行仍在本地」。[CONVENTIONS](requirements/CONVENTIONS.md) 规定「一段工作只有在具备自己的用户价值、自己的前置和自己的关闭条件时才新开编号」，它三样都有，应该单独编号。
2. **冻结待定决策后再进阶段 A。** 有三个事实放在一起看：
   - US-033 当天改了三版。先是 11 条 AC、勾了 Small「一个 PR」（`68882ed7`），再到 15 条、四个阶段（`64555bbc`），最后 22 条（`26521c24`）。
   - 状态一直是 In Progress，CONVENTIONS 对它的定义是「正在实现」，而本分支没有任何实现：`docker/`、`packages/`、`apps/`、`website/docs/` 里搜不到 `rxdb_bucket` 或 `rxdb_caller_buckets`。
   - epic 的 4 条「待冻结的决策」都还开着。其中首批实体、重新对账的代价上限、授权代次的来源，直接决定阶段 A 的 SQL 形状。

   CONVENTIONS 的判据是「病灶数 ≥ 抽象数」。US-033 的现状列了 3 个病灶，新增抽象有 14 个：分区生成列、`rxdb_caller_buckets()`、分区实体登记、日志的分区 RLS、按区快照函数、按区拉取函数、换区时抹历史正文、按区进度表、行的来源区与版本、条件指纹、重新对账、自动清理、身份绑定、库名工具。建议先用一次只验证 SQL 形状的试验回答「日志带不带正文」和「是否单独成表」，再定 AC。

3. **补齐分阶段格式。** CONVENTIONS 的「大故事分阶段」是硬规则：阶段完成度写在「交付阶段」表的状态列，AC 表按阶段分段编号，实现文件表加「阶段」列。US-033 三项都缺：
   - 阶段表没有状态列。
   - AC 是 1～22 平铺，AC#1、#5、#17、#22 同时属于两个阶段，单个阶段无法独立关闭。
   - 实现文件是不分阶段的列表。

   审计脚本只比对分阶段故事的清单，所以没拦住。可对照 [US-218](requirements/stories/adapter/US-218-supabase-rls-push-integrity.md)。

4. **epic 正文按主题重排。** 「已拍板的方向」按三轮评审的先后排列，并写着「第 1、7 条已被设计评审改写，原结论见 git 历史」；第 2、8、11 条在讲同一件事，第 1、10 条也是。CONVENTIONS 要求「文档只写当前结论」。建议合并成四组：授权模型、同步协议、本机隔离、范围边界。References 引用的 `redesign.md` 已在 `3855b58e` 删除，应改成带提交号的引用。
5. **评估日志 id 的位宽。** `rxdb_change.id` 是 `serial`（实测为 `integer`），拉取函数的 `p_since_id` 与本地的 `RxDBSync.lastPullRemoteChangeId` 也是整型。分区之后换区一次写两条，id 还要当每行的版本号。给日志加列或建新表时一并评估 `bigint`。

## 建议的处理顺序

1. 把阶段 C 拆成独立故事，先做。
2. 用一次 SQL 试验定两件事：分区日志带不带正文，是否单独成表。
3. 按结果改写 US-033：解决第一节的 5 处问题，补 6 个缺口，AC 按阶段分段。
4. 冻结 epic 的 4 条待定决策，重排「已拍板的方向」。
5. 给 US-225 的适配器文档补上分支命名的提醒。

## 复验

需求一致性审计：

```bash
node scripts/audit/requirements-consistency.mjs
```

数据库行为在隔离测试栈上实测（PostgreSQL 17.6，镜像 `supabase/postgres:17.6.1.136`）。先用 `pnpm nx run rxdb-adapter-supabase:test-env` 起栈，再把下面的 SQL 存成文件，从标准输入传给 db 容器（`docker ps` 里名字以 `rxdb-supabase-db-` 开头的那个）：

```bash
docker exec -i <db 容器名> psql -U postgres -d postgres -At < <存下来的 SQL 文件>
```

建表都在事务里并回滚，不留对象：

```sql
-- 1. 生成列：需求里的表达式，tenant_id 为 uuid
BEGIN;
CREATE TEMP TABLE t_uuid (id int, visibility text, tenant_id uuid,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'tenant:' || tenant_id END
  ) STORED);
ROLLBACK;

-- 2. 生成列不能引用其他表
BEGIN;
CREATE TEMP TABLE parent (id int PRIMARY KEY, tenant_id text);
CREATE TEMP TABLE child (id int, parent_id int,
  rxdb_bucket text GENERATED ALWAYS AS (
    (SELECT 'tenant:' || p.tenant_id FROM parent p WHERE p.id = parent_id)
  ) STORED);
ROLLBACK;

-- 3. AFTER 触发器里的 to_jsonb(NEW) 带着生成列
BEGIN;
CREATE TEMP TABLE t_trg (id int, visibility text, tenant_id text,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'tenant:' || tenant_id END
  ) STORED);
CREATE FUNCTION pg_temp.show_new() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RAISE NOTICE 'NEW=%', to_jsonb(NEW); RETURN NEW; END $$;
CREATE TRIGGER t_trg_after AFTER INSERT ON t_trg
  FOR EACH ROW EXECUTE FUNCTION pg_temp.show_new();
INSERT INTO t_trg (id, visibility, tenant_id) VALUES (1, 'private', 't1');
ROLLBACK;

-- 4. 筛选的 NULL 语义：日志求值器与 SQL 比较
SELECT public.rxdb_jsonb_matches_rule('{"a":null}'::jsonb,
  '{"field":"a","operator":"!=","value":"x"}'::jsonb);
SELECT public.rxdb_jsonb_matches_rule('{"a":null}'::jsonb,
  '{"field":"a","operator":"notIn","value":["x"]}'::jsonb);
SELECT NULL::text <> 'x', NOT (NULL::text IN ('x'));

-- 5. 日志表的 RLS 状态、id 类型与读权限
SELECT relrowsecurity, relforcerowsecurity FROM pg_class
  WHERE oid = 'public.rxdb_change'::regclass;
SELECT format_type(atttypid, atttypmod) FROM pg_attribute
  WHERE attrelid = 'public.rxdb_change'::regclass AND attname = 'id';
SELECT has_table_privilege('anon', 'public.rxdb_change', 'SELECT'),
       has_table_privilege('authenticated', 'public.rxdb_change', 'SELECT');
```

本次得到的结果：

| 实测                                              | 结果                                                         |
| ------------------------------------------------- | ------------------------------------------------------------ |
| 1. 需求里的表达式建生成列，`tenant_id` 为 `uuid`  | 成功                                                         |
| 2. 生成列用子查询引用父表                         | `ERROR: cannot use subquery in column generation expression` |
| 3. `to_jsonb(NEW)`                                | 含 `"rxdb_bucket": "tenant:t1"`                              |
| 4. 日志求值器，字段为 NULL，`!= 'x'`              | `true`                                                       |
| 4. 日志求值器，字段为 NULL，`notIn ['x']`         | `true`                                                       |
| 4. SQL 比较，同样两种情形                         | 都是 `NULL`，行被排除                                        |
| 5. `relrowsecurity` / `relforcerowsecurity`       | `false` / `false`                                            |
| 5. `rxdb_change.id` 的类型                        | `integer`                                                    |
| 5. anon / authenticated 对 `rxdb_change` 的读权限 | `false` / `true`                                             |

## 处理记录

2026-11-19，分两轮改了工作区：第一轮按「建议的处理顺序」，第二轮按 owner 的答复（见本节末尾）。`node scripts/audit/requirements-consistency.mjs --check` 通过（143 条故事）。下文的 AC 编号是改写之后的。

### 改了哪些文件

| 文件                                                                                             | 改动                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-035](requirements/stories/core/US-035-identity-bound-local-database.md)（新）                | 每个身份一个本地库，从 US-033 的阶段 C 拆出，Backlog，11 条 AC                                                                                    |
| [US-036](requirements/stories/core/US-036-browse-public-data-outside-sync-rule.md)（新，第二轮） | 规则之外的公开数据在线浏览：只读浏览实体走 QueryCache，Backlog，6 条 AC                                                                           |
| [US-033 的试验记录](requirements/stories/core/US-033-bucket-log-spike.md)（新）                  | SQL 试验的方案、结果、量级与脚本                                                                                                                  |
| [US-033](requirements/stories/core/US-033-identity-scoped-read-sync.md)                          | 按试验结论重写：日志不带正文、单独成表；阶段 A～C，27 条 AC 按阶段分段。第二轮：状态改回 Backlog，筛选求值定为编译成 SQL 条件，验收用测试夹具实体 |
| [epic-015](requirements/epics/epic-015-identity-scoped-sync.md)                                  | 「已拍板的方向」按四个主题重排；目标的认领关系、故事清单、待冻结的决策、References 相应更新                                                       |
| [适配器文档](website/docs/adapters/supabase.md)                                                  | 「非 main 分支按所有者写入」一节补上分支 ID 全库唯一、先到先得的提醒                                                                              |
| `requirements/roadmap.md`、`requirements/status-overview.md`、根目录 `README.md`                 | 派生视图：计数由脚本重新生成，批次 8 手工加上 US-035 与 US-036                                                                                    |

### 试验的结论

脚本与完整结果见[试验记录](requirements/stories/core/US-033-bucket-log-spike.md)。两套日志挂在同一张业务表上逐个场景对比：

- **日志不带正文成立。** 按身份分区读取、成员关系变化、行换区、删除、行离开规则，结果都对。带正文的方案里，anon 从公开区的日志读到了业务表没授给它的成本列，后加入的成员读到了已删除的行与被覆盖的旧值；不带正文的方案里这些都读不到。
- **单独成表成立。** 全部写入之后 `rxdb_change` 没有新增任何行，anon 仍无读权限。
- **第二节的一个推断要修正。** 「每页多一次按主键的连接」不是自动成立的：第一版写成半连接，规划器对业务表做了全表扫描，2 万行的区改 1000 行要 192 ms；改成逐行按主键取之后是 10 ms。这条已经写成 US-033 的 AC#11。
- **筛选口径没有因此解决。** 快照与增量一致了，但在当前行上复用日志求值器，NULL 的结论仍与 SQL 比较不同，逐行求值也慢两个数量级。第二轮已定为把规则编译成 SQL 条件，口径以仓储查询为准。

### 逐项处理

| 评审项                      | 处理                                                                                           | 落点                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 问题 1 条件指纹             | 进度里存上一次的规则原文；只收窄的变化不重拉快照，其余重新对账                                 | US-033 范围「实体同步规则筛选」，AC#19～22 |
| 问题 2 求值器               | 规则编译成 SQL 条件，口径以仓储查询为准；对照基准改成「重新做按区快照」                        | US-033 现状、AC#7、技术笔记「筛选口径」    |
| 问题 3 日志表的 RLS         | 单独成表之后屏障只落在新表上，旧表不动；加了执行顺序的断言                                     | US-033 AC#8、#10                           |
| 问题 4 旧拉取路径           | 旧拉取读不到分区实体的日志；客户端在同步开始时向服务端取已登记的分区实体                       | US-033 范围「分区实体登记与旧协议」，AC#9  |
| 问题 5 AC#21 与核心包       | 移到 US-035，写明核对两处与连接期守卫的两个候选落点；两个故事的实现文件都列了 `packages/rxdb/` | US-035 技术笔记，US-033 实现文件           |
| 缺口 1 建模约束             | 写进范围与文档 AC                                                                              | US-033 范围「分区规则」，AC#27             |
| 缺口 2 `rxdb_bucket` 进正文 | 日志不带正文后不存在；客户端一侧加了断言                                                       | US-033 AC#14                               |
| 缺口 3 迟到的旧区写入       | 版本规则对写入与移除都生效，补了对称用例                                                       | US-033 范围「落库规则」，AC#24             |
| 缺口 4 撤权后的旧响应       | 改成按本地同步轮次判定；换身份的那一半归 US-035                                                | US-033 AC#25，US-035 AC#7                  |
| 缺口 5 往返次数             | 一次请求带多组（区、实体、游标）                                                               | US-033 AC#11                               |
| 缺口 6 owner 的目标         | 新建 US-036：公开数据另声明一个只读浏览实体，走 QueryCache。一个实体既同步又在线浏览仍未认领   | US-036，epic 目标「规则之外的公开数据」    |
| 次级选择：扩展点            | 应用把成员判断登记给平台，重跑参考 SQL 不覆盖                                                  | US-033 范围「读授权」，AC#13               |
| 优化 2 待冻结的决策         | 每条写明阻塞谁；US-033 阶段 A 的三项前提都已定下，剩一项（是否 `FORCE`）在阶段 A 里确认        | epic「待冻结的决策」，US-033「交付阶段」   |
| 优化 3 分阶段格式           | 阶段表加状态与门禁列，AC 按阶段分段，实现文件加阶段列                                          | US-033                                     |
| 优化 4 epic 正文            | 按主题重排，去掉评审轮次的叙述；`redesign.md` 改成带提交号的引用                               | epic                                       |
| 优化 5 日志 id 的位宽       | 新表用 `bigint`                                                                                | US-033 技术笔记                            |
| US-225 的文档缺口           | 已补                                                                                           | 适配器文档                                 |

### 改写前后的 AC 对应

| 改写前（US-033） | 改写后                                                    |
| ---------------- | --------------------------------------------------------- |
| 1、2             | US-033 AC#1（SQL）、#14（真栈）                           |
| 3                | US-033 AC#2、#15                                          |
| 4                | US-033 AC#2、#16                                          |
| 5                | US-033 AC#3、#17                                          |
| 6                | US-033 AC#4、#18                                          |
| 7                | US-033 AC#19                                              |
| 8                | US-033 AC#20                                              |
| 9                | US-033 AC#23                                              |
| 10               | US-035 AC#6                                               |
| 11               | US-035 AC#5                                               |
| 12               | US-035 AC#3                                               |
| 13               | US-035 AC#1                                               |
| 14               | US-033 AC#8                                               |
| 15               | US-033 AC#27，US-035 AC#11                                |
| 16               | US-033 AC#5。结论反过来了：从「登记被拒」变成「直接支持」 |
| 17               | US-033 AC#3、#6                                           |
| 18               | US-033 AC#9                                               |
| 19               | US-033 AC#21                                              |
| 20               | US-033 AC#24                                              |
| 21               | US-035 AC#4                                               |
| 22               | US-033 AC#25，US-035 AC#7                                 |

### 改写时新增、评审里没有提的

1. **分区实体在只读阶段的推送（US-033 AC#26）。** 分区实体的日志不进 `rxdb_change`，旧推送入口会拒绝它；改写前的需求没说客户端怎么办。现在写成：推送资格判定把它标为不可推，批量推送跳过并说明原因。
2. **登记校验（US-033 AC#12）。** 没有 `rxdb_bucket` 生成列的表登记被拒。
3. **US-035 的绑定时机。** 改写前写的是「第一次与远端交换数据时绑定」。离线打开也要拦住（改写前的 AC#21），就只能用应用给的身份键，所以改成「建库时，或第一次带身份键打开时绑定」，并在同步前再用远端报告的身份核对一次。不带身份键时不启用，现有行为不变。
4. **US-035 的旧库。** 本功能之前建的库没有绑定，第一次带身份键打开时就地绑定（US-035 AC#8）。

### owner 的答复

上一版在这里列了五件留给 owner 定的事，答复与处理如下。

| 事项                               | 答复                  | 处理                                                                                                                                                                                                                                       |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 试点实体                           | 没看懂这条在问什么    | 这条本来就不该由 owner 定。分区同步要先拿一张具体的表来写 SQL 回归与契约测试，用专门的测试夹具实体就够，不需要先挑真实业务表。已写进 US-033 的范围「测试」，不再阻塞阶段 A；epic 待冻结的决策 1 改成只阻塞第一个产品实体的接入             |
| 筛选求值的实现                     | 可以，编译成 SQL 条件 | 写进 US-033：范围「实体同步规则筛选」、AC#7（仓储查询、快照、增量三处结论相同，NULL 行不命中）、技术笔记「筛选口径」                                                                                                                       |
| US-033 的状态                      | 改回                  | 已改成 Backlog，派生视图重新生成                                                                                                                                                                                                           |
| 没登录的用户看到全部公开数据怎么落 | 需要设计              | 新建 [US-036](requirements/stories/core/US-036-browse-public-data-outside-sync-rule.md)：公开数据另声明一个只读浏览实体，走 QueryCache、映射公开视图。三个候选的取舍在它的技术笔记里；「一个实体既同步又在线浏览」仍是 epic 里未认领的目标 |
| 显式改绑                           | 先放到后续            | 与 US-035 现在的写法一致，没有改动                                                                                                                                                                                                         |
