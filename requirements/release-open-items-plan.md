# 发布开项验证方案

> 状态：**待执行**（2026-08-13 撰写，2026-08-14 按 squash 合并决策修订）。
> 执行时逐条勾选文末清单，结果按第 6 节回写。
>
> 背景：本文件处理 v0.0.25 桥接版本**剩下没关掉的六个开项**。
>
> ⚠️ **2026-08-14 更正一条前提**：撰写时写的「桥接版本 `v0.0.25` 已在本地打出、
> 门禁通过、只差推送」**今天已不成立**。见新增的[第 0 节](#0-2026-08-14-发布路径修订squash-合并到-main)。
> 第 7.1 节按同一事实一并改写。

## 0. 2026-08-14 发布路径修订：squash 合并到 main

决策：**`new-1` squash 合并进 `main`，在 `main` 上重做 0.0.25 发布，然后验证。**
本节记录这个改动对原方案的三处影响；第 3 节的分支指令与第 7.1 节按此改写。

### 0.1 版本 bump 已被静默回退 —— 必须重做

原方案假定「`v0.0.25` 已在本地打出、门禁通过、只差推送」。核查后**这句话是错的**：

`7df97fa`（提交信息只说「补 README，并修根 README 的过期条目」）的实际改动里，
把 29 个 `package.json` 从 `0.0.25` 改回 `0.0.24`，并把 `migration-release.json` 从
`bridge` / `0.0.25` 改回 `normal` / `0.0.24` —— 等于把 `b65b24f`（`chore(release): v0.0.25 桥接版本`）
整条撤销，而提交信息一个字没提。当前实测：

```bash
$ node scripts/check-migration-release-gate.mjs --check
Migration release gate passed for normal 0.0.24.

$ node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.25
Migration release gate blocked:
- release.version 0.0.24 does not match tag v0.0.25
```

**含义**：工作树是一棵 0.0.24 的树。合并后要发 0.0.25，得在 `main` 上**重新**做一次
`b65b24f` 做过的事（29 个版本号 + 清单 `kind`/`version`），不是「推个 tag 就完事」。

### 0.2 本地 tag `v0.0.25` 会被 squash 变成孤儿 —— 先删掉

`git ls-remote --tags origin` 显示远端只有 `v0.0.24`；`v0.0.25` 只存在于本地，指向 `b65b24f`。
squash 合并会生成一个全新提交，`b65b24f` **不在** `main` 的祖先链上，于是这条 tag 指向一段
`main` 上不存在的历史 —— 而 [US-304](./stories/collaboration/US-304-writer-lease-migration-fencing.md)
AC1 的判据恰恰是「已推送**且在祖先链上**」。

因为它从没推送过，`git tag -d v0.0.25` 零成本，不涉及重写公开历史。**必须在合并前删**，
否则后面在 `main` 上重新打同名 tag 会撞车，而撞车时 git 报的是「已存在」，
不会提醒你旧的那个指向别处。

### 0.3 squash 换掉了 nx release 的计算基准

`b65b24f` 的提交信息里已经记过：0.0.25 是 patch，因为 v0.0.24 以来 14 个提交中没有一条 `feat:`
（信息是 `123` / `up` 之类，conventional-commits 解析器看不见），尽管这期间落地了全新可发布包
`@aiao/rxdb-adapter-desktop`。

squash 把 23 个提交压成一条之后，版本号将**完全由那一条提交信息决定**。0.0.25 作为
bridge 锚点是人工选定的结果，不是算出来的 —— 这一点要写进 squash 提交的正文，
否则下一个人无从判断这个号是怎么来的。

### 0.4 「先发布再验证」的代价

原方案第 5 节的 Verdaccio 演练，目的是在**不可逆的** `git push --tags`（`publish.yml` 由
`push: tags: v*.*.*` 触发，直接走到 `nx release publish`）之前挡住「发出去装不上」。
改成先发再验，等于把这个顺序倒过来：npm 的版本号用掉不能复用，0.0.25 发坏了只能发 0.0.26。

按本次决策 **C-B（Verdaccio）跳过**，但 **C-A 保留且前移到合并之前**：
`@aiao/rxdb-adapter-desktop` 是本次唯一的首发包、唯一的双入口包，且既无 `consumer`
也无 `audit` target。C-A 用 `pnpm pack` + `file:` 装一遍就能验掉双入口解析与 `files` 白名单，
成本很低，而且它是持久化资产而非一次性演练。

### 0.5 修订后的执行顺序

| 步骤 | 动作                                                                     | 在哪个分支 |
| ---- | ------------------------------------------------------------------------ | ---------- |
| 1    | A2（US-207 AC#2 加密套件）、C-A（desktop `consumer` target）             | `new-1`    |
| 2    | `git tag -d v0.0.25`（删掉将成孤儿的本地 tag）                           | —          |
| 3    | squash 合并进 `main`，提交信息写明 0.0.25 是人工选定的 bridge 锚点       | `main`     |
| 3.5  | 提交 A2 / C-A（实际发生在合并之后，见下）                                | `main`     |
| 4    | 在 `main` 上重做版本 bump：29 个 `package.json` + 清单 `bridge`/`0.0.25` | `main`     |
| 5    | `check-migration-release-gate.mjs --check --release-tag=v0.0.25` 必须绿  | `main`     |
| 6    | 在**发布提交**上重新 `git tag v0.0.25`，推送 → `publish.yml` 发 npm      | `main`     |
| 7    | 验证；A1 / B / 7.2 的 workflow 归入下一版本                              | `main`     |

A1（US-304 AC6）与 B（PR CI 门禁）不阻塞本次发布，可留到 0.0.25 之后。
US-207 AC#8 三平台矩阵同理 —— 见 7.2，它本来就只在 release 分支或 tag 触发。

> **US-207 仍是 🚧。** 0.0.25 是 bridge 版本、不升 system schema，AC#2 / AC#8 未关
> 不构成发布阻塞；但要接受一个事实：`@aiao/rxdb-adapter-desktop` 首发时，
> 若 A2 未做完，则「加密字段 × 桌面 adapter」这个组合在 npm 上是无用例覆盖的。
>
> **2026-08-14 实际进度**：步骤 2 / 3 已执行（tag 已删，squash 提交 `846970a`），
> 步骤 1 的 A2 + C-A 随后在 `main` 上完成、目前尚未提交（步骤 3.5）。
> 顺序与上表不同，但**「A2 / C-A 早于打 tag」这个约束成立**——这才是当初把它们前移的理由。
> AC#2 已关，上面那条「无用例覆盖」的风险随之消解；US-207 仍 🚧 只因 AC#8。
> 步骤 4 起未动。

## 1. 结论先行

**Verdaccio 关不掉这六条里的任何一条。**

不是它跑不通，是判据不对口。[US-304 第 114 行](./stories/collaboration/US-304-writer-lease-migration-fencing.md)
写得很直白：AC1/AC11 的前提**不是「发到 npm」，而是「在本仓库打出并推送 tag，且该 tag 位于发布提交的祖先链上」**。
Verdaccio 是一个 npm registry —— 往它上面发一遍，对「tag 推没推」这个命题一个字都没说。

剩下四条各有各的卡点，也都不在 registry 上：两条是纯代码工作（分支里跑 vitest 就行），
一条是 CI 配置，一条是需要人拍板的决策。

那 Verdaccio 还做不做？**做**，但要说清它验的是另一件事：**发布 → 消费这条路本身**。
`@aiao/rxdb-adapter-desktop` 是本次的**首发包**，两个入口、`workspace:*` 依赖、`files` 白名单、
README 是否随包走，这些只有从一个真 tarball 装一次才知道。它不构成任何 AC 的依据，
但能在不可逆的 `git push --tags` 之前挡住「发出去装不上」这类事故。见第 5 节。

## 2. 六个开项的分类

| 开项           | 现状                                              | 本质        | 本方案能关掉？               |
| -------------- | ------------------------------------------------- | ----------- | ---------------------------- |
| US-304 AC1     | ~~只差「已推送」~~ 三项前提全不成立，见 0.1 / 0.2 | 发布决策    | ❌ 见 7.1                    |
| US-304 AC6     | 缺「别的 realm 真的抬了 epoch」这条用例           | 分支代码    | ✅ 阶段 A1                   |
| US-304 AC11    | 本版无可迁移内容，等 US-305                       | 被前置阻塞  | ❌ 见 7.3                    |
| US-207 AC#2    | 加密字段解锁与桌面 adapter 的组合无用例           | 分支代码    | ✅ 阶段 A2                   |
| US-207 AC#8    | 只跑过 macOS，缺三平台打包矩阵                    | CI 基础设施 | ❌ 见 7.2（可写好等 runner） |
| PR CI 接入门禁 | `README.md` 执行顺序第 0 步，没做                 | CI 配置     | ✅ 阶段 B                    |
| AC11 归属      | 留 US-304 还是转 US-305 的 `inherited_acs`        | 决策        | ❌ 见 7.4                    |

「本质」这一列决定了做法。把决策题当测试题做，或者指望 registry 回答 git 的问题，
都只会产出一份看着很忙、什么也没关掉的记录。

## 3. 阶段 A：分支里能关掉的两条

在 `new-1` 上做（2026-08-14 修订，见 [0.5](#05-修订后的执行顺序)）。原文写的是「新建分支
`chore/release-open-items`，不要在 `main` 上直接改，本仓库 `main` 已领先 origin 16 个提交」——
这句现在过期了：`main` 与 `origin/main` 已同步，工作分支是 `new-1`（领先 `main` 23 个提交，
且 `main` 是它的祖先，可快进）。A2 与 C-A 落在 `new-1`，随 squash 一并进 `main`。

### A1 — US-304 AC6：暂停的旧 writer 恢复后被 fence

**现状为什么不算数。**
`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-system-schema-migration.suite.ts:97`
（「持久化 epoch 提升后在业务事务回调前 fence 旧 writer」）确实断言了 fence，
但它抬 epoch 的方式是一条裸 `UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ?`。
AC6 的场景是「**别的 realm 完成了一次迁移**」—— 迁移会在同一个原子提交里改 guard、schema、
watermark 和 epoch 四样东西，手工只改 epoch 一项，等于把被测对象换掉了。

`packages/rxdb/src/__tests__/system/writer-lease.spec.ts:113`（「fences a resumed writer whose epoch is stale」）
是纯函数级的，`resolveRxDBWriterEpoch` 拿到一个过期 epoch 就抛 —— 它验的是协议原语，
不是「一条真实连接上的下一次写入会不会被拦」。

**要写的用例。**
落在 `packages/rxdb-adapter-sqlite-core/src/__tests__/system-schema-migration.multiprocess.spec.ts`
—— 那里已经有 `spawn` 拉真实子进程 + `node:sqlite` 直连的完整脚手架
（见其中 `drains crashed writers and fences a stale process...` 一例）。形状：

1. 进程 A 打开库、注册 lease，然后**挂起**：不关连接、不续心跳，模拟被挂到后台的旧 bundle；
2. 进程 B 打开同一个文件，跑一次**真实的**系统 schema 迁移（走正常迁移路径，epoch 随原子提交抬升）；
3. A 恢复，发起第一次写入；
4. 断言：以 `writer_fenced` / `requires reconnect` 失败；change log 里**没有**新增旧格式记录；
   连接要么转只读要么要求重连（AC6 原文两者取一，实现走的哪条就断言哪条）。

**先红再绿。** 按 TDD 铁律先写这条用例。**如果它一上来就绿**，那说明 AC6 其实已被现有实现覆盖，
正确动作是把 AC6 直接标 ✅ 并把这条用例作为依据留下，而**不是**再补一条冗余用例硬凑工作量。

```bash
pnpm nx test rxdb-adapter-sqlite-core --watch   # 开发时
pnpm nx test rxdb-adapter-sqlite-core           # 定稿
```

### A2 — US-207 AC#2：桌面 adapter × 加密字段

**现状。** `@aiao/rxdb-test/encrypted` 导出五套共享套件；各 adapter 的接入情况：

| adapter        | crud + queryValidation | tamper | bigint-binary | change-log | lifecycle |
| -------------- | ---------------------- | ------ | ------------- | ---------- | --------- |
| wa-sqlite      | ✅                     | ✅     | ✅            | ✅         | ✅        |
| pglite         | ✅                     | ✅     | ✅            | ✅         | ✅        |
| sqlite（官方） | —                      | —      | ✅            | —          | —         |
| sqlite-wasm    | —                      | —      | ✅            | —          | —         |
| sqliteai       | —                      | —      | ✅            | —          | —         |
| **desktop**    | —                      | —      | —             | —          | —         |

desktop 一套都没跑，这正是 US-207 第 142 行记的那个缺口。

**做法。** 加密不是桌面 adapter 自己的代码 —— `system/encrypt-patch.ts` 在
`@aiao/rxdb-adapter-sqlite-core` 里，desktop 继承 `RxDBAdapterSqliteBase` 就该继承这份行为。
所以这里不写新逻辑，只接线：

1. 在 `packages/rxdb-adapter-desktop/src/__tests__/desktop-adapter-factory.ts` 补一个
   `EncryptedAdapterFactory` 形状的导出 —— 照抄
   `packages/rxdb-adapter-sqlite/src/__tests__/sqlite-official-factory.ts` 里
   `sqliteOfficialEncryptedFactory` 的写法（那份同样是 `node:sqlite` 后端，最贴近）；
2. 新增 `encrypted-crud.spec.ts` / `encrypted-tamper.spec.ts` / `encrypted-bigint-binary.spec.ts` /
   `encrypted-change-log.spec.ts` / `encrypted-lifecycle.spec.ts`，每个文件就是一行 `runXxxSuite({ factory })`。

**覆盖到哪一档不是自由选择。** AC#2 的验收文字是「标准测试套件**无跳过项**」，
所以对齐 wa-sqlite / pglite 的五套，而不是只补一个 bigint-binary 就宣布完成。

```bash
pnpm nx test rxdb-adapter-desktop
```

**若某一套过不去**：那是真发现，不是接线失败。如实记进 US-207 的复核记录，
说明是哪一套、失败在哪一步，AC#2 保持 ⚠️。**不要**把跑不过的那套注释掉再说「五套已接」。

## 4. 阶段 B：PR CI 接入迁移发布门禁

**先纠正一个记账。** `README.md` 执行顺序第 0 步说「PR CI 接入门禁，没做」——
门禁的**单元测试**其实已经在跑了：`.github/workflows/ci-template.yml` 的 `setup` job 有一步
`pnpm test-scripts`，而 `package.json` 里 `test-scripts` = `node --test "scripts/**/*.spec.mjs"`，
`scripts/check-migration-release-gate.spec.mjs` 正在这个 glob 里。

真正缺的是**清单校验本身**（`migration-release-gate`，不带 `--release-tag`）：
它拦的是「版本 bump 了但 `requirements/migration-release.json` 没同步」这类漂移，
这种漂移只有到了 tag 推送那一刻才会炸 —— 那时已经晚了。

**改动。** 在 `ci-template.yml` 的 `setup` job、`Script unit tests` 之后插一步：

```yaml
# 清单漂移（版本 bump 了但 migration-release.json 没同步）只有在 tag 推送那一刻
# 才会被 publish.yml 拦下 —— 那时 tag 已经推出去了。挪到 PR 上拦。
#
# GITHUB_REF_NAME 必须显式清空：门禁在没有 --release-tag 时会回退读这个环境变量
# （check-migration-release-gate.mjs:224），而 pull_request 事件下它的值是
# `<PR 号>/merge`，与 `v0.0.25` 不等，于是每个 PR 都会红在
# 「release.version 0.0.25 does not match tag 123/merge」上。
- name: Migration release gate (manifest)
  env:
    GITHUB_REF_NAME: ''
  run: pnpm exec nx run @aiao/source:migration-release-gate
```

`GITHUB_REF_NAME` 那段不是猜的，两侧都在本地实测过：

```
$ GITHUB_REF_NAME=123/merge node scripts/check-migration-release-gate.mjs --check
Migration release gate blocked …: release.version 0.0.25 does not match tag 123/merge   → EXIT=1
$ GITHUB_REF_NAME= node scripts/check-migration-release-gate.mjs --check
Migration release gate passed for bridge 0.0.25.                                        → EXIT=0
```

**这一步的作用边界**：对 `normal` / `bridge` 清单，它只校验清单自洽 + `release.version`
与 `packages/rxdb/package.json` 一致；PR 上没有 tag，也就不查祖先链。
对 `migration` 清单它才会走 git 三钩子去查 `bridge.tag`。别把它当成 `publish.yml` 那道门禁的替身。

**不用动 `gate` job 的 needs**：这一步挂在 `setup` 里，`setup` 已经在 `gate` 的 needs 列表中。

## 5. 阶段 C：发布 → 消费演练

### 它验什么

只有一个目标：**`@aiao/rxdb-adapter-desktop` 这个首发包，从真 tarball 装出来是可用的。**

具体四问，都是本地 `pnpm nx test` 永远问不到的：

1. `dependencies` 里的 `workspace:*` 在发布时被替换成了 `0.0.25`（`@aiao/rxdb` 与 `@aiao/rxdb-adapter-sqlite-core` 两条）；
2. 两个入口 —— `.`（renderer）与 `/host`（特权侧）—— 从装出来的包里都能解析、都能加载；
3. `files` 白名单确实带上了 `dist/` 与 `src/`，且排掉了 `*.spec.*`；
4. `README.md` 随包走（`files` 里没写它，靠的是 npm 无条件收录 README 这条规则）。

### 它不验什么

不验任何 AC。不验 npm 上的真实状态。不验 tag。演练全绿不构成「可以发布」的结论，
只构成「发布之后至少装得上」。

### C-0：先别自己造轮子

本仓库**已经有**这套东西的成品：`scripts/audit/sqlite-adapter-consumer.mjs` ——
`pnpm pack` 打出 tarball，在临时目录里搭一个 ESM 消费者工程，用 `file:` 依赖装上去，
然后同时按 NodeNext 与 Bundler 两种解析跑一遍导出契约和真实运行时。
挂在 `consumer` target 上，目前 5 个项目有：

```
rxdb-adapter-sqlite / rxdb-adapter-sqliteai / rxdb-adapter-sqlite-core /
rxdb-client-generator / rxdb-plugin-graph
```

**`rxdb-adapter-desktop` 一个都没有**（既没有 `consumer` 也没有 `audit`）——
偏偏它是这次唯一的首发包，也是唯一有双入口的包。这个缺口本身比一次性演练更值得补。

⚠️ **一个必须先说清的事实**：`consumer` 与 `audit` 两个 target **都不在 CI 里**。
`.github/workflows/` 只直接调了 `scripts/audit/api-surface.mjs` 和 `coverage-check.mjs`，
`nx run-many -t audit` 和 `-t consumer` 从没被任何 workflow 跑过；`pnpm test-all`
（`nx affected -t lint typecheck test test-browser build e2e`）也不含它们。
所以补一个 `consumer` target 只是让「能手工跑一条命令验」，**不等于自动有人在把关**。
要真正接进门禁得另外改 workflow —— 那超出本方案范围，但值得单独提一个开项。

### C-A：给 desktop 补 `consumer` target（持久化的那一半）

照 `packages/rxdb-adapter-sqlite/project.json` 的形状加：

```json
"consumer": {
  "executor": "nx:run-commands",
  "dependsOn": ["build", "^build"],
  "options": { "command": "node scripts/audit/desktop-adapter-consumer.mjs" }
}
```

脚本照抄 `sqlite-adapter-consumer.mjs`，差别只在**双入口**：除了 `.` 的导出契约，
还要单独断言 `@aiao/rxdb-adapter-desktop/host` 能解析并导出 `createDesktopSqliteHost`
与 `assertValidDesktopDatabaseName`。这是 `sqlite-adapter-consumer.mjs` 现有 contract 表
覆盖不到的形状，别硬塞进那张表，另起一个脚本更干净。

```bash
pnpm nx run rxdb-adapter-desktop:consumer
```

### C-B：Verdaccio（registry 那一跳）

C-A 用 `file:` 依赖装包，等于**手工把整张 `@aiao` 依赖图钉死**，
于是它天然验不到一件事：**声明的版本范围能不能从 registry 上解析出来**。
`workspace:*` 发布后变成 `0.0.25`，装的时候 npm 得真去 registry 找到
`@aiao/rxdb@0.0.25` 和 `@aiao/rxdb-adapter-sqlite-core@0.0.25`。
哪天有个包漏了版本 bump，`pnpm pack` + `file:` 照样全绿，registry 安装当场炸。
Verdaccio 补的就是这一跳，外加把 `nx release publish` 这条真实发布管线走一遍
（含 Angular 那几个包 `packageRoot: dist/{projectRoot}` 的覆写）。

### 步骤

```bash
# C1 起本地 registry（前台常驻，另开一个终端做后续步骤）
#    executor 默认 clear: true，每次启动清空 tmp/local-registry/storage，重跑天然干净
pnpm nx run @aiao/source:local-registry

# C2 先 dry-run 看清要发哪些包（29 个，全部 public）
pnpm nx release publish --registry=http://localhost:4873 --tag=e2e --dry-run

# C3 真发到本地
pnpm nx release publish --registry=http://localhost:4873 --tag=e2e
```

```bash
# C4 scratch consumer：装出来实际用一次
mkdir -p /tmp/rxdb-verdaccio-check && cd /tmp/rxdb-verdaccio-check
npm init -y
npm install @aiao/rxdb-adapter-desktop@0.0.25 --registry=http://localhost:4873

# 四问逐条查
node -e "console.log(require('@aiao/rxdb-adapter-desktop/package.json').dependencies)"   # 问 1：不该再有 workspace:*
node --input-type=module -e "import('@aiao/rxdb-adapter-desktop').then(m => console.log(Object.keys(m)))"       # 问 2a
node --input-type=module -e "import('@aiao/rxdb-adapter-desktop/host').then(m => console.log(Object.keys(m)))"  # 问 2b
ls node_modules/@aiao/rxdb-adapter-desktop                                                # 问 3、4：dist/ src/ README.md
find node_modules/@aiao/rxdb-adapter-desktop -name '*.spec.*' | head                      # 问 3：应当为空
```

问 2a（renderer 入口在裸 Node 下加载）若失败，**先看错误再下结论**：
如果是因为依赖链里有浏览器专属 API 在模块加载期就执行，那本身就是一个值得记的发现
（renderer 入口应当是纯的，副作用都在 `connect()` 之后）；如果只是缺 DOM 全局，
改用一次真实的 host 往返冒烟更有说服力：

```bash
# C5 用装出来的 /host 跑一次真实往返（open → execute → close），确认发布产物能真的读写文件
node --input-type=module -e "
import { createDesktopSqliteHost } from '@aiao/rxdb-adapter-desktop/host';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'verdaccio-desktop-'));
const host = createDesktopSqliteHost({ resolveDatabasePath: n => join(dir, n), postChange: () => {} });
// storage 必须带 engine: 'sqlite' —— parseDesktopHostRequest 会过一遍能力矩阵校验，
// 少了它直接以 unsupported_runtime_engine 拒绝。
const open = await host.handle({ kind: 'open', storage: { engine: 'sqlite', databaseName: 'smoke.sqlite3' } });
console.log(open.kind, open.result?.resolvedLocation);
console.log(await host.handle({ kind: 'execute', sessionId: open.result.sessionId, sql: 'CREATE TABLE t(a);' }));
host.closeAll();
"
```

### 拆台与一个真实的坑

```bash
# C6 停 registry：回到 C1 的终端按 Ctrl-C（executor 在 exit/SIGINT/SIGTERM/SIGHUP 上会还原 npm 配置）
# C7 确认 ~/.npmrc 真的还原了 —— 这一步别省
npm config get registry        # 期望：不是 http://localhost:4873/
```

`@nx/js:verdaccio` 默认 `location: "user"`，也就是它会去**改 `~/.npmrc`**：
把 `registry` 指向 `http://localhost:4873/` 并写入一个 `_authToken`，退出时再还原。
正常退出没问题，但**被 `SIGKILL` 掉（或直接关掉终端窗口）不会触发还原**，
`~/.npmrc` 会留在指向 localhost 的状态 —— 之后所有 `npm install` 都会连一个已经不在的 registry。
真遇上了手工清：

```bash
npm config delete registry --location user
npm config delete //localhost:4873/:_authToken --location user
```

## 6. 结果记录去向

| 阶段 | 记到哪                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| A1   | US-304 AC 表第 6 行状态 + 「复核记录」里补依据（用例路径、断言的错误码）                               |
| A2   | US-207 AC 表第 2 行状态 + 第 142 行那段「不在覆盖范围内」的说明改写或删除                              |
| A2′  | A2 衍生的错误 `name` 退化缺陷 → US-207 独立小节 + `rxdb-adapter-encrypted:consumer`                    |
| B    | `requirements/README.md` 执行顺序第 0 步标完成 + 记明 `GITHUB_REF_NAME` 这个坑                         |
| C-A  | US-207「技术笔记 / 涉及文件」补上新脚本与 `consumer` target                                            |
| C-A′ | C-A 衍生的 registry 回落缺陷（10 个 tarball 门禁验的是 npm 旧代码）→ `requirements/README.md` C-0 小节 |
| C-B  | **本文件第 8 节**（「演练记录」），不进任何 AC —— 它不是 AC 依据                                       |
| 全部 | `requirements/status-overview.md` 同步；有 story 状态变化时补 `CHANGELOG.md`                           |

执行中如果 C-0 那条「`consumer` / `audit` target 不进 CI」被确认属实且无人在管，
**另开一个开项**记到 `requirements/README.md` 的功能建议里，不要在本方案里顺手改 workflow ——
那是独立的门禁设计问题，混进来会让本方案的验收边界糊掉。

提交信息注意 scope：`requirements` **不是**合法 scope（`scripts/commitizen.mjs` 的白名单里没有），
文档类改动用 `docs(aiao): …`。改 US-304/US-207 正文时若同时动了 `packages/**` 的测试，
按主要变更选 scope（`test` 不是合法 type，用 `fix` 或 `feat` 视性质而定）。

## 7. 本方案关不掉的四件事

### 7.1 US-304 AC1 — 推送 tag

判据是「已推送且在 HEAD 祖先链上」。`publish.yml` 的触发条件是 `push: tags: v*.*.*`，
推上去就直接走到 `nx release publish`，发到真 npm，不可逆。

> **2026-08-14 改写。** 原文说「`v0.0.25` 已在本地打出、门禁通过、祖先关系成立，只差推送这一下」，
> 这三项**今天全都不成立**（详见 [0.1](#01-版本-bump-已被静默回退--必须重做) 与
> [0.2](#02-本地-tag-v0025-会被-squash-变成孤儿--先删掉)）：
>
> - **没打出**：版本 bump 被 `7df97fa` 静默回退，工作树是一棵 0.0.24 的树；
> - **门禁不过**：`--check --release-tag=v0.0.25` 当场 blocked
>   （`release.version 0.0.24 does not match tag v0.0.25`）；
> - **祖先关系将被 squash 打断**：本地 tag 指向 `b65b24f`，squash 后它不在 `main` 祖先链上。
>
> 所以 AC1 缺的**不止推送这一下**，而是「删旧 tag → 重做 bump → 门禁转绿 → 在发布提交上重新打 tag
> → 推送」五步。按 [0.5](#05-修订后的执行顺序) 的步骤 2、4–6 执行。

推 tag 是**发布决策**，不是验证步骤。US-304 上文那条「不要用推一个废弃 tag 试门禁来充当 AC11 证据」
的告诫同样约束这里 —— 不能为了把 AC1 涂绿而推 tag。另注：撰写本文时 `git ls-remote` 对
github.com 超时（`curl 28`）；2026-08-14 复核时远端可达，确认 origin 上只有 `v0.0.24`。

### 7.2 US-207 AC#8 — 三平台打包矩阵

要 macOS / Windows / Linux 三个 runner 各跑一次真实 electron-builder 产物的持久化 smoke test。
本地给不了，Verdaccio 更给不了。

**能提前做的**：把矩阵 workflow 写出来（`apps/dev-rxdb-electron-e2e/` 已有 Linux 侧的
Xvfb 接线可参考，见 `ci-template.yml` 的 e2e job）。US-207 第 167 行已经定了调：
打包 smoke 成本高，**只在 release 分支或 tag 触发，不进 PR 门禁**。
另外本地网络受限时 electron-builder 会 ETIMEDOUT，镜像只认 `ELECTRON_MIRROR` /
`ELECTRON_BUILDER_BINARIES_MIRROR` 两个环境变量（见 `packaged-app.ts` 注释）。

### 7.3 US-304 AC11 — 等 US-305

AC11 说的是「发布**迁移**版本时门禁要拦住旧 bundle」。本版 `RXDB_SYSTEM_SCHEMA_VERSION` /
`RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 在 `v0.0.24` 与 `v0.0.25` 上
完全相同（`3` / `1` / `1`），**没有可迁移的内容**，`kind` 也就不该切 `migration`。
在系统常量真的动之前（预期在 US-305），这条 AC 没有可执行的验证 —— 不是没测，是场景不存在。

### 7.4 AC11 归属 — 需要拍板

留在 US-304，还是按[「跨故事 AC 转移」](./README.md#跨故事-ac-转移)转成 US-305 frontmatter 里的
`inherited_acs`？两种都自洽：

- **留 US-304**：AC11 讲的是 writer lease 协议的发布约束，与本故事同源；代价是 US-304 会长期挂 ⚠️。
- **转 US-305**：谁抬版本谁负责证明旧 bundle 被挡住，责任跟着触发条件走；代价是 US-304 的
  AC 表出现空洞，需要靠反向索引注释维持可读性。

这是**决策不是测试**，跑什么都不会给出答案。执行本方案时把它单独提出来问，不要顺手替人定。

## 8. 演练记录

> ~~待阶段 C 执行后填写。~~
>
> **2026-08-14 作废**：C-B（Verdaccio）按 [0.4](#04-先发布再验证的代价) 跳过，本节没有内容可填。
> C-A 是持久化的 `consumer` target 而非一次性演练，它的结果按第 6 节记进 US-207 的「实现文件」，
> 不记这里。若将来恢复 Verdaccio 演练，本节重新启用。

## 9. 执行清单

按 [0.5](#05-修订后的执行顺序) 重排。~~删除线~~ 的条目按 2026-08-14 决策移出本次发布。

### 合并前（步骤 1）

> **实际落点**：squash 合并（`846970a`）先于 A2 / C-A 完成，因此这批改动落在 `main` 的
> 工作区、尚未提交，而不是随合并进来的。顺序变了但**约束没变**——它们仍在 0.0.25 打 tag 之前。

- [x] A2 补 `desktopEncryptedAdapterFactory`
- [x] A2 接五套 encrypted 共享套件（crud + queryValidation / tamper / bigint-binary / change-log / lifecycle）
- [x] A2 `pnpm nx test rxdb-adapter-desktop` 全绿且无跳过项 —— 786 passed / 15 files / 0 skipped（接线前 734）
- [x] A2 衍生：修错误 `name` 在压缩产物里退化为单字母（`rxdb-adapter-encrypted` 5 个类 +
      `rxdb-plugin-search` 基类与 5 个 `@public` 子类），并加 `rxdb-adapter-encrypted:consumer`
      在 tarball 层守住 —— 详见 US-207「接线 AC#2 时顺带发现的发布缺陷」
- [x] C-A 写 `scripts/audit/desktop-adapter-consumer.mjs`（含 `/host` 入口断言）
- [x] C-A 加 `consumer` target，`pnpm nx run rxdb-adapter-desktop:consumer` 通过
- [~] 全量验证 `pnpm test-all` —— **一次跑不全绿，两个任务被 Nx 判为 flaky，隔离复跑均通过**：
  - `rxdb-adapter-desktop:test`：`test-all` 里失败一次（Nx 自动重试后通过并打上 flaky 标记）；
    单跑 `--skipNxCache` 连续 3 次全绿（786 passed / 15 files / 0 skipped）。
  - `dev-rxdb-angular-e2e:e2e`：`test-all` 里 chromium 大面积失败；单跑 109 passed，Nx 同样判 flaky。
  - **判断**：两者都不是本次改动引入的回归——改动只碰 `rxdb-adapter-desktop`、
    `rxdb-adapter-encrypted/src/errors.ts`、`rxdb-plugin-search/src/types.ts` 与 requirements 文档，
    而 angular e2e 的失败面是整个应用（todo / tree-menu 全挂），形状是应用没起来而不是断言不符。
  - **一条值得单独立项的观察**（不在本方案内改）：
    `packages/rxdb-adapter-desktop/vite.config.mts` 的 `testTimeout` 是 `CI ? 30000 : 10000`——
    本地比 CI 紧 3 倍，而这套用例要拉真实 host 进程。14 分钟的高并发全量跑里超时是合理怀疑，
    但**没有留下失败详情**（输出被 `tail` 截掉），所以这只是怀疑，不是结论。

### 合并与发布（`main`）

- [x] `git tag -d v0.0.25` —— 已删，`git tag -l` 只剩 `v0.0.24`（[0.2](#02-本地-tag-v0025-会被-squash-变成孤儿--先删掉)）
- [x] squash 合并 `new-1` → `main` —— `846970a feat(aiao): 添加 rxdb-adapter-desktop 包 (#6)`（[0.3](#03-squash-换掉了-nx-release-的计算基准)）
- [x] 提交 A2 / C-A 这批工作区改动到 `main` —— `86f8c5f fix(aiao): 修错误 name 在压缩产物中退化，并接入桌面 adapter 加密契约套件`
- [x] 在 `main` 重做版本 bump：29 个 `package.json` → `0.0.25`（[0.1](#01-版本-bump-已被静默回退--必须重做)）——
      `pnpm nx release version 0.0.25` 显式钉版本，文件集与被回退的 `b65b24f` 完全一致
- [x] 在 `main` 重做清单：`migration-release.json` 的 `kind` → `bridge`、`version` → `0.0.25` —— 与上一条同在 `eb4d1a2`
- [x] `node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.25` 通过（带与不带 `--release-tag` 均通过）
- [x] **打 tag 前手工跑一遍全部 tarball 门禁**：`pnpm nx run-many -t consumer audit --skip-nx-cache`
      —— 10 个 target 全绿。这一步不是例行公事，它当场炸出了下面这个缺陷：
  - 5 个脚本在 `0.0.25` 下报 `ERR_PNPM_NO_MATCHING_VERSION`（`consumer-gate.mjs` /
    `encrypted-errors-consumer.mjs` / `desktop-adapter-consumer.mjs` / `sqlite-adapter-consumer.mjs` /
    `pglite-readme-consumer.mjs` / `search-angular-consumer.mjs`）——临时消费者项目只在
    `dependencies` 或只在 `pnpm.overrides` 里钉了 `file:`，tarball 内部的 `@aiao/*` 与被
    `auto-install-peers` 注入的 peer 仍然走 registry。
  - **它此前一直「绿」，是因为 registry 上恰好有同号的 `0.0.24`——验的是 npm 上的旧代码，不是本地产物。**
    修法：每个 `@aiao/*` 同时进 `dependencies` 和 `pnpm.overrides`；补齐 `@aiao/rxdb-test`
    （sqlite-core 把它声明成了运行时依赖）。详见 [requirements/README.md](README.md) 的同名小节。
  - 同一次跑还发现 `sqlite-core-testing-consumer.mjs` 的期望清单漏登记
    `rowsAffectedConformanceSuite`（21 → 22 套）。
- [ ] 在**发布提交**上 `git tag v0.0.25`，确认 `git merge-base --is-ancestor` 成立
- [ ] 推送 tag → `publish.yml` 发 npm（**不可逆**，[0.4](#04-先发布再验证的代价)）
- [ ] 发布后从真 registry 装一次 `@aiao/rxdb-adapter-desktop`，验双入口与 `workspace:*` 替换

### 回写

- [x] 按第 6 节回写 US-207 / status-overview —— AC#2 已转 ✅；US-207 仅剩 AC#8
- [ ] 把 7.4 的决策单独提给决策人
- [ ] **C-0 的 CI 缺口已确认属实**，需单独立项（不在本方案内改 workflow）：
      `pnpm test-all` 是 `nx affected -t lint typecheck test test-browser build e2e`，
      `ci-template.yml` 只列 lint / typecheck / build / test / coverage-acceptance / e2e / e2e-remote，
      `pnpm audit` 的 `nx run-many -t audit` 只覆盖 3 个包。
      于是 7 个 `consumer` + 3 个 `audit` target **没有任何 workflow 在跑**，
      而 [scripts/README.md](../scripts/README.md) 仍把 `audit/sqlite-adapter-consumer` 写成「硬失败（CI 阻断）」——
      要么把 `consumer` 接进 CI，要么改掉这句话，两者必居其一。
      **本次发布把它从「纸面开项」升级为「已造成实际损害」**：正因为没人跑，registry 回落缺陷
      和漏登记的第 22 套套件才能一路活到打 tag 前一刻。
- [ ] 单独立项：`7df97fa` 的静默回退说明提交前没有 review 版本号漂移，考虑加一条门禁

### 移出本次发布（下一版本再做）

- ~~[ ] A1 写 AC6 用例 + `pnpm nx test rxdb-adapter-sqlite-core` 全绿~~ —— US-304 AC6 不阻塞 0.0.25
- ~~[ ] B 改 `ci-template.yml`（含 `GITHUB_REF_NAME: ''`）并本地复验~~ —— PR 门禁不阻塞 0.0.25
- ~~[ ] C-B（C1–C7）Verdaccio 全套~~ —— 按 [0.4](#04-先发布再验证的代价) 跳过，第 8 节演练记录随之作废
- ~~[ ] 第 8 节填演练记录~~ —— 同上
