# Code Scanning 告警跟踪

> 数据源：GitHub CodeQL（[aiao-io/rxdb → Security → Code scanning](https://github.com/aiao-io/rxdb/security/code-scanning)）。
>
> 分析配置：CodeQL `2.26.3`，语言 `javascript-typescript`，`build-mode: none`。
>
> 基线：`refs/heads/main` @ `1b09d39f49912d0557cb2a8a182995ee45d74cdc`。
>
> 快照时间：2026-08-16。

## 用途

把 GitHub code scanning 的每条告警拆成独立文件跟踪：**一条告警一个文件**，
修复完成标记 `Resolved`（或承认风险 `Dismissed`），也可以直接删除文件。

## 目录结构

| 文件          | 说明                          |
| ------------- | ----------------------------- |
| `README.md`   | 本说明 + 汇总 + 同步机制       |
| `template.md` | 新建单条告警文件的模板         |
| `CS-XXX-*.md` | 每条告警一个文件（当前 19 条） |

## 状态约定

每条告警文件的 YAML `status` 字段是本地跟踪状态（GitHub 是真相源）：

| 状态        | 含义                              | GitHub 对应 |
| ----------- | --------------------------------- | ----------- |
| `Open`      | 待修复                            | `open`      |
| `Resolved`  | 已修复，代码合并                  | `fixed`     |
| `Dismissed` | 已承认风险、不修                  | `dismissed` |

## 同步机制

- **编号 `CS-XXX` 与 GitHub 告警 `number` 一一对应**（本仓 3~21）。重新拉取时靠编号对齐，不靠标题或描述。
- GitHub 是真相源：告警在 GitHub 上 `fixed` / `dismissed` 后，回写对应文件的 `status`（`Resolved` / `Dismissed`），**或直接删除该文件**。
- 修复 PR 链接记在文件「解决记录」里。
- 本地文件只是离线镜像，不同步回 GitHub；dismiss/fix 操作在 GitHub 页面上做。

## 汇总

19 条开放告警（`open`），无 `dismissed` / `fixed`。

| 维度       | 数值 |
| :--------- | :--- |
| 开放告警   | 19   |
| error 级   | 1    |
| warning 级 | 18   |
| security `high`   | 14 |
| security `medium` | 5  |

### 按规则聚合

| 规则 ID                                      | 规则名                                   | 数量 | severity | security | 涉及文件 |
| :------------------------------------------- | :--------------------------------------- | :--- | :------- | :------- | :------- |
| `js/polynomial-redos`                        | 不受控数据上的多项式正则（ReDoS）         | 9    | warning  | high     | `CS-003`~`CS-011` |
| `js/file-system-race`                        | 潜在文件系统竞态（TOCTOU）                | 3    | warning  | high     | `CS-017`~`CS-019` |
| `js/overly-large-range`                      | 正则字符区间过于宽泛                      | 2    | warning  | medium   | `CS-013`~`CS-014` |
| `js/log-injection`                           | 日志注入                                  | 1    | error    | medium   | `CS-021` |
| `js/missing-origin-check`                    | `postMessage` 缺 origin 校验              | 1    | warning  | medium   | `CS-020` |
| `js/incomplete-multi-character-sanitization` | 多字符消毒不完整                          | 1    | warning  | high     | `CS-016` |
| `js/double-escaping`                         | 双重转义 / 反义                           | 1    | warning  | high     | `CS-015` |
| `js/shell-command-injection-from-environment` | 由环境变量拼接 shell 命令                 | 1    | warning  | medium   | `CS-012` |

## 全量清单

| 文件                                                                  | 规则                                     | sev   | sec  | 位置                                                 |
| :-------------------------------------------------------------------- | :--------------------------------------- | :---- | :--- | :--------------------------------------------------- |
| [CS-021](CS-021-log-injection.md)                                     | `js/log-injection`                       | error | med  | `scripts/e2e-static-server.mjs:220`                  |
| [CS-020](CS-020-missing-origin-check.md)                              | `js/missing-origin-check`                | warn  | med  | `benchmarks/src/hooks/useTheme.ts:36`                |
| [CS-019](CS-019-file-system-race.md)                                  | `js/file-system-race`                    | warn  | high | `website/scripts/preview-with-redirects.mjs:105`     |
| [CS-018](CS-018-file-system-race.md)                                  | `js/file-system-race`                    | warn  | high | `website/scripts/flatten-api-docs.mjs:82`            |
| [CS-017](CS-017-file-system-race.md)                                  | `js/file-system-race`                    | warn  | high | `scripts/coverage-serve.mjs:729`                     |
| [CS-016](CS-016-incomplete-multi-character-sanitization.md)           | `js/incomplete-multi-character-sanitization` | warn | high | `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22` |
| [CS-015](CS-015-double-escaping.md)                                   | `js/double-escaping`                     | warn  | high | `website/scripts/flatten-api-docs.mjs:196-199`       |
| [CS-014](CS-014-overly-large-range.md)                                | `js/overly-large-range`                  | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` |
| [CS-013](CS-013-overly-large-range.md)                                | `js/overly-large-range`                  | warn  | med  | `packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31` |
| [CS-012](CS-012-shell-command-injection-from-environment.md)          | `js/shell-command-injection-from-environment` | warn | med | `website/scripts/build-website.mjs:113`              |
| [CS-011](CS-011-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/urlJoin.ts:106-109`       |
| [CS-010](CS-010-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/urlJoin.ts:19`            |
| [CS-009](CS-009-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/string/stringTemplate.ts:11`     |
| [CS-008](CS-008-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/object/isEqual.ts:105`           |
| [CS-007](CS-007-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/date/msTimeToMilliseconds.ts:37` |
| [CS-006](CS-006-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/utils/src/date/isMSTime.ts:25`             |
| [CS-005](CS-005-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106` |
| [CS-004](CS-004-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:11-13` |
| [CS-003](CS-003-polynomial-redos.md)                                  | `js/polynomial-redos`                    | warn  | high | `packages/rxdb/src/rxdb-utils.ts:169`                |

> 图例：`sev` = CodeQL `rule.severity`（error / warning）；`sec` = `rule.security_severity_level`（high / medium）。

## 分规则修复方向

### `js/polynomial-redos`（9 条，high）— ReDoS

正则引擎回溯导致最坏多项式时间复杂度的正则在不受控数据上运行，可被构造昂贵输入触发 DoS。
涉及 `packages/utils` 的 `urlJoin` / `stringTemplate` / `isEqual` / `msTimeToMilliseconds` / `isMSTime`
（库公开入参，攻击面最大），以及核心引擎 `rxdb-utils.ts` 与 SQLite 适配器。

修复方向（CodeQL 推荐）：消除 `r*` / `r+` 中 `r` 的歧义，或加输入长度上限（`str.length > 1000` 抛错）。

### `js/file-system-race`（3 条，high）— TOCTOU

先 `stat` / `exists` 检查、后读写的 TOCTOU 模式，仅出现在 `scripts/` 与 `website/scripts/` 的本地构建脚本。
改用直接 `readFile` / `writeFile` + 异常处理，或 `mkdir -p` 语义，避免先检查后创建。

### 其余低风险

`js/log-injection`（`CS-021`）是唯一 error 级，优先修；其余 `missing-origin-check`（benchmark）、
`overly-large-range`（测试夹具）、`shell-command-injection` / `double-escaping`（构建脚本）均不在运行时热路径。
