# Data Model: US-909 阶段 A — e2e 失败尝试保留 trace

**Feature**: `003-us-909-trace-retain-on-failure` | **Date**: 2026-10-01

本阶段没有业务实体。这里记录改动对象（配置与注释）、一次尝试的 trace 生命周期、artifact 布局，以及 AC#3 量测记录的格式与判定。
决策理由见 [research.md](research.md)。

## 1. 配置清单

文件都是 `apps/<项目>/playwright.config.ts`。

| 项目                          | 现值（行）                  | 目标                                       | 注释                 | 备注                                                         |
| ----------------------------- | --------------------------- | ------------------------------------------ | -------------------- | ------------------------------------------------------------ |
| `dev-rxdb-angular-e2e`        | `'on-first-retry'`（52）    | `'retain-on-failure'`                      | 改写 51 行（英文）   |                                                              |
| `dev-rxdb-react-e2e`          | `'on-first-retry'`（35）    | `'retain-on-failure'`                      | 改写 34 行（英文）   | 覆写了 reporter：没有 blob，html 报告落 `playwright-report/` |
| `dev-rxdb-vue-e2e`            | `'on-first-retry'`（37）    | `'retain-on-failure'`                      | 改写 36 行（英文）   |                                                              |
| `dev-rxdb-supabase-e2e`       | `'on-first-retry'`（50）    | `'retain-on-failure'`                      | 改写 49 行（中文）   | `e2e-remote` 用同一份 config（research D9）                  |
| `dev-rxdb-http-e2e`           | `'on-first-retry'`（44）    | `'retain-on-failure'`                      | 原本没有注释，只改值 |                                                              |
| `rxdb-devtools-extension-e2e` | 没有 `use` 块（默认 `off`） | 新增 `use: { trace: 'retain-on-failure' }` | 新增一行（中文）     | 插在 `expect` 与 `webServer` 之间                            |

注释文案：

- angular / react / vue，替换原注释行：
  `/* Record a trace for every attempt and keep it only when the attempt fails. See https://playwright.dev/docs/trace-viewer */`
- supabase，替换原注释行：`/* 每次尝试都录 trace，只保留失败的尝试，见 https://playwright.dev/docs/trace-viewer */`
- 扩展 e2e，新增的 `use` 块上方：`// 每次尝试都录 trace，只保留失败的尝试；fixture 自建的持久化上下文同样会被录。`

`.github/workflows/ci-template.yml` 870-874 行（「Upload Playwright artifacts」上方，6 空格缩进）整段替换为：

```yaml
# 失败复盘用。web demo e2e 与 devtools 扩展 e2e 的 config 都是 `trace: 'retain-on-failure'`：
# 每次尝试都录，只留失败的尝试（重试转绿的用例，首次失败那次的 trace 也在）。
# electron e2e 经 `_electron.launch()` 起应用，config 的 trace 对它不生效。
# trace.zip 落在 test-output/playwright/output/ 下：
#   pnpm exec playwright show-trace <zip>
# 第二条 path 是为了兜住 dev-rxdb-react-e2e —— 它覆写了 reporter，
# html 报告落在 playwright-report/ 而不是 preset 的 test-output/playwright/report/。
```

不改的配置（故事 Out of Scope）：

| 项目                       | 现值                            | 不改的原因                                                                         |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `dev-rxdb-electron-e2e`    | `trace: 'on-first-retry'`（31） | `_electron.launch()` 不触发 `runAfterCreateBrowserContext`，config 的 trace 不生效 |
| `dev-rxdb-miniprogram-e2e` | `trace: 'off'`（36）            | Playwright 只当测试运行器，没有浏览器上下文可录                                    |
| `dev-rxdb-tauri-e2e`       | 没有 Playwright config          | 跑的是 vitest                                                                      |

校验规则：`grep -n "retain-on-failure" apps/*/playwright.config.ts` 恰好六行，分属上面第一张表的六个项目；electron 与 miniprogram
两行不变。注释文案里不含 `retain-on-failure` 字样，不会多出匹配。

## 2. 尝试生命周期

```text
尝试开始
  └─ 每新建一个上下文（browser.newContext() / launchPersistentContext()）→ 开始录
用例中途关闭的上下文 → 先写一份临时 zip（这份开销计入 AC#3）
尝试结束
  ├─ 状态等于预期（通过；test.fail() 标注的用例则是失败）→ 丢弃临时文件，什么都不留
  └─ 否则 → 收集 sources / attachments，合并为 <尝试目录>/trace.zip
```

- 尝试目录在 `test-output/playwright/output/` 下，名字取自 spec 文件与用例标题；重试的目录加 `-retry<N>` 后缀。
- outputDir 在每次运行开始时清空，本地不累积。

## 3. trace 份数

| 场景                        | 本地 `--retries=0` |  CI `retries: 2`  |
| --------------------------- | :----------------: | :---------------: |
| 通过                        |         0          |         0         |
| 失败                        |         1          |         3         |
| flaky（首次失败、重试通过） |         —          | 1（首次失败那次） |
| 失败两次后通过              |         —          |         2         |

对照旧的 `on-first-retry`：本地恒为 0；CI 上只有 `-retry1` 那一份，flaky 用例的那份还是通过那次的。

## 4. artifact 布局

```text
apps/<项目>/
├── test-output/playwright/
│   ├── output/<尝试目录>/trace.zip    # 原件
│   ├── report/data/<sha1>.zip         # html 报告的拷贝
│   └── blob-report/<blob>.zip         # 仅 CI；内嵌 resources/<sha1>
└── playwright-report/data/<sha1>.zip  # 仅 react：覆写了 reporter，html 落这里，没有 blob
```

CI 的「Upload Playwright artifacts」上传这两棵目录，保留 7 天。一份 trace 在 artifact 里约出现三次，react 约两次。

## 5. AC#3 记录

文件：`specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv`。量法见 [research D5](research.md#d5-ac3-量法冻结)。

头部是 `# key: value` 行：

| key                   | 内容                                                          |
| --------------------- | ------------------------------------------------------------- |
| `machine`             | 型号 / 核数 / 内存（`sysctl -n hw.model hw.ncpu hw.memsize`） |
| `os`                  | `sw_vers -productVersion`                                     |
| `node` / `playwright` | `node -v` / `pnpm exec playwright --version`                  |
| `head`                | `git rev-parse HEAD`，后接 `git diff --stat` 的汇总行         |
| `trace`               | 被量的 config 值，如 `'retain-on-failure'`                    |
| `cmd_off` / `cmd_on`  | 两臂的完整命令                                                |
| `n` / `order`         | 每臂轮数与执行顺序                                            |
| `started` / `ended`   | 起止时间（UTC，ISO 8601）                                     |

每轮一行，tab 分隔：

| 列                                              | 含义                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `seq`                                           | 轮次：预热 `w1` / `w2`，正式 `1`…`2N`，重跑在原序号后加 `r` |
| `arm`                                           | `off` / `on`                                                |
| `started_at`                                    | 本轮开始时间（UTC）                                         |
| `load1`                                         | 开跑前的 1 分钟负载（`sysctl -n vm.loadavg` 的第一个数）    |
| `duration_ms`                                   | `stats.duration` 取整                                       |
| `expected` / `unexpected` / `skipped` / `flaky` | JSON 报告 `stats` 的同名字段                                |
| `json`                                          | 报告文件名（在 `$TMPDIR/us909-ac3/` 下）                    |
| `note`                                          | 失败时记 `failed: <用例名>`，其余留空                       |

规则：

- `unexpected` > 0 的行不进中位数；同一序号立即重跑一次，重跑行进中位数。预热轮失败计入失败总数，不重跑。
- `--retries=0` 下 `flaky` 必为 0。
- 末尾追加派生值：`# median_off`、`# median_on`、`# increase`（`median_on / median_off − 1`）、`# noise_off`（off 臂
  `(max − min) / median`）与 `# verdict`。
- N=9 重跑、D6 第 1 步的重量都在同一文件追加新的一节：新的头部、新的行、新的派生值。

判定按「无效 → 噪声 → 增幅」的顺序。实现期修订（research D5，2026-10-01）：`noise_off` > 5% 时先看极值比，
`min_on / max_off − 1` > +10% 直接判 `valid-over`，`max_on / min_off − 1` ≤ +10% 直接判 `valid-pass`，都不满足才判
`noisy` / `noisy-again`。用了极值比的一节在派生值里补 `# bounds`（两个比值）。

| verdict       | 条件                                                                                    | 动作                                 |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| `invalid`     | 同一序号重跑仍失败；或失败总数（含预热）≥ 2；或有效行之间 `expected` / `skipped` 不一致 | 停下排查；失败用例按产品缺陷线索报告 |
| `noisy`       | N=5 时 `noise_off` > 5%                                                                 | 静置机器，整组（含预热）按 N=9 重跑  |
| `noisy-again` | N=9 时 `noise_off` 仍 > 5%                                                              | 停下，带数据报告                     |
| `valid-pass`  | 噪声达标，`increase` ≤ +10%                                                             | AC#3 通过                            |
| `valid-over`  | 噪声达标，`increase` > +10%                                                             | 走 research D6 第 1 步               |

D6 走完仍超限，用户裁决把上限改为 +33%（research D6）。

存放：TSV 随交付 PR 提交；交付后特性目录按 specs/001、002 的先例删除，数据留在 git 历史里。JSON 报告留在 `$TMPDIR/us909-ac3/`，
不提交。结论摘要（两臂中位数、增幅、噪声、N、verdict）回写故事 AC#3。
