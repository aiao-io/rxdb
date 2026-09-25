# 发布计划

> 本文回答「下一次发布要做什么、按什么顺序」。版本策略本身见 [versioning-policy.md](versioning-policy.md)，排期见 [roadmap.md](roadmap.md)。

## 现在的处境（一屏）

- **发布已改为手工执行，由 owner 自己控制时点**：不进 CI、没有任何自动化触发，也没有自动门禁兜底——
  **发布前必须先跑绿 `pnpm test-all`**。仓库里不存在自动发布 workflow，不要再为「什么时候发」反复请示。
- **发布不是开发的闸门**：桥接发布只挡 [epic-006](epics/epic-006-working-tree-commits.md) 的**迁移发布**
  （`bridge.tag` 为 `null` 时 `kind=migration` 门禁必红），不挡 US-305 及其后续故事的编码、测试与合入。
  epic-006 唯一的真开工前置是 `specs/001-working-tree-commits/` 的重生成。
- 历史桥接 tag `v0.0.25` 的 commit 已因后续 squash **脱离当前发布主线**（`git merge-base --is-ancestor v0.0.25 HEAD` 失败），
  不得移动或重打，也**不能再作为 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 migration bridge**。
- 因此下一次 schema migration 之前，**必须先从届时的发布主线重新发布一个 `kind=bridge` 的非迁移版本**。
  实际 tag/version 由 release manifest 冻结，不在需求里预猜。
- ⚠️ **这个桥接版本眼下在 `main` 上无处可切**：#55 已把 `RXDB_SYSTEM_SCHEMA_VERSION` 3 → 6 合进 `main`，
  下面「桥接先发、schema 升级后合」的四段顺序已被打破。出路要 owner 选，见
  [桥接锚点开项](#开项main-自-55-起已是-schema-6桥接锚点无处可切)。
- 已发布的 `@aiao/rxdb@0.0.25` 在报假版本号，且 `v0.0.25` 的 tag 树与已发布产物**内容对不上**，
  见下方[版本漂移开项](#开项0025-遗留的三条版本漂移)。
- **自动生成的 changelog 会同时多报和漏报，必须人工过一遍**：既会把 0.0.25 已发过的内容再写一遍，
  也会漏掉被 squash 进 `chore(aiao): update deps (#53)` 的 US-908 两条缺陷修复。见硬前提 2 的 ② 与 ④。
- 按 [roadmap](roadmap.md) 排期，桥接发布已随 epic-006 链**整体压后到批次 4**；本计划在 owner 决定启动线 A 时执行，
  动手前重跑下方「硬前提 2」的当前状态实测。

## 开项：0.0.25 遗留的三条版本漂移

前两条**源码已修，已发布产物无法修**，都源自 0.0.25 的版本 bump 只改了 `package.json`，一度让 `pnpm test-all` 变红：

- `packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 停在 `'0.0.24'`——**已发布的 `@aiao/rxdb@0.0.25` 在报假版本**；
- `packages/code-editor-angular` 的 peer `"@aiao/code-editor": ">=0.0.24"` 下界低于工作区版本。

两条各自都已有断言在守，**断言没坏，是没人跑绿就发了版**。源码已改、两个 project 恢复全绿；
但 npm 上的 0.0.25 产物改不了，`rxdb.version` 报错版本这件事要写进下一次发布的 release note。

第三条是**判据层面**的，比前两条更容易误导人：

- **`v0.0.25` 这个 tag 指向的树，和 npm 上实际发布的 `0.0.25` 产物对不上**。tag 落在
  `b31c7e2`（2026-08-14），而发布是从一个**晚得多**的工作树跑的 `pnpm publish`。
  两组对照：① 已发布的 `@aiao/rxdb-client-generator@0.0.25` 产物里**含**
  `unsupportedDefaultFactory`（[US-018](stories/core/US-018-generator-default-serialization.md) 的
  `BREAKING CHANGE` 实现），而 `git show v0.0.25^{commit}:…RxDBClientGenerator.utils.ts` 里**没有**；
  ② 已发布的 `@aiao/rxdb@0.0.25` 产物 `package.json` 写 `0.0.25`、打包进去的 `RXDB_VERSION` 却是
  `"0.0.24"`——正是上面第一条漂移的现场。
- **后果是一条判据纪律：本仓库「某个改动发没发过」不能用 tag 祖先链判断**
  （`git merge-base --is-ancestor <commit> v0.0.25^{commit}` 会给出错误的否定答案），
  也不能用提交日期推断。唯一可信的口径是 **`npm pack` 把产物拉下来在里面搜**。
  这条对裁剪桥接版本 changelog（硬前提 2 的后果 ②）与核对[排期约束 12](roadmap.md#排期约束) 都直接适用。
- 这条**无法修复、只能记住**：不得为了让 tag 与产物对上而重打或移动 `v0.0.25`。

## 开项：epic-006 抽包（`next-0912`）欠发布说明的四条

把工作树/提交历史抽成 `@aiao/rxdb-plugin-working-tree` 之后新增的发布约束。四条都**不影响今天的门禁**
（`pnpm check-migration-release-gate` 当前仍是绿的），但都必须在发布当下人工承接。

### ① 系统 schema 号已到 6，这条路径**不能**当桥接锚点

以 `npm pack` 拉已发布产物实测（不是 tag 树，理由见上一节第三条）：

```text
已发布的 @aiao/rxdb@0.0.25  → RXDB_SYSTEM_SCHEMA_VERSION = 3，commit / working-tree 文件数各为 0
工作区 next-0912            → RXDB_SYSTEM_SCHEMA_VERSION = 6
```

即 **epic-006 一行都没发出去过**。号是 epic-006 自己走的 3 → 4 → 5，抽包再走到 6
（语义「`activeKey` 就位，且那十张表不再归核心管」）。

对发布计划的影响是**量变不是质变**：`next-0912` 早在 epic-006 抬到 4 的时候就已经不符合硬前提 1
（「桥接版本不得抬升系统版本常量」），抽包只是把数字从 5 改成 6。结论仍是本文已经写下的那条——
桥接锚点必须由**另一条不动系统版本常量的纯功能/适配器路径**落成，不能从这条分支上切。
⚠️ 这条**没有任何自动化防线**：门禁只比对清单里的布尔位、从不读源码（见「门禁 tag 钩子的状态」末段）。
这条分支已随 #55 合进 `main`，「另一条路径」在 `main` 上因此不复存在，见
[桥接锚点开项](#开项main-自-55-起已是-schema-6桥接锚点无处可切)。

### ② 有一类库「未认领能力守卫」**接不住**，必须写进 release note

抽包后由 `__rxdb_capability__:` 水位行裁决「这个库启用过哪些插件能力」，未装插件却开过能力的库会被拒绝连接。
但**抽包之前**就启用过提交能力的库接不住：它停在水位 4/5，十张表带着真实数据物理还在，
却**没有能力水位行**（那个行格式是抽包之后才有的）。于是新客户端即便不装插件也照常打开它，
写入不再经过捕获，而 `system/capability-watermark.ts` 的守卫只认得水位行、够不到这一种。

**不为它单开迁移**，理由就是 ① 实测的那条：这批库只存在于开发机上。但这是个**判断**而不是保证，
所以它进 release note——谁在本机开过 epic-006 的提交能力，删库重建，不要带着它升上来。

### ③ 三个框架绑定包的破坏性变更

`useWorkingTree` / `WorkingTreeResource` 已从 `@aiao/rxdb-{angular,react,vue}` 移出，
改由 `@aiao/rxdb-plugin-working-tree-{angular,react,vue}` 三端同名提供（三端符号集逐字相同）。

按本文开头「已发布产物」的口径这**不是**破坏性变更（这三个符号从未发布过，`main` 的 api-baseline
里 epic-006 公开导出数为 0），但升级说明仍要写：`next-0912` 上开发的下游要改 import 来源。

### ④ 已知影响：系统 schema 号抬升之后，旧客户端**打不开**升级过的库

发布说明必须带上这一条，用户侧的症状才有名字可查。

**判据是什么**：[`assertSupportedRxDBSystemVersions()`](../packages/rxdb/src/system/migration.ts#L196)
在建连时比对库里的水位与进程常量，`stored > supported` 即抛
[`UnsupportedRxDBSystemVersionError`](../packages/rxdb/src/system/migration.ts#L95)，消息形如
`Unsupported RxDB system schema version: stored=6, supported=3`。两个适配器家族各有一处调用点
（[pglite](../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L189)、
[sqlite-core](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L679)），
都排在迁移阶梯之前。

**影响面恰好是一个方向**：升级过的库 + 旧客户端。反过来（旧库 + 新客户端）走 `<` 那一侧，由迁移阶梯
正常补齐，不受影响；同一个客户端反复打开自己升过的库也不受影响。

**为什么它不是 epic-006 新增的危险面**：这条守卫与它的错误类型早于 epic-006 就在
（`v0.0.24` / `v0.0.25` 的 `migration.ts` 里 `RXDB_SYSTEM_SCHEMA_VERSION = 3`，`assertSupportedRxDBSystemVersions()`
逐字节同形）。当年 2 → 3 的那次抬升，对停在 2 的客户端就是同一个拒绝；epic-006 改变的只是**数字**与
**触发它的人数**，不是机制。写进 release note 是为了让升级者提前知道「降级回旧版本客户端这条路已经关了」，
不是为了标记一个新风险。

**具体数字按发布当下的实况写，别抄这里**：epic-006 自己走的是 3 → 4 → 5，抽包后到
6（见上面 ①，`npm pack` 实测已发布的 `@aiao/rxdb@0.0.25` 仍是 3）。发布说明里应写「3 → 6」而不是
任何中间态——中间那两级从未发布，用户手里不存在停在 4 或 5 的客户端。

**没有缓解措施，也不该造一个**：让新库对旧客户端「看起来能打开」需要向下兼容地写系统表，那正是
fail-closed 要挡的事。说明里给出的动作只有一个——**升级客户端**。

## 开项：main 自 #55 起已是 schema 6，桥接锚点无处可切

**待 owner 决定**。它挡的是线 A（桥接发布）与其后的迁移发布，不挡任何故事的代码与合入。

**事实**（2026-09-25 实测）：

```text
de70a1a9 (#61)  → RXDB_SYSTEM_SCHEMA_VERSION = 3，packages/rxdb/package.json = 0.0.25   ← main 上最后一个 schema 3 的提交
2132c30d (#55)  → RXDB_SYSTEM_SCHEMA_VERSION = 6，packages/rxdb/package.json = 0.0.25   ← 一次 squash 抬 3 → 6
origin/main     → RXDB_SYSTEM_SCHEMA_VERSION = 6，RXDB_CHANGE_CODEC_VERSION = 1，全历史 0 个 merge commit
```

`git log v0.0.24..origin/main -G"RXDB_SYSTEM_SCHEMA_VERSION = "` 只报 `2132c30d` 一条。下文「下一次发布」
四段的顺序是**桥接先发、schema 升级后合**，#55 把本该排在第 3 段之后的升级先合进了 `main`，
上面 ① 写的「桥接锚点必须由另一条不动系统版本常量的路径落成」因此在 `main` 上已经不可能满足。

**为什么没有一个提交能当锚点**：迁移发布要求桥接 tag 同时满足三条，`main` 上两类提交各缺一条。

| 条件                                                                                | `de70a1a9` 及更早（schema 3）                                       | `2132c30d` 及之后（schema 6）                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 是 `main` 祖先（`bridgeTagIsAncestor`）                                             | ✅                                                                  | ✅                                                                                                                                                                                                                                 |
| 包版本 = tag 版本，且严格新于 `0.0.25`                                              | ❌ 全是 `0.0.25`；bump 提交只能是它的子提交，squash 下进不了 `main` | 可以做到                                                                                                                                                                                                                           |
| 系统常量低于迁移版本（`bridgeTagVersionConstants`），且桥接本身不抬常量（硬前提 1） | ✅                                                                  | ❌ 桥接版本会把 3 → 6 直接发出去（门禁只看布尔位，**察觉不到**）；之后的迁移发布比对是 6 → 6，`systemSchemaUpgrade=true` 报 `did not advance`。旧客户端撞的 `UnsupportedRxDBSystemVersionError` 提前到桥接那一版，桥接的意义就没了 |

**可选出路**（本文不替 owner 选，按改动面从小到大排）：

1. **为桥接开一次非 squash 的例外**：从 `de70a1a9` 切发布分支，只提交版本 bump（`nx release version <新版本>`，
   不得为 `0.0.25`）与清单，在该提交上打桥接 tag 并发布，再用**真 merge**（不是 squash）把它并回 `main`，
   让 tag 提交进入 `main` 祖先链。代价：打破「全历史零 merge commit」，且桥接版本不含 #61 之后的功能（它只是锚点，这可以接受）；
   合并时 `package.json` 的版本冲突要按新版本解。
2. **把 schema 抬升移出 `main` 再按原顺序走**：revert `2132c30d` 里的常量与迁移部分，先发桥接，再重新合入。
   代价最大——3 → 6 连着十张表与抽包，revert 等于把 epic-006 从 `main` 拆出去。
3. **承认这一轮没有桥接**：直接发 `kind=migration` 不可行（`bridge.tag` 必填）；要走这条就得改清单协议与门禁
   （例如把首个迁移发布声明为「无桥接、强制 `oldBundlePolicy`」）。这改的是 FR-030 本身，须回到 spec 评审。

owner 选定出路之后，「下一次发布」的四段与执行顺序第 1～6 步按选定路径重写，本开项随之关闭。
在那之前，**不要**在 `main` 现有任何提交上打桥接 tag——打上去的 tag 只能是上表两列中的一种，都会让将来的迁移发布卡死或失去桥接语义。

## 下一次发布：重新打一个桥接版本

`v0.0.25` 已脱离主线，[US-305](stories/collaboration/US-305-commit-graph-head.md) 的迁移发布因此需要一个**新的** `kind=bridge` 锚点。
版本号由 `nx release` 按 conventional commits 算出（见下方硬前提 2），不在需求里预猜。

整体是四段，**顺序不可交换**：

| 段  | 动作                                           | 为什么必须在这个位置                                                                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 先落一批可 bump 的提交，且**不动系统版本常量** | 没有可 bump 的提交就发不出版本（见硬前提 2）；动了常量**门禁察觉不到**（它只比对布尔位），只能靠硬前提 1 的人工复测            |
| 2   | 合入 `main`                                    | tag 必须打在 `main` 上，本仓库一律 squash——先打 tag 再 squash 会让 tag 提交脱离 `main` 历史，`v0.0.25` 正是这样掉出主线的      |
| 3   | 打桥接 tag 发布                                | 桥接 tag 只有存在于 `main` 祖先链上，将来的 migration 发布才引用得了                                                           |
| 4   | 在真实迁移发布上验证门禁                       | 门禁的四条 tag 钩子（存在/祖先/含迁移面/版本常量吻合）、`bridge.version` 下限与 `oldBundlePolicy` 只有在真实迁移发布上才验得全 |

桥接段**不能塞进** US-305：US-305 的范围含「已有数据库的一次性初始化」，属 schema 迁移，会强制
`kind=migration`，而 migration 要求 `bridge.tag` 指向一个**已存在**且在祖先链上的桥接发布——现在没有，直接死锁。
桥接锚点应由一条不动系统版本常量的纯功能/适配器路径落成。

### 两条硬前提

先说两件会让整个计划作废的事，动手前必须确认：

1. **桥接版本不得抬升系统版本常量**。`bridge` 的定义就是「被声明为迁移锚点、但不改
   schema/codec，让所有实例先升到它」；门禁对 `kind=bridge` + `systemSchemaUpgrade|changeCodecUpgrade=true`
   直接报 `bridge releases cannot upgrade system schema or change codec`。所以随这一版发布的功能
   **不能动** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。若那个功能必须升 schema，
   它得排到桥接版本**之后**单独发——否则就会掉进「migration 需要先有 bridge tag，而 bridge tag 又被这次升级污染」的死锁。

   **⚠️ 复测必须用 `-G`，不能用 `-S`。** `-S` 统计的是**字符串出现次数的变化**：把 `= 3` 改成 `= 6`，
   `RXDB_SYSTEM_SCHEMA_VERSION = ` 这个串前后都出现 1 次，计数没变，`-S` 于是**恒空**，给的是假清白；
   `-G` 匹配 diff 文本，能正确报出每次抬升。**这是唯一一条人工防线**（门禁只比对布尔位、从不读源码常量，
   见执行顺序第 1 步），用错了它整条防线恒绿。两条正确命令是：

   ```bash
   git log v0.0.24..main -G"RXDB_SYSTEM_SCHEMA_VERSION = " -- packages/rxdb/src/system/migration.ts
   git log v0.0.24..main -G"RXDB_CHANGE_CODEC_VERSION = "  -- packages/rxdb/src/system/change-codec.ts
   ```

   光看输出仍不够——`-G` 会把「抬上去又改回来」的两条都报出来。定论以**两端取值**为准，
   这一条比任何 `git log` 都直接：

   ```bash
   git show v0.0.24^{commit}:packages/rxdb/src/system/migration.ts | grep 'RXDB_SYSTEM_SCHEMA_VERSION = '
   grep 'RXDB_SYSTEM_SCHEMA_VERSION = ' packages/rxdb/src/system/migration.ts
   ```

   **当前取值**（2026-09-25 复测）：`v0.0.24` 上是 `RXDB_SYSTEM_SCHEMA_VERSION = 3` /
   `RXDB_CHANGE_CODEC_VERSION = 1`；`main` 自 #55（`2132c30d`）起是 **6** / 1。两端取值已经**不相等**，
   上面两条 `git log -G` 也不再为空——`main` 现在**不满足**这条前提，处置见
   [桥接锚点开项](#开项main-自-55-起已是-schema-6桥接锚点无处可切)。只有两端取值相等时，
   清单里的 `systemSchemaUpgrade` / `changeCodecUpgrade` 才该保持 `false`。

   抬到 **6** 的来历（原在 `next-0912` 分支上，已随 #55 进入 `main`）：3 → 4 是 epic-006 的 10 张工作树/提交图表；
   4 → **5** 是 `rxdb_branch.activeKey` 可空唯一列，FR-048 的「至多一个 active」那一半；5 → 6 是抽包后
   `activeKey` 就位、十张表不再归核心管。
   这些都是**单向操作**：标成 6 的库再打开于旧客户端会按 `UnsupportedRxDBSystemVersionError` 拒绝
   ——不是新增的危险面（2 → 3 同样如此），但**必须进发布说明**。两条实际后果：

   - **#55 之后的 `main` 不能充当桥接版本**（见本条第一段：`kind=bridge` 撞上
     `systemSchemaUpgrade=true` 会被门禁直接拒）。桥接锚点必须从一条不动这两个常量的路径上先发出去，
     这次 schema 升级排在其**之后**，清单切 `kind=migration`——这条路径今天在 `main` 上不存在，见上面的开项。
   - 迁移发布时清单里的 `systemSchemaUpgrade` 必须置 `true`，而不是沿用「保持 `false`」。

   `activeKey` 是在 v4 水位线**之后**才进 schema 的，而版本号是升级路径唯一的触发条件、列本身不是——
   已被标成 4 的库（开发机上的那批）不 bump 就永远补不出这一列。它是补记，不是新增能力；v4 从未发布，
   代价只是一个数字。

2. **版本号是算出来的，不是选的**。`conventionalCommits: true`，`nx.json` 只自定义了 `cleanup` /
   `__INVALID__` 两个类型（均 `semverBump: none`），其余走 nx 23.2.1 的
   `DEFAULT_CONVENTIONAL_COMMITS_CONFIG`：**只有 `feat:` → minor、`fix:` → patch，
   其余全部 `none`**（`perf` / `refactor` / `docs` / `build` / `types` / `chore` / `examples` / `test` / `style`）。
   两个推论：

   - 非规范提交信息（`123` / `up` 这类）nx 解析不到，一律记为 `none`；**一批非规范提交等于零 bump 量，发不出版本**。
     这也意味着算出来的版本号反映的是**提交信息的形态，不是改动的份量**——0.0.25 就是一个全新可发布包
     以 patch 发出去的例子，changelog 上看不出来。
   - 若要指定版本号，需显式传参覆盖推算结果。无论取哪个，**清单、tag、`packages/rxdb/package.json` 三处必须同为那个实际值**。
   - **当前状态实测（跑 `pnpm nx release version --dry-run`，在 `main` 上量）**：
     `v0.0.25` 已脱离主线，`git describe --tags --abbrev=0` 解析到的基准 tag 因此**回退成 `v0.0.24`**。
     **区间必须在 `main` 上量，不能在 feature 分支上量**：tag 只打在 `main`，`nx release` 的输入是 `main`
     的提交；feature 分支上的 `123` 这类中间提交经 squash 后不进 `main`，PR 标题才是留下的那一条。
     区间随仓库继续产生提交而变化（最近一次实测 `v0.0.24..origin/main` 为 42 条：23 `feat` + 3 `fix`），
     **动手前重跑本节命令取当前值**；结论不随数量变化——specifier 仍是 `minor`、仍被
     `adjustSemverBumpsForZeroMajorVersion` 降级，默认推算仍落在禁用且已被 registry 占用的 `0.0.25` 上，
     **线 A 仍必须显式传版本号**。另外两条当天为绿的前提是时点结论、不是状态：非规范标题检查在
     `main` 上零输出、`git log --merges v0.0.24..origin/main` 为空——本条写下之后仓库仍在产生新提交，
     动手前照样要重跑。特性分支上量没有意义：`next-0912` 同区间有大量 `123` / `213213` 类中间提交和
     merge commit，它们会在 squash 时消失，量出来的是噪声。
     三个后果必须在动手前确认：

     ① **默认推算结果是 `0.0.25`，正好是禁用值，且 npm 上已被占用——不能直接用**。
     dry-run 的原话是「Resolved the specifier as "minor" … Applied semver relative bump "minor" …
     to get new version **0.0.25**」：specifier 确实是 `minor`，但 nx 的
     `adjustSemverBumpsForZeroMajorVersion` **默认为 `true`**
     （`nx/dist/src/command-line/release/config/config.js` 的 `?? true`），major 为 0 时把
     `minor` 降级成 `patch`、`major` 降级成 `minor`，于是 `0.0.24 --minor--> 0.0.25` 而**不是 `0.1.0`**。
     两个后果叠在一起：该值撞上[线 A 关闭判据 ①](roadmap.md#批次-4epic-006-链整体压后)的
     `release.version ≠ 0.0.25`，且 `@aiao/rxdb@0.0.25` **已在 registry 上**（`npm view @aiao/rxdb versions` 实测），
     `pnpm publish` 会以版本重复被拒。**所以线 A 必须显式指定版本号**（`nx release version <显式版本>`），
     不能听任推算；取 `0.0.26` 还是 `0.1.0` 是一次人工决定，但**不得**是 `0.0.25`。
     若改用 `adjustSemverBumpsForZeroMajorVersion: false` 让它算成 `0.1.0`，那是改全仓库版本策略、影响此后每一次发布，
     属独立决定，不要顺手夹在桥接发布里做。

     ② 该区间**包含已随 0.0.25 发布过的内容**，**changelog 会把 0.0.25 已发的东西再写一遍**，需人工裁剪。
     注意这里不能按 tag 祖先链判断「发没发过」，原因见上方[版本漂移开项](#开项0025-遗留的三条版本漂移)的第三条。

     ③ `cleanup(...)` 已加进 `nx.json` 的 `release.conventionalCommits.types`：`semverBump: none`、changelog 单列一节，
     这 4 条对版本号仍贡献为零但不再从 changelog 消失；`__INVALID__`（非规范标题）同样只进 changelog 不 bump。

     ④ **反过来还有「漏报」：真活被埋在错标题下，changelog 里一个字都不会有**。已推送的
     `f4e0778 chore(aiao): update deps (#53)` 是一次 squash 合并，标题写的是升级依赖，实际带走的是
     2026-09-11 夜里（原始提交 `83b5e0d`，标题 `12312323123`，仍可在 `origin/next-0910` 上查到）交付的
     [US-908](stories/future/US-908-devtools-transfer-session-defects.md) **两条缺陷修复**——
     `packages/rxdb-devtools/src/v2/transfer.ts` 的 `cancel()` 排空在途写入、`apps/dev-rxdb-electron` 的
     `pagehide → dispose()`——外加 [US-906](stories/future/US-906-electron-devtools-developer-path.md) 的交付、
     三份新测试与 `scripts/audit/requirements-consistency.mjs`。因为标题是 `chore`，
     **这两条 `fix` 既不贡献 bump，也不会出现在 changelog 的 Bug Fixes 里**；实测该区间被识别出的 3 条 `fix`
     （`2bc4f6a` / `5e129fc` / `5044dad`）全是 8 月的 CI 与打包修复，**与昨夜这两条无关**。
     `f4e0778` 已在 `origin/main` 上，**不得重写**——只能在 changelog 生成后**人工补写**这两条。
     ② 是多报、④ 是漏报，定稿前两边都要人工过一遍；判断某条到底发没发过，仍按上方开项第三条只认 `npm pack`。

     ⑤ **非规范标题会以 `__INVALID__` 原样进 changelog，且本仓库在持续产生新的。**
     非规范提交（`123` / `213213` 这类）nx 解析不到、一律记为 `none`，一批非规范提交等于零 bump 量、发不出版本；
     特性分支上的中间提交经 squash 后不进 `main`，只在 `main` 上量才有意义。所以这里不列清单——
     **这不是一次性清理，而是每次推送前必跑的例行检查**——
     未推送的可以 `git commit --amend` 只改信息、不动树，已推送的（如 `f4e0778`）没有这个机会。
     推送前跑：
     `git log --format='%h %s' v0.0.24..main | grep -vE ' (feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert|cleanup)(\(.*\))?!?:'`
     应当无输出。

   - **`preVersionCommand` 会先跑 `nx run-many -t build --projects='packages/*'`，它红了 dry-run 就跑不到版本计算那一步**，
     报错只有一句 `The pre-version command failed`。2026-09-12 实测撞到过一次：`code-editor-angular:build` 因
     `node_modules` 里残留 `@codemirror/state@6.7.2` / `@codemirror/view@6.43.10` 的旧副本而报 TS2322
     （lockfile 里只有 6.7.4 / 6.43.11，是**本机安装态漂移**，不是仓库缺陷；`chore: update deps` 之后没重装就会这样）。
     `pnpm install --frozen-lockfile` 会判定「已是最新」直接跳过，**必须 `pnpm install --frozen-lockfile --force`** 才会重建链接。
     动手前确认 dry-run 真的输出了版本号，别把 pre-version 的红当成「没有可发布的变更」。

### 执行顺序

0. **门禁的 git 钩子面已挂进 PR CI**（不依赖发布）：`migration-release-gate`
   已挂进 PR CI 的 `setup` job（`ci-template.yml` 的 “Migration release manifest gate”），**不带**
   `--release-tag`，用真实 git 执行 `bridgeTagExists` / `bridgeTagIsAncestor` /
   `bridgeTagSupportsProtocol`——单测里这三条被 `passingHooks` 桩掉，此前只在打 tag 时跑过。
   两处配套改动是这一步能成立的前提：
   - `setup` 的 checkout 加了 `fetch-tags: true`。`fetch-depth: 0` 只保证历史完整；actions/checkout
     在 refspec 不含 `refs/tags/*` 时一律加 `--no-tags`，runner 上根本没有 tag，四条钩子会变成恒假门禁。
   - 脚本改为按 `GITHUB_REF_TYPE` 解析发布 tag（`resolveReleaseTag`）。此前直接取 `GITHUB_REF_NAME`，
     PR 事件下那是 `42/merge`，挂进 PR CI 会让每个 PR 都红在
     `release.version 0.0.25 does not match tag 42/merge` 这条与发布无关的假失败上。

   这四条只对 `kind=migration` 生效，桥接发布走不到它们（见下方「门禁 tag 钩子的状态」），
   下一个迁移周期（US-305）才会真正吃到。

1. **先合入 `main`，再打 tag**——顺序不能反。落地时两条约束：提交必须是规范的
   `feat(...)` / `fix(...)`（否则 bump 量为零，发不出版本），且**不得改动** `RXDB_SYSTEM_SCHEMA_VERSION` /
   `RXDB_CHANGE_CODEC_VERSION`。
   ⚠️ **这一条门禁守不住，别指望它**：`kind=bridge` 只校验 `systemSchemaUpgrade` / `changeCodecUpgrade`
   两个布尔位（[check-migration-release-gate.mjs:256](../scripts/check-migration-release-gate.mjs#L256)），
   **从不读源码常量**；桥接发布时 `bridge.tag` 是 `null`，新增的 `bridgeTagVersionConstants` 钩子也走不到。
   悄悄抬了常量却把布尔位留成 `false`，门禁照样全绿。唯一防线是硬前提 1 那两条 `git log -G` 人工复测（**`-S` 在这里恒空，会给出假清白**，见硬前提 1）。
   门禁的祖先判定是
   `git merge-base --is-ancestor <tag>^{commit} HEAD`（[scripts/check-migration-release-gate.mjs:277](../scripts/check-migration-release-gate.mjs#L277)）。
   本仓库全历史零 merge commit，PR 一律 squash：若在特性分支上打 tag 再 squash 进 `main`，
   tag 指向的提交**不在** `main` 的历史里，将来那次 migration 发布会卡在
   `bridge.tag ... is not an ancestor of the release commit`，且无法在不重写 tag 的前提下补救。
2. **先 version，后改清单，再一起提交**——顺序同样不能反。`nx release` 会自己算版本号、改写
   `packages/*/package.json`、提交并按 `v{version}` 打 tag；清单是手工维护的，不在它的改写范围内，
   所以必须卡在「版本已定、tag 未打」之间更新：

   ```bash
   # 先看推算结果；按硬前提 2 的实测，默认会算出 0.0.25——禁用值，且 npm 上已被占用
   pnpm nx release version --dry-run

   # 因此这一步必须显式传版本号（<新版本> 不得为 0.0.25）
   pnpm nx release version <新版本> --git-commit=false --git-tag=false   # 只改 package.json，不提交不打 tag
   # 读 packages/rxdb/package.json 的 version，据此更新清单
   ```

   `v0.0.24` 就是栽在这一步：包版本停在 `0.0.24`，清单已经写成 `0.0.25`，两者从未对齐。
   **显式版本号不是可选项**：听任推算会得到 `0.0.25`，第 4 步的门禁拦不住它（`release.version` 与 tag
   自洽即可通过），真正报错要等到第 5 步之后手工 `pnpm publish` 时被 registry 以版本重复拒掉。

3. **更新清单**：`requirements/migration-release.json` 的 `release.version` 填上一步实际得到的版本号，
   `release.kind` 确认为 `bridge`。`bridge.tag` / `bridge.version` 保持 `null`——
   桥接版本不引用桥接 tag，只有 migration 版本才填。

   ⚠️ **清单里今天已经是 `kind=bridge` / `version=0.0.25`**，那是 0.0.25 那次桥接发布的**如实记录**，
   不是本次的成果。**不要把它当作「这一步已经做完了」**，也**不要为了让门禁变红而改写它**——
   篡改已发布版本的记录比留着它更糟。本步唯一要动的是 `release.version`：
   它必须变成一个 **≠ `0.0.25`** 的新版本号，与 `packages/rxdb/package.json` 同值。
   这条「版本号必须是新的」**在本次发布当下没有任何自动化在守**（原因见下方门禁 tag 钩子一节），
   只能靠这一步的人工确认。唯一的延迟防线是 `bridge.version` 下限：真发成 `0.0.25` 的话，
   要等到**下一次** migration 引用它时才会撞下限报红——迟一个发布周期，不能当作本步的门禁。

4. **本地预检**：`pnpm nx run @aiao/source:migration-release-gate-test` 与
   `pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v<实际版本>"` 全绿后才允许提交。
5. **提交并打 tag 推送**：package.json 与清单在同一个提交里，tag 指向 `main` 上的该提交。
   推送 tag 不会触发任何发布——发布是手工执行 `pnpm publish`，由执行者自行确保第 4 步已跑绿。
6. **回写下方「迁移发布的关闭条件」**：把该桥接 tag 记进那一节的 AC US2-14 绿半边证据，
   依据是「桥接 tag 已推送、是 `main` 祖先、清单声明 `kind=bridge` 且通过门禁」。迁移发布从此有了合法锚点。
   （AC US2-14 的绿半边由本文承接；[US-305](stories/collaboration/US-305-commit-graph-head.md) 按代码 AC 关闭，
   不回写故事。）

### 门禁 tag 钩子的状态

`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 已用真实 tag 做过正反两组对照：
真 tag 一条报错都没有，伪造 tag（`v9.9.9`）三条全部报出，fail-closed 成立。
**门禁本身不需要修**：它在真实 tag 上的行为与桩一致，且对伪造 tag 正确拒绝。
「只在 tag 时跑」这条缺口**已补**：门禁现在每个 PR 都跑（见执行顺序第 0 步）。

第四条钩子 `bridgeTagVersionConstants`（2026-09-12 新增）从 tag 上读
`RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 并与清单的升级位比对，同批还加了一条
`bridge.version` 必须严格新于 `0.0.25` 的下限。真实 tag 实测（2026-09-12）：

```text
v0.0.24 → {systemSchemaVersion: 3, changeCodecVersion: 1}
v0.0.25 → {systemSchemaVersion: 3, changeCodecVersion: 1}
v9.9.9  → null（fail-closed）
```

⚠️ **由此得到一条容易被误读的事实：版本常量比对挡不住 `v0.0.24`。** 它的两个常量与 `main` 完全相同，
US-305 把 schema 抬到 4 之后，拿 `v0.0.24` 当锚点会顺利通过比对（`3 < 4` ✓、codec `1 == 1` ✓）。
真正挡住这个空桥的**只有** `bridge.version` 下限那一条硬编码。两者不是互为备份：
比对那条只管「升级位撒谎」，下限那条只管「锚点太老」。**删掉下限就没有第二道防线**。

⚠️ **这四条只对 `kind=migration` 生效，桥接发布走不到它们**
（[check-migration-release-gate.mjs](../scripts/check-migration-release-gate.mjs) 的 `validateManifest`
把它们放在 migration 分支里）。后果是**门禁在当前状态下就是绿的**，实测：

```bash
$ node scripts/check-migration-release-gate.mjs --check
Migration release gate passed for bridge 0.0.25.          # exit 0
$ node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.25
Migration release gate passed for bridge 0.0.25.          # exit 0
$ git merge-base --is-ancestor v0.0.25^{commit} HEAD      # 失败：v0.0.25 不是祖先
```

也就是说**「门禁全绿」不能作为桥接发布已完成的证据**——今天什么都不做跑它就是绿的。
桥接发布的两条真判据（版本号 ≠ `0.0.25`、新 tag 是 `main` 祖先）在**发布当下**都只能人工确认并留证，
把第 0 步的 `migration-release-gate` 挂进 PR CI 也守不到它们。
`bridge.version` 下限只提供**延迟**防线：桥接真发成 `0.0.25`，要到下一次 migration 引用它时才会红。
第三条同样无自动化：桥接发布**不得抬升系统版本常量**这一条，门禁只看布尔位、从不读源码（见执行顺序第 1 步的 ⚠️）。
这也是 [roadmap 批次 4 线 A](roadmap.md#批次-4epic-006-链整体压后) 的关闭判据要写五条、
并特别标出「④ 单独没有区分力」的原因。

注意 `bridgeTagSupportsProtocol` 只用 `git cat-file -e` 校验文件存在、不校验内容，
它单独并不能证明该 tag 含可用的迁移实现，须另行人工确认。

### 迁移发布的关闭条件

迁移发布门禁的操作列是「发布迁移版本」，桥接发布不升级任何系统版本，够不着这个前置条件。三条子句在桥接发布后的状态：

| 子句                                                 | 桥接发布之后                           |
| ---------------------------------------------------- | -------------------------------------- |
| 本仓库须存在位于 HEAD 祖先链上的桥接 tag             | ✅ 由该次桥接 tag 满足                 |
| 发布门禁阻止升级，或强制更新/缓存失效/新命名空间隔离 | ❌ 需要一次真实 migration 发布才验得了 |

真正关闭迁移发布门禁的那次发布必须同时满足：抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 或 `RXDB_CHANGE_CODEC_VERSION`、
清单切 `kind=migration`、`bridge.tag` / `bridge.version` 指向该次桥接版本、`oldBundlePolicy.strategy` 四选一、
`minimumVersion` 不低于桥接版本、`enforced=true`。

**这条门禁的代码由 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 交付**（其范围含「每分支 baseline commit 与一次性迁移」）：
清单协议、四条 tag 钩子、`bridge.version` 下限与 `oldBundlePolicy` 校验都已在 `check-migration-release-gate.mjs` 里，
由 `check-migration-release-gate.spec.mjs` 的 39 条注入钩子单测覆盖，并已挂进 PR CI。

**AC US2-14 的绿半边在这里关闭，不在 US-305 里关**。
红半边（`bridge.tag` 为 `null` / 为 `v0.0.25` / 版本常量不吻合时门禁必红）已在真实仓库上成立并留证；
绿半边要的是「补齐真实桥接 tag 后重跑通过」，它只能由发布动作产出，属于发布而不属于代码交付，US-305 因此按代码 AC 关闭。本节承接的内容：

| 项                                                                                                    | 状态                                                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 真实桥接 tag 存在、是 `main` 祖先、版本严格新于 `0.0.25`、常量低于迁移版本                            | ⬜ 卡在[桥接锚点开项](#开项main-自-55-起已是-schema-6桥接锚点无处可切)，待 owner 选出路 |
| 清单切 `kind=migration` 且 `bridge.*` 指向该 tag，`pnpm check-migration-release-gate` 在真实 tag 上绿 | ⬜ 依赖上一行                                                                           |
| `oldBundlePolicy` 四选一、`minimumVersion` ≥ 桥接版本、`enforced=true`                                | ⬜ 依赖上一行                                                                           |

三行全 ✅ 时在此记录 tag、命令与输出，AC US2-14 随之关闭；[epic-006](epics/epic-006-working-tree-commits.md) 的发布判据引用本节。

不要用「推一个废弃 tag」来充当证据：tag 是桥接声明本身，
试探性 tag 会污染 `nx release` 的版本计算基准，也会让后续读历史的人分不清哪个 tag 是真的。
