---
description: 'Task list: US-909 阶段 A — e2e 失败尝试保留 trace'
---

# Tasks: US-909 阶段 A — e2e 失败尝试保留 trace

**Input**: Design documents from `/specs/003-us-909-trace-retain-on-failure/`

**Prerequisites**: plan.md, research.md（D1–D11 决策）, data-model.md, quickstart.md。没有 spec.md：故事文件
[US-909](../../requirements/stories/future/US-909-session-replay-debugging.md) 即 spec。没有 contracts/：本阶段不对外暴露接口（plan）。

**Tests**: 包含——宪法 II 先红后绿：AC#1 的两个临时探针在旧配置下按预期原因红（运行正常、没有 `trace.zip`），改配置后转绿；
AC#2 在临时分支上验；AC#3 是量测记录。不加常驻测试（research D11）。

**Organization**: 按故事的验收标准分组，执行顺序 AC#1 → AC#3 → AC#2：AC#3 超限要改配置（research D6），这一步落在提交与推送
之前，AC#2 验的就是最终配置。

## Format: `[ID] [P?] [AC?] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[AC1] / [AC3] / [AC2]**: 任务所属的故事验收标准。不用模板的 `[US1]`：本仓库的 US-xxx 是故事编号，本特性只有一个故事；
  按执行顺序编 US1～3 会让「US2」指 AC#3
- **🔒**: 会留下提交或对外可见（提交、推送、开 / 关 PR、删分支），用户当场放行后才执行；一条的放行不延伸到下一条
- 描述里写明文件路径

## Path Conventions

- 六个配置：`apps/{dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e,dev-rxdb-supabase-e2e,dev-rxdb-http-e2e,rxdb-devtools-extension-e2e}/playwright.config.ts`
- CI 注释：`.github/workflows/ci-template.yml`，「Upload Playwright artifacts」上方的 5 行（现为 870–874 行）
- 故事与派生视图：`requirements/stories/future/US-909-session-replay-debugging.md`、`requirements/status-overview.md`、
  `requirements/roadmap.md`、`requirements/epics/epic-004-future-features.md`
- AC#3 记录：`specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv`（随交付 PR 提交）；JSON 报告在 `$TMPDIR/us909-ac3/`（不提交）
- 临时探针，不进交付 PR：
  - `apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts`、`apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts`
    （AC#1，跑完删除）
  - `apps/dev-rxdb-angular-e2e/src/us909-ci-retry-probe.spec.ts`（AC#2，只提交在临时分支 `us909-ac2-probe` 上）
- 命令约定：
  - 每条 shell 命令前都带 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"; unset CI`。pnpm 的 preinstall 门禁要求
    Node 26；`CI` 置位会让 retries 变 2、workers 变 1 并追加 blob reporter；工具的 shell 状态不跨调用保留
  - nx 命令前加 `NX_DAEMON=false`：本机 daemon 早于 `node_modules` 重装启动，还拿着旧路径（quickstart 前提）
  - 未注明 `cd` 的命令在仓库根目录执行

## Phase 1: Setup

**Purpose**: 开工登记与本地运行前提

- [x] T001 开工登记（用户在 tasks 参数里要求开工即改；执行时报告）：
  - 故事 `requirements/stories/future/US-909-session-replay-debugging.md`：frontmatter `status: Backlog` → `In Progress`，
    `updated` 取当天；交付阶段表 A 行保持 `⬜`（仓库里的交付阶段表只用 ✅ / ⬜，没有进行中符号；交付后由 T040 改 ✅）
  - `pnpm audit:requirements:update`：只自动改 status-overview 的汇总表与「进行中 / 待评审（N 条）」标题、README 的 N/M、
    roadmap「仓库还剩 N 条」一句
  - 手改 `requirements/status-overview.md`：21 行「25 条 Backlog 里只有 3 条是可开工的」→「24 条 Backlog 里只有 2 条是可开工的」
    （原先可开工的三条是 US-029 / US-602 / US-909）；「进行中」表在 US-211 行后加 US-909 行，当前进度写「阶段 A 实现中
    （AC#1 → AC#3 → AC#2）；B 待第二连接 spike，C 未开始」；epic-004 小节的 US-909 行 `⬜` → `🚧`，「无前置、可开工」→「实现中」
  - 手改 `requirements/roadmap.md`：现状快照表 In Progress `1` → `2`、Backlog `25` → `24`（未完成合计仍 26）；未完成需求全景表的
    US-909 行状态 `📝 Backlog` → `🚧 In Progress`、「plan 已完成」→「实现中」，挪到 US-211 行之后（In Progress 排在前）
  - 手改 `requirements/epics/epic-004-future-features.md` 31 行目标：「应用内会话录制价值待证」→「应用内会话录制（价值门禁 owner
    2026-10-01 豁免）」（plan 轮漏改的旧口径）
  - `pnpm run audit:requirements` 通过
- [x] T002 本地运行前提（quickstart 前提）：`pnpm exec playwright install chromium`；`lsof -i :8200 -i :8210` 无输出（两个 webServer 都 `reuseExistingServer: false`，端口被占直接报错）；`git status --short` 只有本特性的改动（T001 改到的需求文件与 `specs/003-us-909-trace-retain-on-failure/`）
- [x] T003 `NX_DAEMON=false pnpm nx build dev-rxdb-angular`：angular e2e 的 webServer 只 serve `dist/apps/dev-rxdb-angular/browser`
- [x] T004 `NX_DAEMON=false pnpm nx run rxdb-devtools-extension-e2e:prepare`：扩展与 fixture 页面落在 `dist/apps/rxdb-devtools-extension-e2e`；排在 T003 之后，不同时跑两个 nx 任务

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 记下改动前的基线，后面的「只改这几行」「零新增警告」才有对照

**⚠️ CRITICAL**: 基线核对完才进 AC#1

- [x] T005 [P] 核对改动对象与 data-model §1 两张表一致：`grep -n "trace" apps/*/playwright.config.ts` 里 `'on-first-retry'` 在 angular 52 / react 35 / vue 37 / supabase 50 / http 44 行，旧注释在 angular 51 / react 34 / vue 36 / supabase 49 行，electron 31 行 `'on-first-retry'`、miniprogram 36 行 `'off'`；`apps/rxdb-devtools-extension-e2e/playwright.config.ts` 没有 `use` 块；`.github/workflows/ci-template.yml` 870–874 行是以「# 失败复盘用。`trace: 'on-first-retry'` 在各 config 里都开着」开头的 5 行注释。对不上先回到 plan
- [x] T006 [P] 六个项目的 lint + typecheck 基线：`NX_DAEMON=false pnpm nx run-many -t lint typecheck -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e,dev-rxdb-supabase-e2e,dev-rxdb-http-e2e,rxdb-devtools-extension-e2e`，记下既有警告（若有），T023 只比增量

**Checkpoint**: 基线确认，进入 AC#1

---

## Phase 3: AC#1 — 本地失败留下 trace (Priority: P1) 🎯 MVP

**Goal**: 本地 `--retries=0` 下，angular demo e2e 与扩展 e2e 的失败用例各留一份 `trace.zip`，含失败断言前后的 DOM 快照；
通过的用例不留（故事 AC#1，research D3 / D7）

**Independent Test**: 两个项目各跑探针，1 passed / 1 failed；`find test-output/playwright/output -name trace.zip` 恰好一行，落在
必失败用例的尝试目录；快照脚本输出 `after,before`；扩展 trace 含 `chrome-extension://`（quickstart AC#1 第 3 步）

### Tests for AC#1（先红）⚠️

> 探针先落、先跑出预期的红，再改配置

- [x] T007 [P] [AC1] 新建临时探针 `apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts`：`import { expect, test } from '@playwright/test';`，`test.describe('US-909 trace 探针')` 下两条用例。必过：`await page.goto('/')` 后 `await expect(page.locator('body')).toBeVisible()`；必失败：`await page.goto('/')` 后 `await expect(page.getByTestId('us909-never-rendered')).toBeVisible({ timeout: 1000 })`
- [x] T008 [P] [AC1] 新建临时探针 `apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts`：`import { expect, test } from './extension.fixture';`（不带 `.js`，同 `relay.spec.ts`），同名 describe 下两条用例。必过：`expect(extensionId).toMatch(/^[a-p]{32}$/)`；必失败：`const page = await context.newPage()`，``await page.goto(`chrome-extension://${extensionId}/panel.html`)``，再断言 `page.getByTestId('us909-never-rendered')` 可见，`timeout: 1000`
- [x] T009 [AC1] 红（angular）：`cd apps/dev-rxdb-angular-e2e && pnpm exec playwright test src/us909-trace-probe.spec.ts --retries=0 --reporter=list`，再 `find test-output/playwright/output -name trace.zip`。预期 1 passed / 1 failed，失败原因是找不到 `us909-never-rendered`，`find` 无输出；webServer 没起来、两条都失败都不算红，先排查
- [x] T010 [AC1] 红（扩展）：同 T009，目录换成 `apps/rxdb-devtools-extension-e2e`，预期相同

### Implementation for AC#1

> 文案逐字取自 data-model §1；七处改动互不相干，可并行

- [x] T011 [P] [AC1] `apps/dev-rxdb-angular-e2e/playwright.config.ts`：52 行 `trace: 'on-first-retry'` → `trace: 'retain-on-failure'`；51 行注释整行替换为 `/* Record a trace for every attempt and keep it only when the attempt fails. See https://playwright.dev/docs/trace-viewer */`
- [x] T012 [P] [AC1] `apps/dev-rxdb-react-e2e/playwright.config.ts`：35 行改值同 T011；34 行注释替换为与 T011 同一句英文
- [x] T013 [P] [AC1] `apps/dev-rxdb-vue-e2e/playwright.config.ts`：37 行改值同 T011；36 行注释替换为与 T011 同一句英文
- [x] T014 [P] [AC1] `apps/dev-rxdb-supabase-e2e/playwright.config.ts`：50 行改值同 T011；49 行注释替换为 `/* 每次尝试都录 trace，只保留失败的尝试，见 https://playwright.dev/docs/trace-viewer */`
- [x] T015 [P] [AC1] `apps/dev-rxdb-http-e2e/playwright.config.ts`：44 行改值同 T011；原本没有注释，不补（research D4）
- [x] T016 [P] [AC1] `apps/rxdb-devtools-extension-e2e/playwright.config.ts`：在 `expect: { timeout: isCI ? 10000 : 5000 },` 与 `webServer: {` 之间新增两行，`// 每次尝试都录 trace，只保留失败的尝试；fixture 自建的持久化上下文同样会被录。` 与 `use: { trace: 'retain-on-failure' },`；`src/extension.fixture.ts` 不动，不加手动 `context.tracing`（research D3）
- [x] T017 [P] [AC1] `.github/workflows/ci-template.yml`：「Upload Playwright artifacts」上方 870–874 行的 5 行注释整段替换为 data-model §1 的 7 行注释，逐字照抄，缩进 6 空格
- [x] T018 [AC1] 校验改动面：`grep -n "retain-on-failure" apps/*/playwright.config.ts` 恰好六行、分属六个项目（注释不含该字样）；electron 31 行、miniprogram 36 行不变；`git diff --stat -- apps .github` 只有六个配置与 `ci-template.yml`
- [x] T019 [AC1] 绿（angular）：重跑 T009 的命令，仍 1 passed / 1 failed；`find` 恰好一行，在必失败用例的尝试目录里；在 `apps/dev-rxdb-angular-e2e` 下跑 quickstart AC#1 第 3 步的快照脚本（`ZIP=$(find …)` 加逐个 `.trace` 解出、补换行后 `| node -e …`），输出 `after,before`
- [x] T020 [AC1] 绿（扩展）：同 T019，目录换成 `apps/rxdb-devtools-extension-e2e`；另跑 `unzip -p "$ZIP" '*.trace' | grep -c 'chrome-extension://'`，结果大于 0
- [x] T021 [AC1] 人工核对 trace viewer（AC#1 原文的操作）：对 T019、T020 的 zip 各后台跑 `pnpm exec playwright show-trace --port 0 "$ZIP"`，打开它打印的 `Listening on` URL（浏览器或 Playwright MCP），选中失败的 Expect，Before / After 两个页签都看得到页面；核完结束 show-trace 进程

**停止条件**（不在实现里绕过去，quickstart AC#1 第 4 步）：

- 快照脚本只输出 `before`：AC#1「失败断言前后的 DOM 快照」与 Playwright 的实际行为不符，停下，和用户一起改 AC 措辞
- 扩展仍没有 `trace.zip`，或 trace 里没有 `chrome-extension://`：config 的 trace 没覆盖 fixture 自建的上下文，停下重新 plan
  （research D3），不在 fixture 里补手动 `context.tracing`

- [x] T022 [AC1] 删除 `apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts` 与 `apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts`；`git status --short` 只剩交付物：六个配置、`ci-template.yml`、T001 改到的需求文件、本目录文档
- [x] T023 [AC1] 质量门：重跑 T006 的命令，零新增警告；`NX_DAEMON=false pnpm nx format:check --base=main` 通过

**Checkpoint**: AC#1 绿，先不回写故事。AC#3 若走 D6，配置会变，AC#1 要在最终配置上重核（T030）

---

## Phase 4: AC#3 — 开销在冻结上限内 (Priority: P1)

**Goal**: 按 research D5 冻结的量法，angular 全量 `stats.duration` 中位数增幅 ≤ +10%，off 臂噪声 ≤ 5%（故事 AC#3）。实测走完 D6 仍超限，用户裁决上限改为 +33%（research D6）

**Independent Test**: `specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv` 最后一节是 `# verdict: valid-pass`

> 量法已冻结，实现阶段只执行、不改，要改先回到 plan。记录格式与判定表见 data-model §5，每轮命令见 quickstart AC#3 第 3 步

- [x] T024 [AC3] 独占机器（停顿点，先问用户）：请用户让 Codex 等并行会话空闲，停掉 `/Users/jimmy/Documents/aiao/rxdb_ai_doc` 的 nx 任务与本仓库的 `nx graph --watch`；确认后核对 `ps -axo pid,etime,command` 里没有别的 nx 任务 / vite / playwright，`git status --short` 没有外来改动，记下 `sysctl -n vm.loadavg`。发现并发写入就停手，和用户商量分工
- [x] T025 [AC3] `mkdir -p "$TMPDIR/us909-ac3"`，按 data-model §5 写 `specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv` 的头部：
  - `# machine:`（`sysctl -n hw.model hw.ncpu hw.memsize`）、`# os:`（`sw_vers -productVersion`）、`# node:`（`node -v`）、
    `# playwright:`（`pnpm exec playwright --version`）
  - `# head:`（`git rev-parse HEAD`，后接 `git diff --stat` 的汇总行）、`# trace: 'retain-on-failure'`
  - `# cmd_off:` / `# cmd_on:`：quickstart AC#3 第 3 步两臂的完整命令
  - `# n: 5`、`# order: w1 off, w2 on; off on on off off on on off off on`、`# started:`（UTC，ISO 8601）；`# ended:` 留到 T028 回填
  - 列头一行，tab 分隔：`seq arm started_at load1 duration_ms expected unexpected skipped flaky json note`
- [x] T026 [AC3] 预热：在 `apps/dev-rxdb-angular-e2e` 下按 quickstart AC#3 第 3 步跑 `w1`（off）、`w2`（on），各记一行，不进中位数；按 w1 的耗时估总时长（N=5 共 12 轮），告诉用户
- [x] T027 [AC3] 正式 N=5：顺序 `off on on off off on on off off on`，seq `1`…`10`。每轮先记 `started_at` 与 `load1`，跑对应臂的命令，用 quickstart 的 node 单行取 `duration_ms expected unexpected skipped flaky`，追加一行（`json` 填报告文件名）。`unexpected` > 0 时 `note` 记 `failed: <用例名>`，同一序号立即重跑一次（seq 加 `r`），重跑行进中位数。全程不跑 nx、不切 commit、不重建，除追加 TSV 外不动工作树。可把这套命令写成驱动脚本放在 `$TMPDIR/us909-ac3/`（不进仓库）后台跑
- [x] T028 [AC3] 派生值与判定：在 `ac3-runs.tsv` 末尾追加 `# median_off`、`# median_on`、`# increase`（`median_on / median_off − 1`）、`# noise_off`（off 臂有效行的 `(max − min) / median`）与 `# verdict`，回填 `# ended`。按「无效 → 噪声 → 增幅」的顺序判：`invalid`（同一序号重跑仍失败；或失败总数含预热 ≥ 2；或有效行之间 `expected` / `skipped` 不一致）→ `noisy`（`noise_off` > 5%）→ `valid-pass`（`increase` ≤ +10%）/ `valid-over`（> +10%）
- [x] T029 [AC3] 仅当 `noisy`：静置机器，整组（含预热）按 N=9 重跑，顺序 `off on on off off on on off off on on off off on on off off on`，在同一文件追加新的一节（新头部 `# n: 9`、新行、新派生值）；仍超 5% 即 `noisy-again`，停下带数据报告
- [x] T030 [AC3] 仅当 `valid-over`（research D6 第 1 步）：
  - 六个配置一起改成 `trace: { mode: 'retain-on-failure', screenshots: false }`（扩展 e2e 即
    `use: { trace: { mode: 'retain-on-failure', screenshots: false } }`），配置里的注释不动；`ci-template.yml` 注释首行的
    `trace: 'retain-on-failure'` 随之改成对象写法的说法（偏离 data-model §1 原文，报告时标出）
  - 在同一文件追加一节原样重量：`# trace:` 记新值，含预热；off 臂命令不变，CLI 的 `--trace` 只替换 `mode`
  - 量完临时加回 T007 / T008 的探针，重跑 T019 / T020，确认 AC#1 仍成立，再删掉
  - 仍 `valid-over`：AC#1 与 AC#3 冲突，停下，带数据交用户裁决；不退回旧模式，不放宽上限
  - 结果：重量 +32.7%，仍超限；用户裁决上限改为 +33%、保留 `screenshots: false`（research D6）。AC#1 在新配置上重核通过

**停止条件**：`invalid` → 停下排查，失败用例按产品缺陷线索报告；`noisy-again`、D6 后仍超限 → 停下，带数据报告。

- [x] T031 [AC3] 回写故事 `requirements/stories/future/US-909-session-replay-debugging.md` 的验收标准表：AC#1 预期结果格末尾追加「结论：…」（探针先红后绿；angular 与扩展各恰好一份 `trace.zip`；快照 `after,before`；扩展 trace 含 `chrome-extension://`），状态 ✅；AC#3 同样追加「结论：…」（两臂中位数、增幅、off 臂噪声、N、verdict，走了 D6 就注明 `screenshots: false`；原始记录见 `specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv`，写成代码而非链接），状态 ✅

**Checkpoint**: AC#1、AC#3 都在最终配置上成立，可以提交

---

## Phase 5: AC#2 — CI 上首次失败那次的 trace 在 artifact 里 (Priority: P1)

**Goal**: CI（`retries: 2`）上首次失败、重试通过的用例，job 绿，首次失败那次的 `trace.zip` 在 artifact 里；六个配置都是
`retain-on-failure`（故事 AC#2，research D8）

**Independent Test**: 临时分支 draft PR 的 run 里 angular e2e job 绿，artifact 中探针恰好一份 `trace.zip`，在不带 `-retry` 后缀的
目录里（quickstart AC#2 第 5～7 步）

- [x] T032 [AC2] 🔒 交付提交（`rrweb`）：
  - 暂存六个配置、`.github/workflows/ci-template.yml`、T001 / T031 改到的需求文件（故事、`requirements/status-overview.md`、
    `requirements/roadmap.md`、`requirements/epics/epic-004-future-features.md`，以及 audit 改到的其他文件）、
    `specs/003-us-909-trace-retain-on-failure/`（含 `tasks.md`、`ac3-runs.tsv`）
  - `git diff --cached --stat` 不含任何 `us909-*probe*`
  - 提交信息 `chore(aiao): e2e 失败尝试保留 trace（US-909 阶段 A）`，结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；
    commit-msg 钩子通过
- [x] T033 [AC2] 🔒 临时分支：`git switch -c us909-ac2-probe`；新建 `apps/dev-rxdb-angular-e2e/src/us909-ci-retry-probe.spec.ts`，一条用例 `test('US-909 AC#2 探针：首次尝试失败、重试通过', async ({ page }, testInfo) => { … })`，`await page.goto('/')` 后 `expect(testInfo.retry, 'US-909 AC#2 探针：首次尝试故意失败').toBeGreaterThan(0)`；只 `git add` 这一个文件，提交信息 `chore(aiao): US-909 AC#2 临时探针（不合并）`，结尾 Co-Authored-By
- [x] T034 [AC2] 🔒 `git push -u origin us909-ac2-probe`；`gh pr create --draft --base main --title "chore(aiao): US-909 AC#2 临时探针（不合并）" --body …`（正文：只为触发 CI 验 US-909 AC#2，验完关闭并删分支；结尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`）。CI 会 lint PR 标题
- [x] T035 [AC2] 核对 run 对应当前提交：`gh run list --branch us909-ac2-probe --limit 3 --json databaseId,headSha,status,conclusion` 的 headSha 等于 `git rev-parse HEAD`；之后每次重跑前再核一次（同一并发组里重跑旧 run 会取消新提交的 run）
- [x] T036 [AC2] `gh pr checks <pr>`，轮询间隔 ≥ 30 s：`ci / gate` 与 `ci / e2e (angular)` 绿，http、react、supabase、supabase remote、vue、rxdb-devtools-extension 的 e2e job 也绿（config 没有 `failOnFlakyTests`，探针不判红）；有红先读日志定位，不盲目重跑。结果（run `36892293781`，headSha `881b3bf5`）：七个 e2e job 全绿，探针 1 flaky；`ci / gate` 红，原因是 gate 把「改了 `apps/` 却没有 test 项目」判为 affected 失真，而纯 e2e 改动本来就没有 `test` target，属 gate 误判
- [x] T037 [AC2] `gh run download <run-id> -n playwright-dev-rxdb-angular-e2e-e2e -D "$TMPDIR/us909-ac2"`，再 `find "$TMPDIR/us909-ac2" -name trace.zip`：探针（目录名以 `us909-ci-retry-probe` 开头）恰好一份，目录不带 `-retry` 后缀；`-retry1` 目录下没有 `trace.zip`（目录本身可能不存在）；探针以外的 `trace.zip` 说明别的用例在 CI 上首次失败过，作为缺陷线索报告
- [x] T038 [P] [AC2] 在临时分支上 `grep -n "retain-on-failure" apps/*/playwright.config.ts` 恰好六行（data-model §1 校验规则）
- [x] T039 [AC2] 🔒 收尾：`git switch rrweb`；`gh pr close <pr> --delete-branch`（关 draft PR，删远端与本地的临时分支）；确认 `git branch --list us909-ac2-probe` 为空，rrweb 上没有 `us909-ci-retry-probe.spec.ts`

**Checkpoint**: AC#1～3 全部成立，探针全部清走

---

## Phase 6: Polish & 交付

**Purpose**: 回写、派生视图、交付 PR、合并后收尾

- [x] T040 回写故事 `requirements/stories/future/US-909-session-replay-debugging.md`：AC#2 预期结果格末尾追加「结论：run `<id>`（headSha `<短 sha>`）…」（探针首次失败、重试通过，job 绿；首次失败那次的 `trace.zip` 在 artifact 里；六个配置都是 `retain-on-failure`），状态 ✅；交付阶段表 A 行 `⬜` → `✅`；`status` 保持 `In Progress`（B / C 未交付）；`updated` 取当天
- [x] T041 派生视图改为「阶段 A 已交付」：`requirements/status-overview.md` 的进行中表 US-909 行（阶段 A 已交付；B 待第二连接 spike，C 未开始）与 epic-004 小节 US-909 行；`requirements/roadmap.md` 未完成需求全景表 US-909 行的「剩什么」与批次 3 的 US-909 行。`requirements/epics/epic-004-future-features.md` 的故事清单不带状态，不改；31 行目标保持 `[ ]`（B / C 未交付）。`pnpm run audit:requirements` 通过
- [x] T042 交付前自检：`NX_DAEMON=false pnpm nx format:check --base=main` 通过；`git diff main --stat` 不含任何 `us909-*probe*` 文件
- [x] T043 🔒 提交 T040 / T041 的改动（`docs(aiao): 回写 US-909 阶段 A 的验收结论`，结尾 Co-Authored-By）；`git push origin rrweb`；`gh pr create --base main --head rrweb --title "chore(aiao): e2e 失败尝试保留 trace（US-909 阶段 A）" --body …`（正文：改动、AC#1～3 结论摘要、AC#2 临时 PR 链接，说明探针不在本 PR；结尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`）。pre-push 钩子与 CI 的 PR 标题 lint 都要过
- [ ] T044 交付 PR 的 CI：先按 T035 的方法核 headSha，`ci / gate` 绿；红了先读日志，修复的提交与推送另行放行。不设门禁的观察：`ci / e2e (angular)` 的 E2E 步骤时长对照 main 的 4:17–5:12，超过约 6:55（区间上沿 × 1.33，随上限裁决从 5:43 改来）就报告用户，不阻塞交付
- [ ] T045 🔒 合并后（合并由用户操作）：按 specs/001、002 的先例删除 `specs/003-us-909-trace-retain-on-failure/`，故事里指向本目录的引用改成 `git show <合并 sha>:specs/003-us-909-trace-retain-on-failure/<文件>`，可随阶段 B 的第一个 PR 一起提交；阶段 B 开工时 `.specify/feature.json` 改指新的特性目录

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖；T001 开工即做；T003 → T004 串行，不同时跑两个 nx 任务
- **Foundational (Phase 2)**: 依赖 Setup；T005 / T006 并行
- **AC#1 (Phase 3)**: 依赖 Foundational
- **AC#3 (Phase 4)**: 依赖 AC#1——量的是改好的配置，且探针已删（否则全量里带着必失败用例）
- **AC#2 (Phase 5)**: 依赖 AC#3 判定 `valid-pass`——D6 改配置发生在提交与推送之前，AC#2 验的是最终配置
- **Polish (Phase 6)**: 依赖 AC#2

### AC Dependencies

- **AC#1**: Foundational 后即可开始，无 AC 间依赖
- **AC#3**: 依赖 AC#1；走 D6 时反过来要在新配置上重核 AC#1（T030）
- **AC#2**: 依赖 AC#1 与 AC#3；本身只读 CI 结果，不改交付物

### Within Each AC

- AC#1：T007 / T008 → T009 / T010（红）→ T011–T017 → T018 → T019 / T020（绿）→ T021 → T022 → T023
- AC#3：T024 → T025 → T026 → T027 → T028 →（视 verdict：T029 或 T030）→ T031
- AC#2：T032 → T033 → T034 → T035 → T036 → T037 → T039；T038 在 T033 之后任意时刻

### Parallel Opportunities

- Foundational：T005 / T006
- AC#1：T007 / T008；T011–T017（七个不同文件）
- AC#2：T038 与等 CI 的 T035–T037
- AC#3 没有并行：要独占机器，两臂必须串行交错

---

## Parallel Example: AC#1

```bash
# 两个探针先落，随后各自先红（T009 / T010）：
Task: T007 "angular 临时探针 apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts"
Task: T008 "扩展临时探针 apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts"

# 红跑完后，七处改动一起落：
Task: T011 "angular 配置改值 + 英文注释"
Task: T012 "react 配置改值 + 英文注释"
Task: T013 "vue 配置改值 + 英文注释"
Task: T014 "supabase 配置改值 + 中文注释"
Task: T015 "http 配置只改值"
Task: T016 "扩展 e2e 新增 use 块 + 中文注释"
Task: T017 "ci-template.yml 注释整段替换"
```

---

## Implementation Strategy

### MVP First (AC#1 Only)

1. Phase 1 Setup + Phase 2 Foundational
2. Phase 3 AC#1：探针先红，改七处，再绿
3. **STOP and VALIDATE**：两个项目各恰好一份 `trace.zip`，快照 `after,before`，扩展含 `chrome-extension://`，show-trace 人工确认
4. MVP 不单独提交：AC#3 可能走 D6 改配置，提交等最终配置

### Incremental Delivery

1. Setup + Foundational → 开工登记、基线确认
2. AC#1 → 本地失败有 trace（MVP）
3. AC#3 → 开销在冻结上限以内（+10%，必要时经 D6；实测后用户裁决改为 +33%）
4. AC#2 → CI 上首次失败那次的 trace 在 artifact 里
5. Polish → 回写、派生视图、交付 PR；合并后删特性目录

### 停顿点

到点停下等用户，不连续执行：

| 任务                                    | 等什么                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| T024                                    | AC#3 独占机器：Codex 空闲，`rxdb_ai_doc` 的 nx 与 `nx graph --watch` 停下 |
| T032 / T033 / T034 / T039 / T043 / T045 | 🔒 逐条放行                                                               |
| AC#1 / AC#3 的停止条件                  | 改 AC 措辞、重新 plan，或裁决 AC#1 与 AC#3 的冲突                         |

### Parallel Team Strategy

不适用：改动面是 6 个配置加 1 段注释，AC#3 要独占机器，AC 之间串行依赖。

---

## Notes

- [P] = 不同文件、无未完成依赖；[AC#] 把任务对到故事的验收标准
- 先红后绿：T009 / T010 必须按预期原因红（运行正常、没有 `trace.zip`）才改配置
- 探针（`us909-*-probe.spec.ts`）永不进交付 PR；AC#2 的探针只活在临时分支上
- 停止条件不在实现里绕：不加手动 `context.tracing`，不退回旧模式，不放宽上限，不改量法
- 不执行可选的 `/speckit-git-commit` 钩子：提交只发生在 🔒 任务里，且逐条经用户放行
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
