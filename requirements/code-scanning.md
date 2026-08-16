# Code Scanning 告警清单

> 数据源：GitHub CodeQL（`aiao-io/rxdb` → [Security → Code scanning](https://github.com/aiao-io/rxdb/security/code-scanning)）。
>
> 快照时间：2026-08-16（最近一次分析 `updated_at` = `2026-08-16T12:06:24Z`）。
>
> 分析配置：CodeQL `2.26.3`，语言 `javascript-typescript`，`build-mode: none`，`category: /language:javascript-typescript`。
>
> 基线：`refs/heads/main` @ `1b09d39f49912d0557cb2a8a182995ee45d74cdc`。
>
> 本文件是 Code scanning 页面的离线镜像，**不是状态真相源**；以 GitHub 页面为准，修复后回写状态。

## 汇总

| 维度       | 数值 |
| :--------- | :--- |
| 开放告警   | 19   |
| 已关闭/已修复 | 0 |
| error 级   | 1    |
| warning 级 | 18   |
| security severity `high`   | 14 |
| security severity `medium` | 5  |

按规则聚合：

| 规则 ID                                     | 规则名                                   | 数量 | severity | security severity |
| :------------------------------------------ | :--------------------------------------- | :--- | :------- | :---------------- |
| `js/polynomial-redos`                       | 不受控数据上的多项式复杂度正则（ReDoS）   | 9    | warning  | high              |
| `js/file-system-race`                       | 潜在文件系统竞态条件                      | 3    | warning  | high              |
| `js/overly-large-range`                     | 正则字符区间过于宽泛                      | 2    | warning  | medium            |
| `js/log-injection`                          | 日志注入                                  | 1    | error    | medium            |
| `js/missing-origin-check`                   | `postMessage` 处理器缺少 origin 校验      | 1    | warning  | medium            |
| `js/incomplete-multi-character-sanitization` | 多字符消毒不完整                          | 1    | warning  | high              |
| `js/double-escaping`                        | 双重转义 / 反义                          | 1    | warning  | high              |
| `js/shell-command-injection-from-environment` | 由环境变量拼接的 shell 命令              | 1    | warning  | medium            |

## 全量清单

| #   | 规则 ID                                  | sev   | sec  | 位置                                             | 说明 |
| :-- | :--------------------------------------- | :---- | :--- | :----------------------------------------------- | :--- |
| 21  | `js/log-injection`                       | error | med  | `scripts/e2e-static-server.mjs:220`               | 日志条目依赖用户可控值 |
| 20  | `js/missing-origin-check`                | warn  | med  | `benchmarks/src/hooks/useTheme.ts:36`             | postMessage 处理器无 origin 校验 |
| 19  | `js/file-system-race`                    | warn  | high | `website/scripts/preview-with-redirects.mjs:105`  | 检查后文件可能已变更 |
| 18  | `js/file-system-race`                    | warn  | high | `website/scripts/flatten-api-docs.mjs:82`         | 检查后文件可能已变更 |
| 17  | `js/file-system-race`                    | warn  | high | `scripts/coverage-serve.mjs:729`                  | 检查后文件可能已变更 |
| 16  | `js/incomplete-multi-character-sanitization` | warn | high | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22` | 字符串可能仍含 `<!--`，引发 HTML 元素注入 |
| 15  | `js/double-escaping`                     | warn  | high | `website/scripts/flatten-api-docs.mjs:196-199`    | 替换可能产生被二次反转义的 `&` |
| 14  | `js/overly-large-range`                  | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | 字符区间与 `\w` 重叠 |
| 13  | `js/overly-large-range`                  | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` | 字符区间与 `\w` 重叠 |
| 12  | `js/shell-command-injection-from-environment` | warn | med | `website/scripts/build-website.mjs:113` | shell 命令依赖不受控文件名 |
| 11  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/urlJoin.ts:106-109`    | 大量重复 `/` 时匹配缓慢 |
| 10  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/urlJoin.ts:19`         | 大量重复 `/` 时匹配缓慢 |
| 9   | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/stringTemplate.ts:11`  | 以 `${{` 开头、大量重复 `${{|` 时缓慢 |
| 8   | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/object/isEqual.ts:105`        | 大量重复 `a` 时匹配缓慢 |
| 7   | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/date/msTimeToMilliseconds.ts:37` | 大量重复 `00` 时匹配缓慢 |
| 6   | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/date/isMSTime.ts:25`          | 大量重复 `00` 时匹配缓慢 |
| 5   | `js/polynomial-redos`                    | warn  | high | `packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106` | 以 `sqlite3-opfs-async-proxy-` 开头、大量重复该前缀时缓慢 |
| 4   | `js/polynomial-redos`                    | warn  | high | `packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:11-13` | 大量重复 `;` 时匹配缓慢 |
| 3   | `js/polynomial-redos`                    | warn  | high | `packages/rxdb/src/rxdb-utils.ts:169`             | 以 `adapter` 开头、大量重复 `adapter` 时缓慢 |

> 图例：`sev` = CodeQL `rule.severity`（error / warning）；`sec` = `rule.security_severity_level`（high / medium / low）。

## 分规则详情

### `js/polynomial-redos`（9 条，high）— ReDoS

正则引擎回溯导致最坏多项式（甚至指数）时间复杂度的正则在不受控数据上运行，可被构造昂贵输入触发 DoS。
本仓 9 条集中在：

- `packages/utils` 的 `urlJoin`、`stringTemplate`、`isEqual`、`msTimeToMilliseconds`、`isMSTime` —— 工具函数输入即库的公开入参，风险面最大。
- `packages/rxdb` / `packages/rxdb-adapter-sqlite-core` —— 核心引擎与 SQLite 适配器的正则。

修复方向（按 CodeQL 推荐）：消除 `r*` / `r+` 中 `r` 的歧义，或加输入长度上限（如 `str.length > 1000` 时抛错）。

### `js/file-system-race`（3 条，high）— TOCTOU 竞态

先 `stat` / `exists` 检查、后读写的 TOCTOU 模式，仅出现在 `scripts/` 与 `website/scripts/` 的本地构建脚本，
非运行时热路径。风险低，但应改用直接 `readFile`/`writeFile` + 异常处理，或 `mkdir -p` 语义避免先检查后创建。

### `js/log-injection`（1 条，error）— 日志注入

`scripts/e2e-static-server.mjs:220` 直接把用户可控值写入日志，可注入换行伪造日志行。这是唯一 error 级，优先修。

### `js/missing-origin-check`（1 条，medium）

`benchmarks/src/hooks/useTheme.ts:36` 的 `postMessage` 处理器未校验 `event.origin`，跨源消息可被接收。benchmark 工具，风险低。

### `js/incomplete-multi-character-sanitization`（1 条，high）

`apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22` 的消毒未覆盖 `<!--`，可被构造 HTML 注入。位于 spec 测试文件，非产物。

### `js/double-escaping`（1 条，high）

`website/scripts/flatten-api-docs.mjs:196-199` 的替换可能产生被二次反转义的 `&`，导致文档渲染 HTML 实体错乱。构建脚本，非运行时。

### `js/overly-large-range`（2 条，medium）

`packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` 的正则字符类区间与 `\w` 重叠（两处同一文件同一行，CodeQL 分两次报告）。测试夹具，风险低。

### `js/shell-command-injection-from-environment`（1 条，medium）

`website/scripts/build-website.mjs:113` 由环境变量/文件名拼接 shell 命令。构建脚本，仅在可信 CI 环境执行，风险低。
