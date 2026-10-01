# Quickstart: US-909 阶段 A — e2e 失败尝试保留 trace

**Feature**: `003-us-909-trace-retain-on-failure` | **Date**: 2026-10-01

AC#1～3 的验证步骤。改什么见 [data-model §1](data-model.md#1-配置清单)，为什么这样验证见 [research.md](research.md) D5～D8。

- 命令都在仓库根目录执行，步骤里先 `cd` 的除外。
- 🔒 标记的步骤会留下提交或对外可见，用户放行后才执行。
- 执行顺序是 AC#1 → AC#3 → AC#2：AC#3 超限时要改配置（research D6），这一步放在提交与推送之前，AC#2 验的就是最终配置。

## 前提

```bash
export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"  # pnpm 的 preinstall 门禁要求 Node 26
unset CI                                                  # 置位会让 retries 变 2、workers 变 1，并追加 blob reporter
pnpm exec playwright install chromium
lsof -i :8200 -i :8210                                    # 应无输出：两个 webServer 都不复用已有进程，端口被占直接报错
pnpm nx build dev-rxdb-angular                            # angular e2e 的 webServer 只 serve dist/apps/dev-rxdb-angular/browser
pnpm nx run rxdb-devtools-extension-e2e:prepare           # 扩展与 fixture 页面，落在 dist/apps/rxdb-devtools-extension-e2e
```

- nx 报 `Cannot find module …/@nx/<plugin>/dist/plugin` 时（同时给出的 `NX_PREFER_NODE_STRIP_TYPES` 提示是误导），是 daemon 早于
  `node_modules` 重装启动，还拿着旧路径；本机当前就是这样。命令前加 `NX_DAEMON=false`，或 `pnpm nx daemon --stop` 后重跑，后者会
  断开正在跑的 `nx graph --watch`。
- AC#3 要独占机器：`ps` 里没有别的 nx 任务、vite、playwright，并行会话（含 Codex）空闲，`git status` 只有本特性的改动。发现并发
  写入就先停下，和用户商量分工。
- AC#3 的总时长按预热 w1 的耗时估：N=5 共 12 轮，N=9 共 20 轮。

## AC#1

临时探针，跑完删除（research D7）：

| 探针文件                                                                                                            | 必过用例                           | 必失败用例                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/dev-rxdb-angular-e2e/src/us909-trace-probe.spec.ts`                                                           | `goto('/')` 后 `body` 可见         | `goto('/')` 后断言 `getByTestId('us909-never-rendered')` 可见，`timeout: 1000`                                              |
| `apps/rxdb-devtools-extension-e2e/src/us909-trace-probe.spec.ts`（`test` / `expect` 从 `./extension.fixture` 导入） | `extensionId` 匹配 `/^[a-p]{32}$/` | `context.newPage()` 打开 `chrome-extension://${extensionId}/panel.html`，再断言同一个不存在的 test id 可见，`timeout: 1000` |

1. 红（改配置前）。两个项目各跑一遍：

   ```bash
   cd apps/dev-rxdb-angular-e2e   # 扩展：cd apps/rxdb-devtools-extension-e2e
   pnpm exec playwright test src/us909-trace-probe.spec.ts --retries=0 --reporter=list
   find test-output/playwright/output -name trace.zip
   ```

   预期：1 passed / 1 failed，失败原因是找不到 `us909-never-rendered`；`find` 无输出。运行本身不正常（webServer 没起来、两条都失败）
   不算红，先排查。

2. 按 [data-model §1](data-model.md#1-配置清单) 改六个配置与 `ci-template.yml` 的注释。

3. 绿。同样的命令再跑：仍是 1 passed / 1 failed；`find` 恰好一行，落在必失败用例的尝试目录里。接着在项目目录核对快照。
   zip 里不止一个 `.trace`（runner 的 `test.trace` 加每个上下文一个），末行都不带换行，直接 `unzip -p "$ZIP" '*.trace'`
   拼接会把相邻两行粘成一行、`JSON.parse` 报错，所以逐个解出、中间补换行：

   ```bash
   ZIP=$(find test-output/playwright/output -name trace.zip)
   for f in $(unzip -Z1 "$ZIP" '*.trace'); do unzip -p "$ZIP" "$f"; echo; done | node -e '
   let s = "";
   process.stdin.on("data", (d) => (s += d)).on("end", () => {
     const ev = s.split("\n").filter(Boolean).map((l) => JSON.parse(l));
     const ids = new Set(ev.filter((e) => e.type === "before" && e.class === "Frame" && e.method === "expect").map((e) => e.callId));
     const phases = new Set(ev.filter((e) => e.type === "frame-snapshot" && ids.has(e.snapshot.callId)).map((e) => e.snapshot.phase));
     console.log([...phases].sort().join(","));
   });'
   ```

   - 两个项目都应输出 `after,before`：失败断言前后各有一个 DOM 快照（`Frame.expect` 不是输入类动作，没有 `action` 快照）。
   - 扩展：`unzip -p "$ZIP" '*.trace' | grep -c 'chrome-extension://'` 大于 0，trace 来自 fixture 自建的持久化上下文。
   - `pnpm exec playwright show-trace "$ZIP"`，选中失败的 Expect，Before / After 两个页签都能看到页面（人工确认）。

4. 例外，都不在实现里绕过去：
   - 只输出 `before`：AC#1 的「失败断言前后的 DOM 快照」与 Playwright 的实际行为不符，停下，和用户一起改 AC 措辞。
   - 扩展仍没有 `trace.zip`，或 trace 里没有 `chrome-extension://`：config 的 trace 没覆盖 fixture 自建的上下文，停下重新 plan
     （research D3），不在 fixture 里补手动 `context.tracing`。

5. 删掉两个探针。`git status` 只剩交付物：六个配置、`ci-template.yml`，以及本目录的文档。

## AC#2

1. 🔒 交付改动在 `rrweb` 上提交（探针已在 AC#1 删除；AC#3 已通过）。
2. 🔒 切临时分支 `us909-ac2-probe`，新增 `apps/dev-rxdb-angular-e2e/src/us909-ci-retry-probe.spec.ts`：`testInfo.retry === 0` 时断言失败，
   否则通过。只提交这一个文件。
3. 🔒 推送并开 draft PR，只为触发 CI，不合并：

   ```bash
   git push -u origin us909-ac2-probe
   gh pr create --draft --base main --title "<标题，注明临时探针、不合并>" --body "<正文>"
   ```

4. 确认 run 对应当前提交；之后每次重跑前都再核一次，同一并发组里重跑旧 run 会取消新提交的 run：

   ```bash
   gh run list --branch us909-ac2-probe --limit 3 --json databaseId,headSha,status,conclusion
   git rev-parse HEAD
   ```

5. `gh pr checks <pr>`，预期：`ci / gate` 绿；`ci / e2e (angular)` 绿；其余 e2e job（http、react、supabase、supabase remote、vue、
   rxdb-devtools-extension）也绿。config 没有 `failOnFlakyTests`，首次失败、重试通过的探针不判红。

6. 下载 angular 的 artifact，找 trace：

   ```bash
   gh run download <run-id> -n playwright-dev-rxdb-angular-e2e-e2e -D "$TMPDIR/us909-ac2"
   find "$TMPDIR/us909-ac2" -name trace.zip
   ```

   预期：探针（目录名以 `us909-ci-retry-probe` 开头）恰好一份，目录不带 `-retry` 后缀，即首次失败那次；`-retry1` 目录下没有
   `trace.zip`（目录本身可能不存在）。job 绿加上这一份 trace，就证明探针首次失败、重试通过。探针以外的 `trace.zip` 说明别的用例
   在 CI 上首次失败过，作为缺陷线索报告。

7. `grep -n "retain-on-failure" apps/*/playwright.config.ts` 恰好六行（[data-model §1](data-model.md#1-配置清单)）。

8. 🔒 收尾。临时分支与 draft PR 都不合并；交付 PR 另开，不含探针。

   ```bash
   git switch rrweb
   gh pr close <pr> --delete-branch
   ```

## AC#3

量法在 research D5 冻结，记录格式与判定在 [data-model §5](data-model.md#5-ac3-记录)。这里只执行，要改量法先回到 plan。

1. 起点：AC#1 已绿、探针已删（否则全量里带着必失败用例）；前提里的构建已做；机器独占。之后量测全程不跑 nx、不切 commit、不重建。
2. 按 data-model §5 写好 `specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv` 的头部，建报告目录 `mkdir -p "$TMPDIR/us909-ac3"`。
3. 每轮在 `apps/dev-rxdb-angular-e2e` 下执行：

   ```bash
   date -u +%FT%TZ                           # started_at
   sysctl -n vm.loadavg | awk '{print $2}'   # load1，开跑前记
   # off 臂：CLI 只把 mode 换成旧值，--retries=0 下等于不录
   PLAYWRIGHT_JSON_OUTPUT_FILE="$TMPDIR/us909-ac3/<seq>-off.json" pnpm exec playwright test --retries=0 --reporter=json --trace=on-first-retry
   # on 臂：config 的 retain-on-failure
   PLAYWRIGHT_JSON_OUTPUT_FILE="$TMPDIR/us909-ac3/<seq>-on.json" pnpm exec playwright test --retries=0 --reporter=json
   # 数值列：duration_ms expected unexpected skipped flaky
   node -e 'const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).stats; console.log([Math.round(s.duration), s.expected, s.unexpected, s.skipped, s.flaky].join("\t"))' "$TMPDIR/us909-ac3/<seq>-<arm>.json"
   ```

4. 顺序：预热 `w1`（off）、`w2`（on），不进中位数；正式 N=5，`off on on off off on on off off on`。判定为 `noisy` 时静置机器，
   整组（含预热）按 N=9 重跑：`off on on off off on on off off on on off off on on off off on`。
5. 按 data-model §5 算派生值、给 verdict：
   - `valid-pass`：AC#3 通过。
   - `valid-over`：走 research D6 第 1 步，六个配置一起改成 `{ mode: 'retain-on-failure', screenshots: false }`，在同一文件追加一节
     原样重量；AC#1 第 3 步临时加回探针再跑一遍，跑完删掉。仍超限就带数据交用户裁决。
   - `invalid` / `noisy-again`：停下，带数据报告。
6. 结论摘要回写故事 AC#3；🔒 TSV 随交付 PR 提交，JSON 报告留在 `$TMPDIR/us909-ac3/`。
7. 不设门禁的 CI 观察：交付 PR 里 `ci / e2e (angular)` 的 E2E 步骤时长，对照 main 最近三次成功 run 的 4:17–5:12。超过约 6:55
   （区间上沿乘以 1.33，随 research D6 的上限裁决从 5:43 改来）就报告用户，不阻塞交付：每次推送只有一个样本，共享 runner 的噪声也大。
