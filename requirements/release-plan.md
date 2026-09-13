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
  2026-09-12 实测两组对照：① 已发布的 `@aiao/rxdb-client-generator@0.0.25` 产物里**含**
  `unsupportedDefaultFactory`（[US-018](stories/core/US-018-generator-default-serialization.md) 的
  `BREAKING CHANGE` 实现），而 `git show v0.0.25^{commit}:…RxDBClientGenerator.utils.ts` 里**没有**；
  ② 已发布的 `@aiao/rxdb@0.0.25` 产物 `package.json` 写 `0.0.25`、打包进去的 `RXDB_VERSION` 却是
  `"0.0.24"`——正是上面第一条漂移的现场。
- **后果是一条判据纪律：本仓库「某个改动发没发过」不能用 tag 祖先链判断**
  （`git merge-base --is-ancestor <commit> v0.0.25^{commit}` 会给出错误的否定答案），
  也不能用提交日期推断。唯一可信的口径是 **`npm pack` 把产物拉下来在里面搜**。
  这条对裁剪桥接版本 changelog（硬前提 2 的后果 ②）与核对[排期约束 12](roadmap.md#排期约束) 都直接适用。
- 这条**无法修复、只能记住**：不得为了让 tag 与产物对上而重打或移动 `v0.0.25`。

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

   **当前状态实测（2026-09-12，HEAD `f4e0778`）：这条今天是成立的，不必额外动作。**
   两个常量在 `v0.0.24` 与 `main` 上同为 `RXDB_SYSTEM_SCHEMA_VERSION = 3` / `RXDB_CHANGE_CODEC_VERSION = 1`，
   `git log v0.0.24..main -S"RXDB_SYSTEM_SCHEMA_VERSION = " -- packages/rxdb/src/system/migration.ts`
   与 codec 那条的对应命令**均为空**。启动线 A 前按同样两条命令复测一次即可——只要它们仍为空，
   清单里的 `systemSchemaUpgrade` / `changeCodecUpgrade` 就该保持 `false`。

2. **版本号是算出来的，不是选的**。`conventionalCommits: true`，`nx.json` 只自定义了 `cleanup` /
   `__INVALID__` 两个类型（均 `semverBump: none`），其余走 nx 23.2.1 的
   `DEFAULT_CONVENTIONAL_COMMITS_CONFIG`：**只有 `feat:` → minor、`fix:` → patch，
   其余全部 `none`**（`perf` / `refactor` / `docs` / `build` / `types` / `chore` / `examples` / `test` / `style`）。
   两个推论：

   - 非规范提交信息（`123` / `up` 这类）nx 解析不到，一律记为 `none`；**一批非规范提交等于零 bump 量，发不出版本**。
     这也意味着算出来的版本号反映的是**提交信息的形态，不是改动的份量**——0.0.25 就是一个全新可发布包
     以 patch 发出去的例子，changelog 上看不出来。
   - 若要指定版本号，需显式传参覆盖推算结果。无论取哪个，**清单、tag、`packages/rxdb/package.json` 三处必须同为那个实际值**。
   - **当前状态实测（2026-09-12 跑 `pnpm nx release version --dry-run`，在 `main` 上量，HEAD `f4e0778`，nx 23.2.1）**：
     `v0.0.25` 已脱离主线，`git describe --tags --abbrev=0` 解析到的基准 tag 因此**回退成 `v0.0.24`**。
     **区间必须在 `main` 上量，不能在 feature 分支上量**：tag 只打在 `main`，`nx release` 的输入是 `main`
     的提交；feature 分支上的 `123` 这类中间提交经 squash 后不进 `main`，PR 标题才是留下的那一条。
     `v0.0.24..main` 共 36 条提交：**19 条 `feat` + 3 条 `fix`**，4 条 `cleanup(...)` 记 `none`，
     其余为 `chore` / `docs`。三个后果必须在动手前确认：

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
     2026-09-12 一个下午就产生了 3 条（`2132` / `22` / `21313`，15:39～16:19，均为并发会话把本文件的
     编辑顺手提交所致），且**每写完一次核对结论就又多一条**。所以这里不列清单——
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
   两个布尔位（[check-migration-release-gate.mjs:247](../scripts/check-migration-release-gate.mjs#L247)），
   **从不读源码常量**；桥接发布时 `bridge.tag` 是 `null`，新增的 `bridgeTagVersionConstants` 钩子也走不到。
   悄悄抬了常量却把布尔位留成 `false`，门禁照样全绿。唯一防线是硬前提 1 那两条 `git log -S` 人工复测。
   门禁的祖先判定是
   `git merge-base --is-ancestor <tag>^{commit} HEAD`（[scripts/check-migration-release-gate.mjs:186](../scripts/check-migration-release-gate.mjs#L186)）。
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
6. **回写 US-305**：把该桥接 tag 记进 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 证据，
   依据是「桥接 tag 已推送、是 `main` 祖先、清单声明 `kind=bridge` 且通过门禁」。US-305 的迁移发布从此有了合法锚点。

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

**这条门禁由 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 承接**（其范围含「每分支 baseline commit 与一次性迁移」）。
US-305 在 schema 迁移前先验证当前主线存在有效 bridge ancestor，随后用首个真实迁移发布验收该 bridge manifest、
`oldBundlePolicy` 和 migration release gate，不形成循环依赖。

不要用「推一个废弃 tag」来充当证据：tag 是桥接声明本身，
试探性 tag 会污染 `nx release` 的版本计算基准，也会让后续读历史的人分不清哪个 tag 是真的。
