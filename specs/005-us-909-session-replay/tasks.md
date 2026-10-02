---
description: 'Task list: US-909 阶段 C — 应用内会话录制回放与 commit 关联'
---

# Tasks: US-909 阶段 C — 应用内会话录制回放与 commit 关联

**Input**: Design documents from `/specs/005-us-909-session-replay/`

**Prerequisites**: plan.md, spec.md（US1–US6、FR-001～024、SC-001～008）, research.md（D1–D13）, data-model.md, contracts/, quickstart.md

**Tests**: 包含——宪法 II 要求 TDD：每个实现任务前有对应的红测试任务。

**Organization**: 按 spec 用户故事分组（US1 录制落库 → US2 回放 → US3 commit 关联 → US4 上限 → US5 脱敏 → US6 demo）。
故事 AC 对照：AC#10/11 → US1，AC#12 → US1 + US6，AC#13 → US2，AC#14 → US3，AC#15 → US4，AC#16 → US5，AC#17 → US2 + US6。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- 提交、推送、开 PR 已由用户授权（「继续完成所有任务」）；合并由用户做；不执行可选的 `/speckit-git-commit` 钩子

## Path Conventions

- core：`packages/rxdb-plugin-replay/src/`；封装：`packages/rxdb-plugin-replay-{angular,react,vue}/src/`
- working-tree：`packages/rxdb-plugin-working-tree/src/`
- dev 应用：`apps/dev-rxdb-angular/src/app/`；e2e：`apps/dev-rxdb-angular-e2e/src/`
- 命令约定：每条 shell 命令前带 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"; unset CI`；nx 命令加 `NX_DAEMON=false`；
  e2e 之后 `git restore benchmarks/reports/`

## Phase 1: Setup

- [x] T001 故事登记（`requirements/stories/future/US-909-session-replay-debugging.md`）：技术笔记里阶段 C 的「plan 冻结」三条换成
      owner 2026-10-02 决策（独立录制库 + 工厂；16 MiB / 128 MiB 与截断 / 拒绝语义；门面 `commits$`）；依赖写法改为
      `rrweb@2.1.6` + `@rrweb/types@2.1.6`（plan 偏离 4）；交付阶段表 C 行 `⬜` → `⚠️`；`pnpm run audit:requirements` 通过；
      status-overview / roadmap 的 US-909 进度描述同步
- [x] T002 前提：`git status --short` 只有本特性改动；`lsof -i :8200` 无输出
- [x] T003 建包 `packages/rxdb-plugin-replay/`（照 `packages/rxdb-plugin-search/` 的 `package.json` / `project.json` / `tsconfig*.json` /
      `vite.config.ts` / `eslint.config.mjs` / `README.md`）：`dependencies` 精确写 `"rrweb": "2.1.6"`、`"@rrweb/types": "2.1.6"`；
      peer `@aiao/rxdb`、`rxjs ^7.8.2`、可选 peer `@aiao/rxdb-plugin-working-tree`（`peerDependenciesMeta.optional`）；
      `exports` 含 `.` 与 `./testing`；vitest 分 node 与 chromium browser 两个 project（照仓库已有 `*.browser.spec.ts` 的包）；
      `pnpm install` 后 `pnpm-lock.yaml` 里 `rrweb` 解析到 2.1.6
- [x] T004 [P] 建包 `packages/rxdb-plugin-replay-angular/`（照 `rxdb-plugin-search-angular`：`ng-package.json`、`tsconfig.lib.prod.json`、
      `test-setup.ts`、`release-config.spec.ts`）
- [x] T005 [P] 建包 `packages/rxdb-plugin-replay-react/`（照 `rxdb-plugin-search-react`，含 `readme-consumer.spec.tsx`）
- [x] T006 [P] 建包 `packages/rxdb-plugin-replay-vue/`（照 `rxdb-plugin-search-vue`，含 `package-exports.spec.ts`）
- [x] T007 注册点（research D13）：先 `grep -rln "rxdb-plugin-search-vue" --exclude-dir=node_modules --exclude-dir=dist .` 列全，
      四个新包逐处补齐（tsconfig.base.json paths、tsconfig.json references、codecov、coverage-baseline、plan-test-lanes、commitizen、
      website typedoc / sidebars / flatten、README 包树、compatibility）；`pnpm nx show projects | grep replay` 出四个

## Phase 2: Foundational（阻塞所有故事）

### 门面 `commits$`（[contracts/working-tree-commits.md](contracts/working-tree-commits.md)）

- [x] T008 先写 `packages/rxdb-plugin-working-tree/src/__tests__/working-tree/facade-commits.spec.ts`（红），覆盖契约 §1 全表、§2 时序
      （`await commit()` 之后已收到；回调里 `listCommits()` 读得到）、§3 订阅者抛错不影响结果与其他订阅者；照同目录既有门面测试的夹具起库
- [x] T009 `working-tree/commit-command.ts` 拆出内部 `runCommitWorkingTree()` 返回 `{ result, written: { commitId, branchId } | null }`
      （只有非 `reused` 的成功分支给 `written`），`commitWorkingTree()` 签名与行为不变；新文件 `working-tree/working-tree-commit-event.ts`
      定义 `WorkingTreeCommitEvent`（TSDoc）
- [x] T010 `working-tree/working-tree-facade.ts`：实例字段 `readonly commits$`（私有 Subject 的 `asObservable()`），`commit()` 在
      `runEnabled()` 返回后按 `written` 发出，订阅者异常隔离（research D7）；包入口导出类型；`testing/use-working-tree-fixtures.ts`
      的 stub 补 `commits$`（`NEVER`）；T008 转绿，`facade-capability-gate` 仍绿
- [x] T011 `pnpm audit:api-surface:update` 更新基线；`pnpm nx run-many -t lint test build --projects=rxdb-plugin-working-tree` 通过

### core 骨架

- [x] T012 [P] 先写 `src/__tests__/options.spec.ts`（红）：默认值；`createRecordingDb` 非函数 → `TypeError`；`sessionBytes` /
      `storeBytes` / `intervalMs` / `maxEvents` 非正安全整数 → `RangeError`；`sessionBytes > storeBytes` → `RangeError`
- [x] T013 [P] 实现 `src/options.ts`（`RxDBReplayOptions`、`resolveReplayOptions()`）与 `src/errors.ts`（`RxDBReplayError`、
      `RxDBReplayErrorCode` 九个值，见 contracts/replay-plugin.md §4），T012 转绿
- [x] T014 实现 `src/entities.ts`：`ReplaySessionRecord`、`ReplayEventRecord`、`REPLAY_ENTITIES`，字段与约束逐字照 data-model §1
      （「`id` 主键 `${sessionId}:${seq}`」「索引 `(sessionId, seq)` 唯一；`(sessionId, timestamp)`」「`status` 枚举
      `recording | stopped | truncated`」「`truncatedCode` 可空」）
- [x] T015 [P] 先写 `src/__tests__/markers.spec.ts`（红）后实现 `src/markers.ts`：`REPLAY_MARKER_TAGS`、`parseReplayMarker()`
      （非标记 → `null`；tag 对 payload 错 → `invalid_marker`）、`eventBytes(event)`
- [x] T016 实现 `src/plugin.ts` 骨架：`RxDBPluginReplay`（`name='replay'`、`lifecycle='scoped'`、`inject=['adapter:local']`，构造时
      `resolveReplayOptions` 抛错）、`rxDBPluginReplay` 工厂、`declare module '@aiao/rxdb'` 增强；`src/index.ts` 导出；先写
      `plugin.spec.ts`（红）：未安装调用抛 `not_installed`，`getPlugins('replay')` 长度 1

**Checkpoint**: 门面通知可用、core 能装上；之后各故事可按优先级推进。

## Phase 3: US1 录制并落库（P1，AC#10、11、12）🎯 MVP

**Independent Test**: node 测试用假 `record` 驱动，事件落进 PGlite memory 录制库，`seq` 单调、`stop()` 冲刷干净、刷新续录不重不漏。

- [x] T017 [US1] 先写 `src/__tests__/store.spec.ts`（红，PGlite memory 工厂）：建会话；`appendBatch` 写事件行并同事务推进会话行
      `bytes` / `eventCount` / `nextSeq` / `lastEventAt`；`readEvents` 按 `seq`；区间读；`listSessions` 倒序；`deleteSession` 删两表；
      重复 `seq` 被主键拒
- [x] T018 [US1] 实现 `src/store.ts`（`ReplayStore`，录制库懒建、`init` / `connect`、`recording_db_unavailable`），T017 转绿
- [x] T019 [US1] 先写 `src/__tests__/recorder.spec.ts`（红，注入假 `record` 与假时钟）：`emit` 分配 `seq`；`maxEvents` / `intervalMs`
      触发冲刷；同时至多一笔在途；`stop()` 冲刷剩余并置 `stopped`；冲刷失败 → `state$` `error` 且 `stop()` 抛原错误
- [x] T020 [US1] 实现 `src/recorder.ts`（rrweb 经注入的 loader 动态加载，默认 `() => import('rrweb')`），T019 转绿
- [x] T021 [US1] 先写 `src/__tests__/resume.spec.ts`（红）：`pagehide` 写暂存（data-model §4 形状）；安装时认领并删键、过滤
      `seq < nextSeq`、计数器续；最小暂存 → `gap` 标记；暂存损坏 → 删键 + `state$` `error`；会话已非 `recording` → 不续；
      `pageshow(persisted)` 删键
- [x] T022 [US1] 在 `src/recorder.ts` / `src/resume.ts` 实现续录，T021 转绿
- [x] T023 [US1] 实现 `src/manager.ts`（`ReplayManager`：`state$`、`start` / `stop` / `listSessions` / `readEvents` / `exportSession` /
      `deleteSession` / `usage`；`no_dom`、`already_recording`、`session_not_found`、`session_recording`），先写 `manager.spec.ts`（红）；
      作用域释放时停录制 → 冲刷 → 销毁录制库
- [x] T024 [US1] 双写入者用例（`store.spec.ts`）：两个 `ReplayStore` 指向同一录制库各开一个会话交替写，`usage().bytes` 等于两会话之和

## Phase 4: US2 回放与跳转（P1，AC#13、17）

**Independent Test**: chromium 里真 rrweb 录一段 DOM 变化，`mountReplayer` seek 到中途时回放 iframe 的 DOM 正确；三端 parity 契约全绿。

- [x] T025 [US2] 先写 `src/__tests__/replayer.browser.spec.ts`（红）：四态与 DOM 契约（contracts/replayer-component.md §2）、seek
      到 T 时 iframe 内容、`update` 换会话、`destroy` 幂等、按钮与滑块键盘可达
- [x] T026 [US2] 实现 `src/replayer/mount-replayer.ts`（含内联样式与 `onTimeChange`），T025 转绿
- [x] T027 [US2] 实现 `src/testing/replayer-parity.ts`：`replayerParityCases`（契约 §4 七条）与 `./testing` 入口
- [x] T028 [P] [US2] Angular：先写 `replayer.component.spec.ts`（跑 parity 用例，红）后实现 `src/replayer.component.ts`（`ao-replayer`、
      signals 输入、`output`、OnPush、`DestroyRef`）
- [x] T029 [P] [US2] React：先写 `replayer.spec.tsx`（红）后实现 `src/replayer.tsx`（`forwardRef` + `useImperativeHandle`、`ReplayerRef`）
- [x] T030 [P] [US2] Vue：先写 `replayer.spec.ts`（红）后实现 `src/replayer.ts`（`defineComponent` + `defineExpose`、`emits`）
- [x] T031 [US2] 三个封装包入口导出组件、`ReplayerCommitRestoreEvent`、`replayRestoreHint`；`pnpm audit:api-surface:update`

## Phase 5: US3 commit 标记与恢复（P2，AC#14）

**Independent Test**: node 测试里装 working-tree 插件，录制中两次 `commit()` → 两个标记、`commitId` 与 `listCommits()` 顺序一致；
`restoreToCommit` 成功与四种拒绝的提示。

- [x] T032 [US3] 先写 `src/__tests__/commit-markers.spec.ts`（红）：录制中 `commits$` → `addCustomEvent('rxdb-replay:commit', …)`；
      未录制时不写；没装工作树插件时录制照常；`listCommitMarkers` 顺序
- [x] T033 [US3] 在 `src/recorder.ts` / `src/manager.ts` 实现订阅与 `listCommitMarkers`，T032 转绿
- [x] T034 [US3] 先写 `src/__tests__/restore.spec.ts`（红）：取新鲜凭据调 `restore`；`ok: true` 透传；四种 `reason` → 提示（research D8
      表逐字）；无工作树 → `working_tree_unavailable`；未启用 → 透传 `WorkingTreeCapabilityDisabledError`
- [x] T035 [US3] 实现 `src/restore.ts`（`restoreToCommit`、`replayRestoreHint`），T034 转绿；`mountReplayer` 的标记按钮接上
      （T025 补「点标记 → seek + 状态区」用例）

## Phase 6: US4 体积上限（P2，AC#15）

- [x] T036 [US4] 先写 `src/__tests__/limits.spec.ts`（红，小上限）：未超；单会话超 → 整批不写、首个 `seq` 写 `truncated` 标记
      （`{ code: 'session_limit', limitBytes }`）、会话 `truncated`、录制停、暂存清；总量超 → `store_limit`；合计 `≥ storeBytes` 时
      `start()` 抛 `store_limit` 且不建会话；`deleteSession` 后可再开；从不自动删
- [x] T037 [US4] 在 `src/store.ts` 的 `appendBatch` / `createSession` 事务里实现判定（research D4），T036 转绿
- [x] T038 [US4] 基准 `src/__tests__/store.bench.spec.ts`（`REPLAY_BENCH=1` 才跑，research D12）；实测中位数写进本任务备注
      — 实测（2026-10-02，本机 PGlite memory）：254 B（rrweb 属性变更事件）× 200 条/批，30 批中位数 **13.4 ms**（min 12.0 / max 15.0），SC-007 < 100 ms ✅

## Phase 7: US5 脱敏（P2，AC#16）

- [x] T039 [US5] 先写 `src/__tests__/masking.browser.spec.ts`（红）：默认 `maskAllInputs` 下输入值在事件里是遮蔽字符；
      `[data-rxdb-replay-block]` 与 `record.blockSelector` 合并生效；`maskTextSelector` 透传
- [x] T040 [US5] 在 `src/recorder.ts` 实现选项映射（research D6），T039 转绿
      — ⚠️ 顺序偏差：映射已随 T012 落在 `src/options.ts` 的 `resolveRecordOptions`（录制器只展开 `recordOptions`），T039 写完即绿；
      以变异验证代替先红：`maskAllInputs` 默认改 `false` + `blockSelector` 不合并 → 前两条转红；从 `RECORD_KEYS` 删
      `maskTextSelector` → 透传用例转红；还原后 4/4 绿

## Phase 8: US6 demo（P3，AC#10～14、16、17 闭环）

- [x] T041 [US6] 先写 `apps/dev-rxdb-angular/src/app/rxdb/replay-recording.spec.ts`（红）：开关键读写；关时不 `import()`
      — 9 例；偏差：开关键与读写放独立的 `rxdb/replay-toggle.ts`（setup 静态引用它，录制模块与 rrweb 才不进初始包，FR-022）
- [x] T042 [US6] 实现 `rxdb/replay-recording.ts`（`REPLAY_ENABLED_KEY = 'rxdb-demo-replay-enabled'`、`createReplayRecordingDb`
      （主线程 IDB、`multiInstance: false`、无插件）、`installReplay(db, dbName)`、`window.__rxdbReplay`）；
      `setup_rxdb_sqlite-wasm.ts` 在开关打开时 `await import('./replay-recording')`
      — 偏差：签名 `installReplay(db, { dbName, baseHref })`（`db.config.dbName` 带版本后缀，原始库名须显式传入；录制库同样要
      `APP_BASE_HREF`）；页内 API 多一个 `recordingDbName`；加 `replayDemoReady`（首次安装后兑现，`/replay` 页靠它拿门面）；
      setup 用 `void whenReplayEnabled(…)?.then(installReplay)` 而非 `await`，和工作树自动启用一样不阻塞启动
- [x] T043 [US6] `/replay` 页：`pages/replay/replay.page.ts` + `.html`（开关、会话列表含状态 / 体积、删除、`<ao-replayer>`、四态）、
      路由与 `components/app-menu.ts` 菜单项；`apps/dev-rxdb-angular` tsconfig references 补新包
      — 页面四态 `data-phase`：`disabled` / `loading` / `ready` / `error`；开始录制不自动选中（边录边回放会把回放视图录进去），
      录制中的会话不能回放 / 删除；加「脱敏演示」区（遮蔽输入框 + `data-rxdb-replay-block` 区块），供 AC#16 e2e 使用；
      路由挂 `connectLocalAdapter`（点标记要调 `workingTree.restore()`，深链进来先把连接带起来）
- [x] T044 [US6] e2e `apps/dev-rxdb-angular-e2e/src/replay.spec.ts`（research D11 四组场景）；先跑红再补实现缺口；
      `pnpm nx e2e dev-rxdb-angular-e2e -- --grep replay --retries=0` 连跑 3 次全绿
      — 红跑暴露两处缺口：① demo 在插件异步装进连接纪元前就挂出门面，AC#10/11 拿到 `not_installed`
      → `installReplay` 改为 `await db.connect()` 后再交出门面（连接去重，重复 `connect()` 等安装完成）；
      ② `RxDBReplayError` 构造器已加前缀，7 处调用点又写了一遍 → 去重，并在 spec 里断言前缀只出现一次。
      AC#11 的 `seq` 连续改为断言事件数 = `eventCount` + 时间戳不倒退（`readEvents()` 不暴露 `seq`，库层由 `resume.spec.ts` 覆盖）。
      连跑 3 次 `--skip-nx-cache`（第三次起加，避免 nx 回放缓存）：4 passed × 3（15.7s / 14.9s / 15.3s）
- [x] T045 [US6] FR-022 验证：开关关闭时 `nx build dev-rxdb-angular` 的初始 chunk 不含 `rrweb`（`grep -l "rrweb" dist/.../main*.js` 无输出）
      — `index.html` 的初始脚本（`main` + 10 个 modulepreload chunk）对 `rrweb|rr-block|rxdb-replay:|rxdb-plugin-replay`
      均无命中，只有开关键 `rxdb-demo-replay-enabled` 在 `main`；录制核心（8.1 KB gz）与 rrweb（81.3 KB gz）各在懒加载 chunk

## Phase 9: Polish

- [x] T046 [P] TSDoc 全量过一遍（新导出与门面新成员）；四个包 README（安装、工厂示例、上限、脱敏、恢复、三框架用法对照）
      — `scripts/audit/package-api-docs.mjs` 对四个 replay 包与 `rxdb-plugin-working-tree` 均 passed
- [x] T047 [P] website 插件指南 `rxdb-plugin-replay`（照 search 指南结构）与 `compatibility.md`
      — `website/docs/plugins/rxdb-plugin-replay/README.md` + `sidebars.ts`；`audit:docs-plugins` passed
- [x] T048 覆盖率：四个新包 ≥ 80%，`coverage-baseline.json` 记实测；`pnpm nx run-many -t lint test build --projects=tag:js-lib` 通过
  - 2026-10-02 实测（stmt / branch / func / line，node + browser 合并）：replay 96 / 89 / 96 / 98，angular 97 / 93 / 100 / 100，react 96 / 87 / 100 / 100，vue 95 / 87 / 100 / 100，已进 `scripts/audit/coverage-baseline.json`。replay 的 node 趟切掉 `src/replayer/**`（只有浏览器趟测得到，同 rxdb-plugin-tree），合并后的总数由 `pnpm audit:coverage` 把关
  - run-many 满载跑出 3 个超时：`rxdb-adapter-sqlite-wasm`（SWM-006，5 s）、`rxdb-plugin-replay`（plugin.spec 断连重连，单跑 3.9 s、满载 11.5 s，本地上限 10 s / CI 30 s）、`rxdb-adapter-electron`（pglite-encrypted 两个 hook 10 s + restore 两条 60 s）；三包单跑全绿（829 / 128 / 1258 passed），electron 与 rxdb-test 本分支零改动，按负载超时记
- [x] T049 包体积量测（quickstart §3），< 50 KB gz，数值记进本任务与故事实现记录
      — `dist/index.js`（29.26 kB，vite 报 gzip 9.08 kB）经 esbuild `--bundle --minify`、外置 `rrweb` / `@rrweb/*` / `@aiao/*` / `rxjs`
      后 gzip **8,151 B**，远低于 50 KB；故事技术笔记「阶段 C 的体积与开销实测」同记
- [x] T050 全量：`pnpm test-all`；dev-rxdb-angular-e2e 全量（AC#1～3 不回退）；失败先单独复跑（AGENTS.md「全量测试坑」）
  - 2026-10-02 第四轮 `pnpm test-all` 全绿（76 项目，11 m 21 s）；dev-rxdb-angular-e2e 实跑 143 passed（含 `replay.spec.ts`），react 136 / vue 等 e2e 同轮通过
  - 前三轮的失败与处理：① replay 各文件首条用例 10 s 超时（每条新起 PGlite + WASM 冷启动，四路并发下稳定越线）→ 超时提到本地 30 s / CI 120 s，与 rxdb-adapter-pglite 同档；② `website:test` 拦下 api-docs 复合产物预构建漏了 `rxdb-plugin-replay-angular` → `website/project.json` 补上（净树上 typedoc 会报 TS6305）；③ `rxdb-adapter-electron:test` 在整机 15 分钟负载 43（10 核）时全面超时，单跑两次均 1258 passed，本分支零改动，按负载超时记（nx 亦标为 flaky）
- [x] T051 故事收尾：AC#10～17 逐条 ✅ / ⚠️ 与证据；交付阶段 C 行；实现文件表；`audit:requirements`；派生视图同步
      — AC#10～17 全 ✅ 并附证据；AC#11 的「索引命中」补了 `store.spec` 的 EXPLAIN 用例（20 会话 × 250 条、`ANALYZE` 后区间谓词走
      `(sessionId, timestamp)` 的 Bitmap Index Scan）；阶段 B / C 行改 ✅（B 行 AC#4～9 早已全 ✅，属漏回写）；实现文件表补 working-tree /
      demo / e2e / website 四行；`capability-matrix.md` 与 `versioning-policy.md` 的包数 46 / 45 → 50 / 49；`audit:requirements` 通过
- [ ] T052 提交、推送 `us909-stage-c`，开 PR（标题过 `node scripts/commit-lint.mjs`）；CI 全绿后在本任务记 run 号。2026-10-02 owner 要求三个堆叠 PR 合成一个：#85 改 base `main`、标题改为 `feat(rxdb-plugin-replay): US-909 会话录制回放调试（阶段 A～C）`，#81 / #82 关闭并指向 #85（分支保留）

## Dependencies & Execution Order

- Phase 1 → Phase 2 → 故事阶段。T008–T011（门面）与 T012–T016（core 骨架）互不依赖，可并行。
- US1（T017–T024）是 US2–US5 的前提（它们都要存储与录制器）。US2 与 US3 可并行；US3 的 T035 要 US2 的 T026。
- US4 只改 `store.ts`，可在 US1 之后任意时刻做；US5 只改 `recorder.ts` 的选项映射。
- US6 依赖 US1–US5 全部完成。
- Polish 最后。

## Parallel Example

```text
Phase 1：T004、T005、T006 同时建三个封装包
Phase 2：T008–T011（working-tree）与 T012/T013/T015（core 纯函数）同时
US2：T028、T029、T030 三个框架组件同时
```

## Implementation Strategy

1. MVP = Phase 1–3（能录、能落库、能续录），对应 AC#10/11/12 的库层部分。
2. 再加 US2（回放 + 三框架），可以对外演示；然后 US3 / US4 / US5。
3. 最后 US6 把全部 AC 在 demo 里闭环，全量验证后开 PR。
