# Research: US-909 阶段 A — e2e 失败尝试保留 trace

**Feature**: `003-us-909-trace-retain-on-failure` | **Date**: 2026-10-01

Playwright 的行为都读 1.63.0 源码确认：测试运行器的录制与保留判定、`playwright-core` 的上下文创建钩子与 trace 写入。`@nx/playwright`
23.2.1 的 `nxE2EPreset` 同样读源码确认。CI 时长取自 main 最近三次成功的 run（2026-09-29～30）。Technical Context 没有遗留的
NEEDS CLARIFICATION。

## D1. 保留模式：`retain-on-failure`

- **Decision**: 六个配置的 `trace` 都设为 `'retain-on-failure'`。
- **Rationale**:
  - 每次尝试都录；尝试结束时状态等于预期（通过）就丢弃临时文件，否则合并成该尝试输出目录下的 `trace.zip`。三个盲区一次补齐：
    本地 `--retries=0` 的失败有 trace；CI 上首次失败的那次有 trace，之后重试转绿不影响它；扩展 e2e 从不录变成与 web demo 同一行为。
  - 重试也录、也按成败保留。重试只跟在失败后面，相对 `retain-on-first-failure` 多出的开销只落在已经失败的用例上；代价是硬失败
    在 CI 上留三份 trace（D10）。
- **Alternatives considered**:
  - `retain-on-first-failure`：只录 `retry === 0`。首次尝试的开销相同，但重试以另一种方式失败时，第二种失败没有 trace。
  - `retain-on-failure-and-retries`：通过的重试也留。没有哪个症状需要它，真需要时改一行。
  - `on`：通过的用例也留，outputDir 与 artifact 随用例数膨胀，没有对应的症状。
  - `on-first-retry`（现状）/ `on-all-retries`：首次尝试正是盲区。

## D2. 写法：字符串，内容选项取默认

- **Decision**: 写 `trace: 'retain-on-failure'`，不写对象形式；`snapshots` / `screenshots` / `sources` / `attachments` 都取默认（全开）。
- **Rationale**: `snapshots`（每个动作前后可检查的 DOM 快照）是 AC#1 的验收内容，不能关；`screenshots` 是 trace viewer 时间轴上的
  screencast 帧，先按默认量，超限才动（D6）。字符串写法与现状同形，改动面最小。
- **Alternatives considered**:
  - 预先关掉 `screenshots`：没有数据就先丢时间轴胶片。量过再定。
  - 各项目用不同的内容选项：破坏对称；开销机制在六个项目里是同一套。

## D3. 扩展 e2e：在 config 里加 `use` 块

- **Decision**: `apps/rxdb-devtools-extension-e2e/playwright.config.ts` 在 `expect` 与 `webServer` 之间加
  `use: { trace: 'retain-on-failure' }`，上方一行中文注释（文案见 [data-model §1](data-model.md#1-配置清单)）。fixture 不动。
- **Rationale**: 测试运行器的 trace 挂在 `runAfterCreateBrowserContext` 上，`playwright-core` 1.63 里调用它的三处之一是
  `launchPersistentContext()`。`extension.fixture.ts` 的 `context` fixture 是 test 作用域、覆写内置 `context`，正是用
  `chromium.launchPersistentContext()` 建的，所以测试级 trace 会录它。`nxE2EPreset` 不返回 `use`，新增的块不覆盖 preset 的任何值。
- **Alternatives considered**:
  - 在 fixture 里手动 `context.tracing.start()` / `stop()`：这是另一套设计（自己管保留与命名），不是 `use` 失效时的兜底。AC#1 若证明
    `use` 块录不出扩展的 trace，停下重新 plan，不两套叠加。
  - 扩展 e2e 不动：AC#1、AC#2 都把它算在内。

## D4. 注释同步：各文件沿用原有语言

- **Decision**: 改写描述 `on-first-retry` 的注释，不删。angular / react / vue 用同一句英文，supabase 用中文；http 原本没有注释，只改值；
  扩展 e2e 新增一行中文注释；`ci-template.yml` 870-874 行整段改写。文案见 [data-model §1](data-model.md#1-配置清单)。
- **Rationale**: 旧注释写的是「重试失败的用例时收集 trace」，改值不改注释就成了错注释。三框架同措辞是 parity 的一部分。各文件沿用
  原语言，本阶段不统一语言。
- **Alternatives considered**:
  - 删掉注释：模式名本身不说明「通过的尝试会被丢弃」，留一行说明省得读者去查文档。
  - 给 http 补注释：它原本就没有，补了是扩大改动面。

## D5. AC#3 量法（冻结）

- **Decision**:
  - 套件：`dev-rxdb-angular-e2e` 全量（27 个 spec 文件），config 自己的 `workers: 2` / `fullyParallel: false` 不覆写。
  - 命令：在项目目录跑 `pnpm exec playwright test --retries=0 --reporter=json`，`PLAYWRIGHT_JSON_OUTPUT_FILE` 指定报告路径，`CI` 不设。
  - 两臂跑同一棵改动后的工作树、同一份构建：on 臂不加参数（即 config 的 `retain-on-failure`）；off 臂加 `--trace=on-first-retry`，
    `--retries=0` 下它不录，与改动前的配置同效。
  - 指标：JSON 报告的 `stats.duration`。
  - 轮次：先各预热一轮（w1 off、w2 on，不计入），再两臂交错各 N=5 轮，顺序 `off on on off off on on off off on`。
  - 判定：off 臂噪声 `(max − min) / median` ≤ 5% 才算有效；增幅 `median_on / median_off − 1` ≤ +10% 即 AC#3 通过。噪声超标就
    静置机器，整组按 N=9 重跑。失败轮的处置与判定表见 [data-model §5](data-model.md#5-ac3-记录)。
  - 构建只做一次，之后量测全程不跑 nx；机器独占：没有别的 nx 任务 / vite / playwright，并行会话空闲，`git status` 没有外来改动。
  - 实现阶段只执行这套量法，不改；要改先回到 plan。
- **Rationale**:
  - 上限按可接受的代价定，不按预估的开销定。CI 上 e2e job 都不在 PR 关键路径上：PR 的墙钟由最长的单测分片决定
    （`test (rxdb-client-generator +14)`，22:24–22:50），而 angular 的 E2E 步骤是 4:17–5:12，+10% 约多 26～31 s，不拉长 PR 等待。
    真正每次都付这份开销的是本地：全量跑与 `--retries=0 --repeat-each=N` 复现，trace 却只在失败时才有用。
  - +10% 是噪声门的两倍，分辨得出；超了先试 D6 第 1 步，它只丢时间轴胶片，代价很小。
  - AC#3 只要求同一个 demo。选 angular：六个受影响的 e2e job 里它最长（6:13–6:34）；它的 config 把 `--retries=0 --repeat-each=N`
    定为本地复现动作，正是本阶段要补 trace、开销也最常落到人身上的路径。
  - 两臂同一棵树、只差一个 CLI 参数，唯一的变量就是 trace 模式；量测中途不切 commit、不重建。CLI 的 `--trace` 只替换 `mode`
    （`{ ...configTrace, mode }`），D6 改成对象形式后 off 臂依然成立。
  - `stats.duration` 从 onConfigure 到 onEnd，含 webServer 启动、用例执行与 trace 的保存 / 丢弃，不含进程启动、config 加载与报告
    写出：覆盖 trace 带来的全部开销，又把与模式无关的固定成本挡在外面。`--reporter=json` 替换 preset 的 html reporter，两臂都不生成
    html 报告，少一份噪声。
  - 交错顺序抵消机器状态随时间的线性漂移（温度、后台负载）；中位数抗单轮离群；噪声门取上限的一半，噪声比这大时 10% 的差分辨不出。
- **Alternatives considered**:
  - 两臂分别 checkout 改动前后的 commit：中途切树、可能触发重建，引入模式之外的变量。
  - off 臂用 `--trace=off`：`--retries=0` 下效果相同，但 `on-first-retry` 就是改动前的值，基线更直白。
  - 经 nx 跑：多出 daemon、项目图与缓存的开销和噪声；本机 daemon 当前就是陈旧的（[quickstart 前提](quickstart.md#前提)）。
  - 外部 `time` 计时：把进程启动、config 加载这些与模式无关的固定成本算进分母，稀释增幅。
  - 在 CI 上量：共享 runner 噪声大，每次推送只有一个样本，AC#3 也要求同机。保留为不设门禁的观察（[quickstart AC#3](quickstart.md#ac3) 末尾）。
  - plan 期先试测：plan 期机器负载约 11，数据不可信；上限也应在看到数据之前冻结。
  - +5%：与噪声门同级，分辨不出。
  - +20%：本地每次都多付五分之一，而 D6 第 1 步也许以很小的代价就能省下；上限太松就永远不会去试。
  - 六个项目都量：AC#3 只要求一个 demo；六个项目的开销机制相同。

## D6. 超限阶梯

- **Decision**:
  1. 六个配置一起改成 `trace: { mode: 'retain-on-failure', screenshots: false }`，按 D5 原样重量。off 臂仍然成立（CLI 字符串只替换 `mode`）。
  2. 仍超限：AC#1 与 AC#3 冲突，带数据交用户裁决。不单方面退回旧模式，也不单方面放宽上限。
- **Rationale**: 通过的用例付出的录制开销来自 DOM 快照、screencast 帧与 network / console 事件，其中只有前两项有开关。`snapshots` 是
  AC#1 的验收内容；`sources` / `attachments` 只在保留的 trace 合并时收集，通过的用例不付这份开销，关了也省不下 AC#3 量的时间；
  保留模式也不是调节杆，`--retries=0` 下两种只留失败的模式都录首次尝试，开销相同。剩下的只有 `screenshots`，关掉它丢的是时间轴
  胶片，DOM 快照还在，AC#1 仍然成立。
- **Alternatives considered**:
  - 只改 angular：量的是 angular，但开销机制六个项目相同，只改一个破坏对称。
  - 关 `snapshots`：AC#1 直接不成立。
  - 退回 `on-first-retry`：等于放弃本阶段。

## D7. AC#1 的验证：临时探针，先红后绿

- **Decision**: angular 与扩展 e2e 各加一个临时探针 spec，一条必过，一条必失败（断言一个不存在的 test id，`timeout: 1000`）；探针内容与
  步骤见 [quickstart AC#1](quickstart.md#ac1)。
  - 红：改配置前跑探针，运行本身正常（1 passed / 1 failed，失败原因就是那个 test id），且 `test-output/playwright/output` 下没有任何
    `trace.zip`。
  - 绿：改配置后只有失败用例的目录里有一个 `trace.zip`；脚本确认失败断言那次调用同时有 `before` 与 `after` 两个 DOM 快照；扩展的
    trace 里有 `chrome-extension://` 页面；再用 `show-trace` 人工看一眼。
  - 探针跑完删除，不进交付 PR。
- **Rationale**:
  - 独立探针不碰既有 spec，删掉即干净；断言不存在的 test id 是确定性失败，不靠时序。
  - 失败的调用也有 `after` 快照：调度器在 `finally` 里调 `onAfterCall`（上限 3 s），tracing 在那里抓 `after` 快照，所以「失败断言前后的
    DOM 快照」可以自动核验，不只靠人眼。
  - 红必须按预期原因红：运行正常、用例按预期成败，只是没有 trace。这就排除了 webServer 没起来之类的假红。
  - 扩展只能在持久化上下文里加载，trace 里出现 `chrome-extension://` 页面，就证明它来自 fixture 自建的持久化上下文。
  - AC#1 要求 angular / react / vue「任一」加扩展 e2e；三个 web demo 的上下文都由内置 `context` fixture 经 `browser.newContext()`
    建，走同一条路径，跑 angular 一个即可。
- **Alternatives considered**:
  - 在既有 spec 里临时加失败断言：改动散在既有文件里，回滚容易漏。
  - 只人工看 trace viewer：不可复验。
  - react / vue 也各跑一遍：同一机制的重复，AC#1 不要求。

## D8. AC#2 的验证：临时分支 + draft PR

- **Decision**: 交付改动提交后，从 `rrweb` 切临时分支 `us909-ac2-probe`，加一个 angular 探针 spec（`testInfo.retry === 0` 时断言失败，
  之后通过），推送并开 draft PR 触发 CI；核对 job 状态与 artifact 后关 PR、删分支。推送与开 PR 都要用户放行。步骤见
  [quickstart AC#2](quickstart.md#ac2)。
- **Rationale**: AC#2 需要 CI 的 `retries: 2` 与真实的 artifact 通道。`ci-template.yml` 没有 `workflow_dispatch`，只能经 PR 触发，
  `pr.yml` 也不过滤 draft。配置改动让六个 e2e 项目都进 affected，同一次 run 顺带证明另外五个仍然绿。并发组按 `workflow + ref` 划分，
  临时分支的 run 与交付 PR 的 run 互不取消。
- **Alternatives considered**:
  - 在交付 PR 里加探针再 revert：交付 PR 的历史里留下探针，去掉探针后还得再跑一次 CI。
  - `workflow_dispatch`：不存在；为一次验证加入口是扩大改动面。
  - 本地 `CI=1` 模拟：没有 artifact 通道，证明不了「在 artifact 里」。

## D9. supabase 的 `e2e-remote`

- **Decision**: 不单独处理，不纳入 AC#3 量测。它在 `apps/dev-rxdb-supabase-e2e` 下跑
  `REMOTE_E2E=true NX_DAEMON=false pnpm exec playwright test src/remote-sync.spec.ts`，不带 `-c`，用的就是同一份 config，自动继承新模式。
- **Rationale**: 同一份 config，单独处理只会在 config 里多一个条件分支；它依赖远端 Supabase，墙钟噪声大，不适合量开销。
- **Alternatives considered**: 给它单独一种模式：没有对应的症状，还要在 config 里按 `REMOTE_E2E` 分叉。

## D10. artifact 体积：接受增长

- **Decision**: 不改 reporter、上传路径与保留期。
- **Rationale**:
  - 通过的尝试不留 trace，增长只来自失败：本地一次失败一份；CI 上硬失败三份、flaky 一份（首次失败那次）、失败两次后通过两份
    （计数见 [data-model §3](data-model.md#3-trace-份数)）。
  - 一份 trace 在 artifact 里约出现三次：原件、html 报告 `data/` 下的拷贝、blob 报告内嵌的 `resources/`；react 覆写了 reporter，没有
    blob，约两次（布局见 [data-model §4](data-model.md#4-artifact-布局)）。保留 7 天；本地 outputDir 每次运行开始时清空，不累积。
- **Alternatives considered**: 改 reporter 或上传路径去重：不在本阶段范围；angular / vue / supabase / http 的 config 都写明沿用 preset 的
  reporter（CI 的分片合并报告靠 blob）。

## D11. 不加常驻守卫测试

- **Decision**: 不加断言 trace 配置的常驻测试或审计脚本。
- **Rationale**: 这不是产品缺陷修复，宪法 II 的「缺陷修复须带回归测试」不适用。行为只在失败时可见，常驻测试要么复述配置（静态断言
  `trace === 'retain-on-failure'`），要么套一层 Playwright 跑 Playwright。有人改回去，下一次需要 trace 时立即可见，修复是一行。按宪法 II
  的「最简结构」不加。
- **Alternatives considered**:
  - 审计脚本 grep 六个配置：复述配置，还要维护项目清单。
  - 嵌套 Playwright 的元测试：慢、脆，为一行配置建一套设施。
