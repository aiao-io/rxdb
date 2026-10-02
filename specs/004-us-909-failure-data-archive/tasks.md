---
description: 'Task list: US-909 阶段 B — e2e 失败现场数据归档与导入'
---

# Tasks: US-909 阶段 B — e2e 失败现场数据归档与导入

**Input**: Design documents from `/specs/004-us-909-failure-data-archive/`

**Prerequisites**: plan.md, research.md（D1–D10）, data-model.md, quickstart.md。没有 spec.md：故事文件
[US-909](../../requirements/stories/future/US-909-session-replay-debugging.md) 即 spec。

**Tests**: 包含——纯函数单测先红后绿；lint 规则先红（27 处）后绿；e2e spec 先写后接实现；自动触发用临时探针（不进交付 PR）。

**Organization**: 按验收标准分组。执行顺序：故事登记 → 共享配置（重构，行为不变）→ 纯函数 → 页内 API → fixture + lint（AC#6）
→ 归档行为（AC#4、5、8、9）→ 导入（AC#7）→ 全量与收尾。

## Format: `[ID] [P?] [AC?] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[AC4]～[AC9]**: 任务所属的故事验收标准
- 提交、推送、开 PR 已由用户在本轮授权（「继续后续的，一起做完再合并」）；合并由用户做

## Path Conventions

- dev 应用：`apps/dev-rxdb-angular/src/app/`；e2e：`apps/dev-rxdb-angular-e2e/src/`
- 命令约定：每条 shell 命令前带 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"; unset CI`；nx 命令加 `NX_DAEMON=false`；
  未注明 `cd` 的命令在仓库根目录执行
- 临时探针 `apps/dev-rxdb-angular-e2e/src/us909-archive-probe.spec.ts` 不进交付 PR

## Phase 1: Setup

- [x] T001 故事登记（`requirements/stories/future/US-909-session-replay-debugging.md`）：
  - AC#4 预期结果「导出前不改动库」改为逻辑不变式：导出前后结构文本、各业务表行数、`status()` 相等，不补提交、不丢弃
  - 交付阶段表 B 行状态 `⬜` → `⚠️`；「阶段 B / C 不伪造数据侧关联」一句里的「导出前不改动库」同步改口径
  - 技术笔记「阶段 B 的数据怎么带出来」末尾补 spike 结论（research D1 的数据）与两项 owner 裁决（2026-10-02）；「导入的口径」
    改为恢复到归档原库名（`authDomain` 约束，research D3）
  - `updated` 保持当天；`pnpm run audit:requirements` 通过；status-overview / roadmap 的 US-909 进度描述改为「阶段 A 已交付（#81），
    阶段 B 实现中」
- [x] T002 前提：`lsof -i :8200` 无输出；`git status --short` 只有本特性改动

## Phase 2: Foundational — 共享配置（D2，重构，行为不变）

- [x] T003 新建 `rxdb/demo-rxdb-config.ts`：`DEMO_ENTITIES`、`SEARCH_PLUGIN_CONFIG`、`useDemoPlugins(rxdb, createOptions)`
      （六个插件 + `sqlite-wasm` adapter 工厂 + search）、`mainThreadIdbOptions(baseHref)`、`createMainThreadIdbRxDB(dbName, baseHref)`
      （`cloneEntityClasses(DEMO_ENTITIES)`、`multiInstance: false`、`init()`），全部带 TSDoc
- [x] T004 `rxdb/setup_rxdb_sqlite-wasm.ts` 改用共享配置；`getSqliteWasmUrl` 随之搬走；行为不变
- [x] T005 回归：`nx test dev-rxdb-angular`（含 `setup_rxdb.spec.ts`）+ `nx e2e dev-rxdb-angular-e2e -- src/working-tree.spec.ts src/todo.spec.ts --retries=0` 通过

## Phase 3: 纯函数（TDD）

- [x] T006 [P] 先写 `rxdb/failure-archive.spec.ts`（红）：
  - `toFailureArchiveReason(stage, error, signal)`：截止已到 → `timeout`；`RxDBBackupError` → 其 `code`，`message` 拼 `cause`；
    其他 `Error` → `error`，`message` 为 `name: message`
  - `createCappedSink(maxBytes)`：未超时返回拼好的 `Uint8Array`；超过时 `write` 以 `RangeError` 拒绝
  - `toBase64` / `fromBase64` 往返（含 > 32 KiB 的输入）
  - `dbNameFromManifest(manifest)`：返回 `authDomain` 最后一个 `@` 之前的部分；`encryption === null`、没有 `@`、前缀为空抛错
- [x] T007 实现 `rxdb/failure-archive.ts` 转绿；不写后缀字面量（`RXDB_DB_NAME_SUFFIX` 不在公开面上，后缀由 `restore()` 校验）

## Phase 4: 页内 API

- [x] T008 `rxdb/failure-archive-api.ts`：`installFailureArchiveApi(primary, { dbName, baseHref })` 挂
      `window.__rxdbFailureArchive`：
  - `archive(request)`：data-model §1 的流程与规则（connect 与截止 race → inspect（业务表 + 工作树）→ `backup(sink, { signal, lockTimeoutMs })`
    → base64）；从不抛；`finally` 销毁第二实例
  - `snapshot()`：读主实例的结构文本、业务表、工作树
  - TSDoc 写明备份窗口内主实例写入可能偶发 `database is locked`（owner 2026-10-02 接受）
- [x] T009 `setup_rxdb_sqlite-wasm.ts` 在 `init()` 后调 `installFailureArchiveApi`

## Phase 5: [AC6] fixture 与 lint 守卫

- [x] T010 [AC6] 先加 lint 规则（`apps/dev-rxdb-angular-e2e/eslint.config.mjs`，research D10），跑 `nx lint dev-rxdb-angular-e2e`
      确认 27 处 `no-restricted-imports`（红）
- [x] T011 [AC6] 新建 `src/fixtures.ts`（data-model §4）：auto fixture `failureArchive` + `archiveFailure()` + 重导出 `expect`；
      TSDoc 写明触发条件、超时阶梯、并发锁风险
- [x] T012 [AC6] 27 个 spec 的 `test` 改从 `./fixtures.js` 取（`expect` / 类型可一起改取或保留）；lint 转绿
- [x] T013 [AC6] 从 `working-tree.spec.ts` 抽出 `src/working-tree-utils.ts`（`openPanel` / `waitForAutoEnabled` / `writeTodo` /
      `commit` / `openHistory` / `openChanges`），`working-tree.spec.ts` 改为导入，行为不变

## Phase 6: [AC4][AC5][AC8][AC9] 归档行为

- [x] T014 [AC4] 先写 `src/failure-archive.spec.ts` 的 AC#4 用例（红：页内 API 未接通或断言不成立）：写两条 Todo（未提交）→
      `snapshot()` → `archiveFailure(page, testInfo)` → `snapshot()`；前后相等；附件名、`contentType`、摘要字段按 data-model §2、§3；
      归档字节数 = 摘要 `archive.bytes`；摘要的 `tables` / `workingTree` 与 `snapshot()` 一致
- [x] T015 [AC9] 同一 spec：摘要 `dbName` = 页面 `localStorage['__aiao_e2e_db_name__']`；归档 manifest 的 `authDomain` =
      `<dbName>@<后缀>`，最后一个 `@` 之前等于 `dbName`（偏差：Node 端按帧格式手读 manifest（8 字节魔数 + 类型 + 长度 + JSON），
      e2e 进程不引入 `@aiao/rxdb`；完整读回由导入用例经 `restore()` 覆盖）
- [x] T016 [AC5] 同一 spec：主页面 `close()` 后 → `page: 'reopened'`、导出成功、`dbName` 不变；崩溃（`chrome://crash`）同上；
      `context.close()` 后 → `page: 'unavailable'`、`reason.code: 'context_unavailable'`，无归档附件
- [x] T017 [AC8] 同一 spec：`nodeGuardMs: 1` → `transfer/timeout`；`deadlineMs: 1` → `connect/timeout`；`maxBytes: 1` →
      `backup/io_error`；都只有摘要附件；之后主页面仍可写（第二实例已释放）
- [x] T018 实现 / 修正直到 T014–T017 全绿
- [x] T019 [AC8] 实测超时拆卸：临时探针里 `test.setTimeout(3000)` + 卡住的 `await page.waitForTimeout(10_000)`，确认 `timedOut` 时
      fixture 仍完成归档（必要时调整 `setTimeout` 增量）；探针不提交

## Phase 7: [AC7] 导入

- [x] T020 [AC7] 先写 `src/failure-archive-import.spec.ts`（红）：working-tree 页写 Todo A → 提交 c1 → 写 B → 提交 c2 → 写 C（未提交）
      → `archiveFailure` 取归档字节与摘要 → 新上下文打开 `/failure-archive` → 选文件 → 显示的库名 = 摘要 `dbName` → 导入并打开 →
      `snapshot()` 的业务表与工作树（HEAD、`entryCount`）= 摘要 → working-tree 页丢弃 → 右键 c1 恢复 → 「恢复中」+「有未提交改动」；
      再导入同一归档 → `target_not_empty` 错误态 +「打开该库」
- [x] T021 [AC7] `setup_rxdb_sqlite-wasm.ts` 读覆盖键 `rxdb-demo-imported-db-name`：有值则用作库名并强制 IDB + SharedWorker
- [x] T022 [AC7] 导入页 `pages/failure-archive/`（data-model §6 的状态、`<label>`、`role="alert"`、`aria-busy`）+ 路由 + 菜单项
- [x] T023 [AC7] 外壳提示条 `components/imported-db-banner.ts`（显示库名、「回到默认库」删键并 reload），挂到 `app.ts`
- [x] T024 [AC7] T020 转绿；`route-smoke.spec.ts` / a11y spec 若遍历菜单，确认新页通过

## Phase 8: 验证与收尾

- [x] T025 自动触发 + AC#1～3 不回退（quickstart §5，临时探针）：失败原因不变；附件含归档、摘要、trace；`trace.zip` 在用例目录；删探针
- [ ] T026 [AC6][AC9] 全量 Angular e2e（quickstart §6）：全部通过；JSON 报告零归档 / 摘要附件；记墙钟与 `rrweb` 基线对比
- [ ] T027 `nx run-many -t lint typecheck test --projects=dev-rxdb-angular,dev-rxdb-angular-e2e` 零警告；`prettier --check` 改动文件
- [x] T028 故事：AC#4～9 结论写进各行「预期结果」并改 ✅；交付阶段表 B 行 ✅（合并后）或保持 ⚠️（待合并）按惯例；实现文件表补
      具体路径；`pnpm run audit:requirements`
- [ ] T029 提交（不 amend 用户的提交）→ 推送 `us909-stage-b` → 开 PR（base `rrweb`）→ CI 绿（重跑前核对 headSha）
