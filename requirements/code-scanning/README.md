# Code Scanning 告警跟踪

> 数据源：GitHub CodeQL（[aiao-io/rxdb → Security → Code scanning](https://github.com/aiao-io/rxdb/security/code-scanning)）。
>
> 分析配置：CodeQL `2.26.3`，语言 `javascript-typescript`，`build-mode: none`。
>
> 首次基线：`refs/heads/main` @ `1b09d39f49912d0557cb2a8a182995ee45d74cdc`（2026-08-16，19 条）。
>
> 最近分析：`7dd6609b36673876e9c741903c1b2e3227fa3d2d`。
>
> 快照时间：2026-08-20，告警 3~23 共 21 条：**20 条 open** + 1 条 GitHub 侧已 fixed（alert 16）。

## 用途

把 GitHub code scanning 的每条告警拆成独立文件跟踪：**一条告警一个文件**，
修复完成标记 `Resolved`（或承认风险 `Dismissed`），也可以直接删除文件。

## 目录结构

| 文件                        | 说明                           |
| --------------------------- | ------------------------------ |
| `README.md`                 | 本说明 + 汇总 + 同步机制       |
| `code-scanning.template.md` | 新建单条告警文件的模板         |
| `CS-XXX-*.md`               | 每条告警一个文件（当前 21 条） |

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。本地 YAML `status` 是跟踪状态，GitHub 是真相源。

## 同步机制

- **编号 `CS-XXX` 与 GitHub 告警 `number` 一一对应**（本仓 3~23）。重新拉取时靠编号对齐，不靠标题或描述。
- GitHub 是真相源：告警在 GitHub 上 `fixed` / `dismissed` 后，回写对应文件的 `status`（`Resolved` / `Dismissed`），**或直接删除该文件**。
- 修复 PR 链接记在文件「解决记录」里。
- 本地文件只是离线镜像，不同步回 GitHub；dismiss/fix 操作在 GitHub 页面上做。
- **编号会滚动**：alert 16 被判 `fixed` 后，同一规则 / 同一路径 / 同一行以 alert 23 重新报出。
  遇到这种情况新建文件、老文件保留为历史记录并互相链接，不要复用编号。

## 判定规则（2026-08-20 定）

一条告警值不值得改，先看它落在哪一侧的信任边界：

| 位置                    | 默认处置                                                          |
| :---------------------- | :---------------------------------------------------------------- |
| `packages/`（对外发布） | **修**。入参由下游使用者提供，我们控制不了，也没资格假设它温和    |
| 仓库内脚本 / 测试夹具   | **仅当同时消掉一个真缺陷时才修**，否则 Dismiss 并写清信任边界理由 |

「污染源需要仓库写权限才能构造」的，一律不算真实攻击面 —— 拿到写权限的人直接改脚本更省事，
真正的防线是分支保护与 CI 权限，不是某一行的转义。

按这条规则，本批 13 条修、7 条 Dismiss、1 条已由早前提交修好。

## 汇总

| 维度                     | 数值 |
| :----------------------- | :--- |
| 告警总数（open + fixed） | 21   |
| 已修复 `Resolved`        | 14   |
| 承认风险 `Dismissed`     | 7    |
| 其中 GitHub 侧已 `fixed` | 1    |
| error 级                 | 1    |
| warning 级               | 20   |
| security `high`          | 15   |
| security `medium`        | 6    |

### 按规则聚合

| 规则 ID                                       | 规则名                            | 数量 | severity | security | 处置                          |
| :-------------------------------------------- | :-------------------------------- | :--- | :------- | :------- | :---------------------------- |
| `js/polynomial-redos`                         | 不受控数据上的多项式正则（ReDoS） | 9    | warning  | high     | 8 修 / 1 误报                 |
| `js/file-system-race`                         | 潜在文件系统竞态（TOCTOU）        | 3    | warning  | high     | 1 修 / 2 Dismiss              |
| `js/overly-large-range`                       | 正则字符区间过于宽泛              | 2    | warning  | medium   | 2 修（同一行）                |
| `js/incomplete-multi-character-sanitization`  | 多字符消毒不完整                  | 2    | warning  | high     | 2 Dismiss（编号滚动，同一处） |
| `js/log-injection`                            | 日志注入                          | 1    | error    | medium   | 修                            |
| `js/missing-origin-check`                     | `postMessage` 缺 origin 校验      | 1    | warning  | medium   | 早前提交已修                  |
| `js/double-escaping`                          | 双重转义 / 反义                   | 1    | warning  | high     | 修（是真 bug）                |
| `js/shell-command-injection-from-environment` | 由环境变量拼接 shell 命令         | 1    | warning  | medium   | Dismiss                       |
| `js/file-access-to-http`                      | 文件数据流向外部网络请求          | 1    | warning  | medium   | Dismiss（脚本设计意图）       |

## 全量清单

| 文件                                                         | 规则                                          | sev   | sec  | 位置                                                                      | 处置                                      |
| :----------------------------------------------------------- | :-------------------------------------------- | :---- | :--- | :------------------------------------------------------------------------ | :---------------------------------------- |
| [CS-023](CS-023-incomplete-multi-character-sanitization.md)  | `js/incomplete-multi-character-sanitization`  | warn  | high | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`           | Dismissed                                 |
| [CS-022](CS-022-file-access-to-http.md)                      | `js/file-access-to-http`                      | warn  | med  | `scripts/ci/probe-nx-cloud.mjs:86`                                        | Dismissed                                 |
| [CS-021](CS-021-log-injection.md)                            | `js/log-injection`                            | error | med  | `scripts/e2e-static-server.mjs:220`                                       | ✅ Resolved                               |
| [CS-020](CS-020-missing-origin-check.md)                     | `js/missing-origin-check`                     | warn  | med  | `benchmarks/src/hooks/useTheme.ts:36`                                     | ✅ Resolved                               |
| [CS-019](CS-019-file-system-race.md)                         | `js/file-system-race`                         | warn  | high | `website/scripts/preview-with-redirects.mjs:105`                          | Dismissed                                 |
| [CS-018](CS-018-file-system-race.md)                         | `js/file-system-race`                         | warn  | high | `website/scripts/flatten-api-docs.mjs:82`                                 | Dismissed                                 |
| [CS-017](CS-017-file-system-race.md)                         | `js/file-system-race`                         | warn  | high | `scripts/coverage-serve.mjs:729`                                          | ✅ Resolved                               |
| [CS-016](CS-016-incomplete-multi-character-sanitization.md)  | `js/incomplete-multi-character-sanitization`  | warn  | high | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`           | Dismissed（GitHub 侧已 fixed，见 CS-023） |
| [CS-015](CS-015-double-escaping.md)                          | `js/double-escaping`                          | warn  | high | `website/scripts/flatten-api-docs.mjs:196`                                | ✅ Resolved                               |
| [CS-014](CS-014-overly-large-range.md)                       | `js/overly-large-range`                       | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | ✅ Resolved                               |
| [CS-013](CS-013-overly-large-range.md)                       | `js/overly-large-range`                       | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | ✅ Resolved                               |
| [CS-012](CS-012-shell-command-injection-from-environment.md) | `js/shell-command-injection-from-environment` | warn  | med  | `website/scripts/build-website.mjs:113`                                   | Dismissed                                 |
| [CS-011](CS-011-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/string/urlJoin.ts:106`                                | ✅ Resolved                               |
| [CS-010](CS-010-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/string/urlJoin.ts:19`                                 | ✅ Resolved                               |
| [CS-009](CS-009-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/string/stringTemplate.ts:11`                          | ✅ Resolved                               |
| [CS-008](CS-008-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/object/isEqual.ts:105`                                | Dismissed（误报）                         |
| [CS-007](CS-007-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/date/msTimeToMilliseconds.ts:37`                      | ✅ Resolved                               |
| [CS-006](CS-006-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/utils/src/date/isMSTime.ts:25`                                  | ✅ Resolved                               |
| [CS-005](CS-005-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106`      | ✅ Resolved                               |
| [CS-004](CS-004-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:11`           | ✅ Resolved                               |
| [CS-003](CS-003-polynomial-redos.md)                         | `js/polynomial-redos`                         | warn  | high | `packages/rxdb/src/rxdb-utils.ts:169`                                     | ✅ Resolved                               |

> 图例：`sev` = CodeQL `rule.severity`（error / warning）；`sec` = `rule.security_severity_level`（high / medium）。

## 本批修复要点

### ReDoS（8 处，全部实测过退化耗时）

修之前先写红测试把量级钉下来，再改实现，改完必须线性：

| 告警            | 恶意输入                                    | 修前    | 修后    |
| :-------------- | :------------------------------------------ | :------ | :------ |
| CS-005          | `'sqlite3-opfs-async-proxy-'.repeat(20000)` | 14751ms | < 200ms |
| CS-006 / CS-007 | `'0'.repeat(50000) + 'x'`                   | 10189ms | < 200ms |
| CS-003          | `'adapter'.repeat(20000)`                   | 4286ms  | < 200ms |
| CS-004          | `'a' + ';'.repeat(30000) + 'b'`             | 3268ms  | < 200ms |
| CS-010 / CS-011 | `'a' + '/'.repeat(30000) + 'b'`             | 1330ms  | < 200ms |
| CS-009          | `'${'.repeat(20000)`                        | 1184ms  | < 200ms |

共同的手法是**消除歧义而不是加长度上限**：改写正则让 `r*` / `r+` 的 `r` 不再有多种切分，
或把只需要线性扫描的活（剥末尾的 `/` 与 `;`）从正则手里拿走。加 `str.length > 1000` 抛错也能过检查，
但那是把库的行为改掉换取告警变绿，属于把问题推给调用方。

**踩过的坑**：`/\/+$/` 的恶意输入必须让 `/` 串**处在中间**。串在末尾时首次尝试就命中 `$`，
根本不回溯，第一版用例因此 0ms 通过、看上去像是「本来就没问题」。已写进 [urlJoin.ts](../../packages/utils/src/string/urlJoin.ts) 的注释里。

### 顺带修掉的两个真缺陷

- **[CS-017](CS-017-file-system-race.md)**：`coverage-serve.mjs` 的 `readFileSync` 不在任何 try 里，
  请求处理器一抛异常整个 dev server 就没了。TOCTOU 只是表象，进程猝死才是要命的。
- **[CS-015](CS-015-double-escaping.md)**：链式实体解码里 `&amp;` 先变 `&`，后续步骤再解一次，
  `&amp;quot;` 被错解成 `"`。这是实打实的输出错误，不是理论风险。

### Dismiss 的 7 条

| 告警                                                                                                                      | 理由                                                     |
| :------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------- |
| [CS-008](CS-008-polynomial-redos.md)                                                                                      | 误报：告警列范围落在 `b.has(key)` 上，文件里没有正则执行 |
| [CS-012](CS-012-shell-command-injection-from-environment.md)                                                              | 输入是 `packages/` 下的目录名，污染前提是仓库写权限      |
| [CS-016](CS-016-incomplete-multi-character-sanitization.md) / [CS-023](CS-023-incomplete-multi-character-sanitization.md) | `stripHtmlComments` 是测试断言辅助，不是 sanitizer       |
| [CS-018](CS-018-file-system-race.md)                                                                                      | 构建期串行脚本，不存在并发写入方                         |
| [CS-019](CS-019-file-system-race.md)                                                                                      | 误报：读取本来就在 `try/catch` 内                        |
| [CS-022](CS-022-file-access-to-http.md)                                                                                   | 「读 nx.json 再发请求」正是脚本的设计意图                |

**这 7 条需要在 GitHub 页面上手动 dismiss**（本地文件不回写 GitHub），
各文件末尾的「修复方案」里写了推荐的 dismiss reason。
