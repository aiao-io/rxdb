# Code Scanning 告警跟踪

> 数据源：GitHub CodeQL（[aiao-io/rxdb → Security → Code scanning](https://github.com/aiao-io/rxdb/security/code-scanning)）。
>
> 分析配置：CodeQL `2.26.3`，语言 `javascript-typescript`，`build-mode: none`，默认分支 `main`。
>
> 最近分析：`5667f43`（2026-08-28），**0 条 open 告警**。

## 生命周期（2026-08-28 定）

本目录是**工作集，不是档案库**：只有 GitHub 上还 `open`、或本地处置尚未落地的告警才保留文件，
一条告警一个文件。GitHub 上显示 `fixed` / `dismissed` 之后，**在下一次同步时删除对应文件**，
处置结论写进下方「归档」表。

- 本地文件存在的唯一理由：这条告警还需要动作（修 / dismiss / 等 GitHub 状态翻转）。
- GitHub 已关闭的告警不留本地镜像 —— 历史看归档表，细节看 GitHub 页面。
- 第一批的教训：21 条处置完还留着 21 个文件，README 又维护一张和文件重复的全量清单。
  删文件 + 归档表之后，目录大小 == 当前待办大小，README 一屏看完历史。
- 状态取值见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)，本地 frontmatter 是跟踪状态，GitHub 是真相源。

## 增量同步流程

每次同步只处理与上次的差异，按 GitHub 告警 `number` 对齐，不重建全量：

1. **拉当前清单**（open + closed，靠 `state` 区分）：

   ```bash
   gh api "repos/aiao-io/rxdb/code-scanning/alerts?per_page=100&tool_name=CodeQL" \
     --jq '.[] | "\(.number)\t\(.state)\t\(.rule.id)\t\(.created_at)"'
   ```

2. **按 `number` 与本地文件对齐**：
   - GitHub `open` 且本地无文件 → 按[模板](./code-scanning.template.md)建文件，取位置和文案用单条 API：

     ```bash
     gh api "repos/aiao-io/rxdb/code-scanning/alerts/<number>" \
       --jq '{path: .most_recent_instance.location.path, line: .most_recent_instance.location.start_line, message: .most_recent_instance.message.text}'
     ```

   - GitHub `open` 且本地有文件 → 无需动作；路径 / 行号变了就更新 frontmatter。
   - GitHub `fixed` / `dismissed` 且本地有文件 → 在下方归档表补一行，然后**删除文件**。
   - 本地有文件但 GitHub 清单里没有该编号 → 直接删除（编号滚动后 GitHub 只保留新编号）。
3. **更新本文件头部**的「最近分析」commit 与时间：

   ```bash
   gh api "repos/aiao-io/rxdb/code-scanning/analyses?per_page=1" --jq '.[0].commit_sha'
   ```

**编号滚动**：同一规则 / 同一路径 / 同一行重新报出时 GitHub 会分配新 `number`
（第一批里 alert 16 → alert 23 就是这样）。按第 2 步处理即可：旧编号已关闭就归档删除，
新编号正常跟踪；**不为旧编号保留历史文件**。

**同步时机**：修复 PR 合入 `main`、GitHub 重新分析完成之后；或收到 code scanning 通知时。不用定时跑。

## 判定规则（2026-08-20 定）

一条告警值不值得改，先看它落在哪一侧的信任边界：

| 位置                    | 默认处置                                                          |
| :---------------------- | :---------------------------------------------------------------- |
| `packages/`（对外发布） | **修**。入参由下游使用者提供，我们控制不了，也没资格假设它温和    |
| 仓库内脚本 / 测试夹具   | **仅当同时消掉一个真缺陷时才修**，否则 Dismiss 并写清信任边界理由 |

「污染源需要仓库写权限才能构造」的，一律不算真实攻击面 —— 拿到写权限的人直接改脚本更省事，
真正的防线是分支保护与 CI 权限，不是某一行的转义。

## 归档

### 第一批（2026-08-16 ~ 08-19 报出，08-19 全部关闭，21 条）

| 编号   | 规则                                          | 位置                                                                      | 处置      | 备注                                                                             |
| :----- | :-------------------------------------------- | :------------------------------------------------------------------------ | :-------- | :------------------------------------------------------------------------------- |
| CS-023 | `js/incomplete-multi-character-sanitization`  | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`           | Dismissed | 测试断言辅助，非 sanitizer；dismiss reason `used in tests`；由 alert 16 编号滚动 |
| CS-022 | `js/file-access-to-http`                      | `scripts/ci/probe-nx-cloud.mjs:86`                                        | Dismissed | 「读 nx.json 再发请求」正是脚本设计意图                                          |
| CS-021 | `js/log-injection`                            | `scripts/e2e-static-server.mjs:220`                                       | Fixed     |                                                                                  |
| CS-020 | `js/missing-origin-check`                     | `benchmarks/src/hooks/useTheme.ts:36`                                     | Fixed     | 早前提交已修                                                                     |
| CS-019 | `js/file-system-race`                         | `website/scripts/preview-with-redirects.mjs:105`                          | Dismissed | 误报：读取本来就在 `try/catch` 内                                                |
| CS-018 | `js/file-system-race`                         | `website/scripts/flatten-api-docs.mjs:82`                                 | Dismissed | 构建期串行脚本，不存在并发写入方                                                 |
| CS-017 | `js/file-system-race`                         | `scripts/coverage-serve.mjs:729`                                          | Fixed     | 顺带修掉真缺陷：`readFileSync` 不在 try 里，异常即进程猝死                       |
| CS-016 | `js/incomplete-multi-character-sanitization`  | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`           | Fixed     | 同一处随 alert 23 滚动重报，处置见 CS-023                                        |
| CS-015 | `js/double-escaping`                          | `website/scripts/flatten-api-docs.mjs:196`                                | Fixed     | 真 bug：`&amp;quot;` 被错解成 `"`                                                |
| CS-014 | `js/overly-large-range`                       | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | Fixed     | 与 CS-013 同一行                                                                 |
| CS-013 | `js/overly-large-range`                       | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | Fixed     |                                                                                  |
| CS-012 | `js/shell-command-injection-from-environment` | `website/scripts/build-website.mjs:113`                                   | Dismissed | 输入是 `packages/` 下的目录名，污染前提是仓库写权限                              |
| CS-011 | `js/polynomial-redos`                         | `packages/utils/src/string/urlJoin.ts:106`                                | Fixed     |                                                                                  |
| CS-010 | `js/polynomial-redos`                         | `packages/utils/src/string/urlJoin.ts:19`                                 | Fixed     |                                                                                  |
| CS-009 | `js/polynomial-redos`                         | `packages/utils/src/string/stringTemplate.ts:11`                          | Fixed     |                                                                                  |
| CS-008 | `js/polynomial-redos`                         | `packages/utils/src/object/isEqual.ts:105`                                | Dismissed | 误报：告警范围落在 `b.has(key)` 上，文件里没有正则执行                           |
| CS-007 | `js/polynomial-redos`                         | `packages/utils/src/date/msTimeToMilliseconds.ts:37`                      | Fixed     |                                                                                  |
| CS-006 | `js/polynomial-redos`                         | `packages/utils/src/date/isMSTime.ts:25`                                  | Fixed     |                                                                                  |
| CS-005 | `js/polynomial-redos`                         | `packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106`      | Fixed     |                                                                                  |
| CS-004 | `js/polynomial-redos`                         | `packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:11`           | Fixed     |                                                                                  |
| CS-003 | `js/polynomial-redos`                         | `packages/rxdb/src/rxdb-utils.ts:169`                                     | Fixed     |                                                                                  |

### 第一批处置要点（工程笔记，供后续批次参考）

**ReDoS 8 处，全部先写红测试实测退化耗时，修完必须线性**：

| 告警            | 恶意输入                                    | 修前    | 修后    |
| :-------------- | :------------------------------------------ | :------ | :------ |
| CS-005          | `'sqlite3-opfs-async-proxy-'.repeat(20000)` | 14751ms | < 200ms |
| CS-006 / CS-007 | `'0'.repeat(50000) + 'x'`                   | 10189ms | < 200ms |
| CS-003          | `'adapter'.repeat(20000)`                   | 4286ms  | < 200ms |
| CS-004          | `'a' + ';'.repeat(30000) + 'b'`             | 3268ms  | < 200ms |
| CS-010 / CS-011 | `'a' + '/'.repeat(30000) + 'b'`             | 1330ms  | < 200ms |
| CS-009          | `'${'.repeat(20000)`                        | 1184ms  | < 200ms |

- 手法是**消除歧义而不是加长度上限**：改写正则让 `r*` / `r+` 的 `r` 不再有多种切分，
  或把只需要线性扫描的活（剥末尾的 `/` 与 `;`）从正则手里拿走。加 `str.length > 1000` 抛错也能过检查，
  但那是改掉库的行为换告警变绿，等于把问题推给调用方。
- **踩过的坑**：`/\/+$/` 的恶意输入必须让 `/` 串处在**中间**。串在末尾时首次尝试就命中 `$`，
  根本不回溯，第一版用例因此 0ms 通过、看上去像「本来就没问题」。已写进 `urlJoin.ts` 的注释里。

## 当前工作集

| 文件   | 规则 | 位置 | 状态 |
| :----- | :--- | :--- | :--- |
| （无） |      |      |      |

最近分析 0 条 open，无需跟踪文件。新告警出现时按「增量同步流程」建文件。
