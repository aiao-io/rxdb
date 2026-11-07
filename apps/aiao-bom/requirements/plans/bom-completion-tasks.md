# BOM 收尾与演示交付任务

更新：2026-11-07。对应 PR：#129。当前收尾 4/8。已提交源码 03d86194 的完整 BOM 回归因两条 PGlite 迁移测试超时及浏览器断连失败，原超时与断言下的两文件定向复跑 32/32 通过，完整回归与覆盖率正在重新执行。89d59a0d 的 1561 项通过仅作历史记录；共享读取诊断活视图 p95 为 11.759724ms，普通反查仍超出 16ms。最终源码完整 affected、正式性能门禁、全部远端 CI、部署升级与真实试用尚未闭环。当前范围以根 US-518 与应用故事为准，旧 spec011～024 的 256 项完成记录作为历史基线保留。

- [x] C001 按红绿顺序补齐 US-518 AC#12：SQLite/PGlite 的插件 API、直连 SQL、批量回滚和旧空集合升级兼容；新增 8 条先红，连同既有有效性用例 29/29 通过。
- [x] C002 首页串联首次案例准备与进入核对；连接未完成时禁止清空未知数据，取消或失败保留条件，重复点击只执行一次；首页 19 条单测通过。
- [x] C003 窄屏选择变化后定位用量依据，返回恢复原行焦点；桌面与窄屏 16 条单测通过，首次准备至摘要下载的生产浏览器验收 40/40 通过，单 worker、零重试。
- [x] C004 同步根故事、应用故事、派生视图与验收记录，标明旧“19 条全部 Done”结论的历史基线；19 条平台故事及 US-030 保持 In Review，根需求和应用需求一致性门禁通过。
- [ ] C005 历史完整 affected 已通过，但最终源码仍需重新验收。03d86194 完整 BOM 回归在 368 项通过后，发生两条 PGlite 持久迁移测试超时与浏览器断连，退出 1；失败相关的两文件按原条件复跑 32/32 通过，全量与覆盖率正在重跑。当前 lint/typecheck/build、包组合知识及五入口体积门禁通过；活视图独占诊断 p95 为 11.759724ms、6 条 SQL，普通反查 p95 21.794239ms，仍未达 16ms。须取得完整回归结果、在最终提交上完成八类 affected，再独占执行四项正式门禁并核对 Reach 成功标准。
- [ ] C006 PR #129 仍为 Open / Draft，当前远端 03d86194 与 main 存在合并冲突，没有正式 APPROVED；该头只有页面规则等检查，缺少完整 CI 通过证据。历史 c6f51030 的 ci / setup 因三份包组合知识生成物漂移失败；macOS Tauri 打包 19 通过 / 2 条条件跳过、真实 DevTools 双 WebView 43/43 保留为历史证据。main 依赖升级的 10 个冲突已在隔离工作树解决，重新生成三份产物并通过包组合知识与 frozen lock 校验，尚未应用回原分支。原工作区 SDK 修改保持原哈希；最终集成、三份生成物及全部远端检查仍须统一闭环。
- [ ] C007 取得获准真实样本、人工期望与目标工程师记录后完成 BOM-US-202；当前缺少这些输入，不能以自动化或合成案例替代。
- [ ] C008 已发布版本 `4baf9e83-d6a7-4667-90dc-9cff57827cb5` 对应 322bb6f0，9a5d448b 的产物曾逐项一致。本轮按需读取会影响分块，须重建当前应用并核对产物，必要时重新部署和执行本地/公网验收；旧资产与浏览器结果保留为历史证据。

## 已发现的远端失败

已核实提交 8be72b3f 的 `ci / benchmarks` 失败：工作树 benchmark 在 AMD EPYC 9V45 / Node 26 画像上，restore 比值 15.110 超过 14.447，commit 比值 17.100 超过 16.726；status、diff 通过。此前 ac7a9172 的 diff、restore 也曾超预算。保留这些失败记录，优化后须核对最终提交的 CI，不能用旧头的成功检查替代。

## 验收入口

- `pnpm nx run rxdb-plugin-bom:test`
- `pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e,rxdb-plugin-bom-angular,rxdb-plugin-bom-react,rxdb-plugin-bom-vue --targets=lint,typecheck,spec-typecheck,test --parallel=1 --skipRemoteCache --output-style=static`
- `pnpm nx run aiao-bom-e2e:e2e`
- `pnpm nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e --parallel=1 --skipRemoteCache --output-style=static --nxBail`

核心插件完整测试在独立进程执行，未完成前不记为通过。应用与平台的 Done 均以各自需求约定和实际合并状态为准。

## 2026-11-06 本轮验证

- 应用及三端静态/单元门禁共 51 任务通过；应用 229/229、Angular 33/33、React 32/32、Vue 42/42。
- 应用生产构建及浏览器 40/40 通过，新增首次空库准备、375px 依据聚焦/返回、人工确认与下载闭环。
- 19 条平台故事及公共前置 US-030 统一保持 In Review；合并前不计为 Done。
- 真实样本试用已备好登记模板，样本、授权、人工基线与工程师操作仍待提供。

- 核心插件完整浏览器测试：89 文件、1546 通过、1 条条件跳过，无未处理异常；语句/分支/函数/行覆盖率分别为 96.28% / 89.66% / 97.29% / 97.75%，四项均超过 80%。
- 三端覆盖率四项均达标：Angular 均 100%；React 为 95.78% / 98.09% / 94.44% / 95.12%；Vue 为 98.26% / 95.28% / 100% / 98%。公开类型与运行时入口一致。
- 全部 102 个受影响项目的串行完整门禁已启动，未结束前 C005 保持未完成。
- 本机 working-tree benchmark 完整执行，但 Intel i9 / Darwin x64 画像没有冻结 reference，按原规则报告 `benchmark_environment_mismatch`；诊断采样不能作为性能通过证据，不补冻基线掩盖失败。
- 远端提交 1f0b46ec 的 setup 失败原因是 PR 标题使用了不允许的 `bom` scope；已用相同校验器确认 `feat(aiao): BOM 领域模型、三框架绑定与生产核对工作台` 合规，后续以新事件中的标题与最终提交 CI 为准。

## 2026-11-07 全量门禁追踪

- 首次完整 affected 执行 12m13s，在 `rxdb-plugin-board:coverage` 停止：双库种子一致性用例超过默认 5 秒。单独重跑同一完整目标后，该文件两条用例均超时；不是一次观察超时，也没有算成通过。
- 单独关闭覆盖率采样的两条诊断用例断言通过，耗时分别为 4.49s 与 3.45s，说明冷启动与真实库迁移已接近默认超时。仅为这两个双库集成用例声明 15 秒执行超时，保留所有数据一致性、固定 ID、审计时间与拒绝已有库写入的断言；完整覆盖率复验 22 文件、167/167 通过，四项覆盖率为 96.34% / 90.68% / 99.29% / 97.91%；lint 与类型检查共 38 任务通过。
- 最新提交 8be72b3f 的 CI setup 全部通过，PR 标题修复已被真实远端验证；后续测试与 benchmark 结果仍待核对。

- 8be72b3f 的远端 benchmark 再次失败，原始日志已获取，继续定位；C006 保持未完成。

- 第二轮完整 affected 执行在共享核心性能修改前主动停止（退出 130），已完成目标的本地缓存保留；这轮不记为全量通过，待代码稳定后重新执行。
- 关系回填优化按红绿顺序新增 4 条用例：其中空缓存与仅集合关系两条先失败，修复后关系缓存 11/11 通过。单值关系保留 Observable 身份，覆盖当前外键变化、零值、NULL、缺失值和清理后的行为；公开 API 与提交图完整性校验均未改变。
- 优化前独立本机 benchmark 已完成：restore P95 617.35ms、比值 13.293；commit P95 751.18ms、比值 13.899。夹具仍为 10,000 实体、100 次提交、每次 100 单元、50 次采样。本机没有匹配冻结画像，仍按规则失败；该数据仅供优化前后比较，不作为 CI 性能通过证据。
- 根状态总览已对齐 US-518 AC#12 的实际实现与回归状态；应用需求一致性及其覆盖率回归 16/16 通过。
- 优化后的核心完整复验：158 文件、2831 通过、1 条条件跳过，语句/分支/函数/行覆盖率为 95.59% / 92.31% / 96.00% / 96.32%，四项均超过核心 90% 门槛；lint 零警告、类型检查与构建通过。初次类型检查暴露的测试枚举扩大已用常量元组修正，没有放宽类型。

- 优化后独立本机计时：restore P95 543.49ms、比值 11.981，commit P95 675.35ms、比值 15.647。与优化前相比，两项 P95 分别减少 12.0% / 10.1%，但 commit 相对 control 比值上升；本机缺少冻结画像，不能从裸耗时下降推导相对门禁通过。
- 提交 cd12d084 的远端性能门禁通过（run 42253495383，job 128016331457）：实际为 Linux x64 / AMD EPYC 7763 / Node 26 画像，status 1.662 ≤ 2.851、diff 2.411 ≤ 3.250、restore 11.761 ≤ 12.877、commit 14.708 ≤ 15.279，均按该画像既有 reference 判定。不是旧 EPYC 9V45 画像的复测；预算、冻结 reference 与夹具未改。最终提交的全部 CI 仍待核对。
- 对 cd12d084 启动完整 102 项目串行 affected 门禁，完整日志为 `/tmp/bom-final-affected-full.log`；执行结束前 C005 保持未完成。
- 公网演示原先仍服务旧构建，首次主入口禁用；新增部署用例先在旧线上版本失败，新生产产物的预检、本地与公网 5/5 验收均通过。Worker 已更新为 c514c0c9-3b51-43ff-801e-0f3fd180f783，64 个发布资产与本地产物逐字节一致，详见 [Cloudflare 部署验收](cloudflare-deployment-verification.md)。

- 上述 102 项目完整门禁已执行结束（21m15s，201 个目标，33 个命中本地缓存），在 `rxdb-adapter-electron:test` 失败：40 文件中 37 通过、3 失败，1392 项通过、3 项超时、8 项条件跳过，并有 1 条 PGlite `ErrnoError` 未处理异常。失败覆盖不同数据目录初始化、首次连接保留未知业务表及恢复中断状态；不能记为 C005 通过。保持原断言与超时，已启动同一完整测试包的文件串行诊断，结果仍待核实。
- Electron 文件串行诊断完整通过（740.35s）：40 文件、1395 项通过、8 项条件跳过，无未处理异常。普通测试子项目设置 `maxWorkers: 2`，未改业务、断言或超时；随后实际默认 `test` 联同 lint/typecheck 共 29 个目标通过（6m36s，23/29 本地缓存命中），同样 40 文件、1395 项通过、8 项条件跳过，无未处理异常。语句/分支/函数/行覆盖率为 94.92% / 87.87% / 94.38% / 96.55%，四项均超过 80%。完整 affected 任务图已核对为 102 项目、414 个目标，包含所有八类门禁及其依赖，继续按原范围串行执行。

## 2026-11-07 导航同步修复与复验

- 上述 102 项目、414 个目标的完整 affected 已执行结束：57m44s，执行到 394 个目标，145 个命中本地缓存；唯一失败为 `dev-rxdb-angular-e2e:e2e`，该套件 245 项通过、1 项失败，其余未执行目标保留未验证。完整日志为 `/tmp/bom-final-affected-resumed-clean.log`，C005 不计通过。
- 失败位置为 `board-restore.spec.ts` 的 US-539 AC#4：确认恢复会触发整页重载，紧接着读取活动数据库的 `page.evaluate` 遇到 `Execution context was destroyed`。Angular、React、Vue 三端同步改为点击前注册 `load` 等待，整页重载结束后再检查活动库；保留原库、新库、内容恢复及重开持久性断言，没有增加重试、sleep 或忽略异常。
- 修复后三端各连续执行 3 次该用例，共 9/9 通过，单 worker、零重试；Angular、React、Vue 分别耗时 31.6s、25.8s、23.6s。三端副本审计 5 组同步；lint/typecheck 联同依赖共 122 个目标通过，112 个本地缓存命中，耗时 26.0s。日志为 `/tmp/bom-board-restore-copy-audit.log`、`/tmp/bom-board-restore-static.log`、`/tmp/bom-board-restore-repeat.log`。这些是修复范围的验证，不能替代完整 affected。
- 提交 d9a6e866 的远端工作树性能门禁通过（run 42269038008，job 128070259237）：Linux x64 / AMD EPYC 9V74 80-Core Processor / Node 26.13.0；status 2.088 ≤ 2.658、diff 2.048 ≤ 2.868、restore 12.586 ≤ 13.230、commit 15.341 ≤ 15.538。该结论使用此画像已有 reference，不是旧 EPYC 9V45 或 EPYC 7763 的复测；预算、冻结 reference 与夹具未改。此次是 PR 相对门禁通过，未评估正式发行的绝对性能门禁。
- 2026-11-07 02:40:09（Asia/Shanghai）的远端快照：PR #129 为 Open / Draft，head 为 d9a6e866；35 项成功、6 项运行中、3 项排队、1 项 neutral、1 项 skipped，尚无失败。新的三端测试修复仍须提交并在最终 head 上核对全部检查，C006 保持未完成。
- 收尾清单仍为 5/8 完成。C005 缺完整受影响门禁最终通过，C006 缺最终提交的 PR/CI 闭环，C007 缺获准脱敏真实样本、独立人工基线及目标工程师操作记录。历史 spec011～024 的 256/256 和本地演示通过均不能替代这三项。

## 2026-11-07 联产成本时点 P1 复核

- 远端 d9a6e866 的检查均已结束：48 项 success、1 项 neutral、1 项 skipped，无失败；GitHub 两条 review thread 均已解决。但 [2026-11-02 整分支评审](../../../../requirements/reviews/pr129-deep-review-2026-11-02.md) 的联产时点 P1 在当前源码中仍存在，不能以 CI 成功或历史任务打勾替代这项问题的修复。
- 对本地 6dd47b01 启动的完整 affected 在 10m16s 时主动停止，退出 130，已完成目标缓存保留。停止原因是需要补上述 P1 的真实双后端红测并修改运行代码；本轮不计完整通过，日志仍为 `/tmp/bom-final-affected-after-navigation.log`。
- 新增 4 条真实 SQLite/PGlite 回归：评估日 2099-01-01 时，不得把 2099-01-02 才生效的输出修订、或逻辑行 ECN 引入的输出列为联产来源；推进至生效日后才可见。两条查询入口与成本结果同时核对，4 条先因业务断言失败，修复后 4/4 通过。日志为 `/tmp/bom-joint-visibility-red.log`、`/tmp/bom-joint-visibility-green.log`；49 项过滤跳过仅是定向运行范围，不记为完整套件通过。
- 联产查询关联输出修订，检查已发布状态、物料对应及评估日前生效；发生项与逻辑行 ECN 复用既有解析侧可见性表达式，不再保留不同的日期口径。没有改变公开入口、函数签名、份额预算或冻结 reference。
- 修复后的插件、三端绑定与应用静态门禁通过：lint/typecheck/spec-typecheck/build 联同依赖共 48 个目标，28 个本地缓存命中，耗时 52.8s；初次测试夹具的 UUID 入参类型已改用有类型的固定 fixture ID，没有放宽类型。日志为 `/tmp/bom-joint-visibility-static.log`。
- 运行代码已变化，完整插件覆盖率、三端与应用验证、受影响门禁及公网产物都须按新代码重新核验。C008 重新打开，当前收尾为 4/8；C005、C006、C007 继续未完成。

## 2026-11-07 当前完成度复核

- 核对源码为 `4b25a948804398ab16ea2a94878aa44c00e3b112`。旧 spec011～024 为 256/256；当前平台 19 条故事的验收表共 296 条 AC 标记通过，故事仍全部 In Review。应用 27 条 AC 标记通过、3 条未验收，后者全部属于 Backlog 的 BOM-US-202；应用 6 条故事保持 In Review。
- 联产时点修复后的 BOM 完整套件为 89 文件、1550 项通过、1 项后端条件跳过；语句/分支/函数/行覆盖率为 96.30% / 89.69% / 97.29% / 97.77%。三端测试分别为 Angular 33、React 32、Vue 42，四项覆盖率均达到 80%；应用单测 229 项及生产浏览器 40 项通过。
- 完整 affected 门禁在 2026-11-07 04:26:39（Asia/Shanghai）结束：102 个受影响项目、414 个目标全部通过，341 个命中本地缓存，耗时 63m31s；lint/typecheck/test/test-memory/test-browser/build/audit-lazy-backend/e2e 均执行到终态。命令保持 `--parallel=1 --skipRemoteCache --nxBail`。证据为 `/tmp/bom-final-affected-after-joint-evidence.json` 与对应完整日志。
- 新版公网 Worker 为 `dc4b9f48-dbf1-4601-8790-88f6092c3ba5`，源码同为 4b25a948。本地部署仿真 5/5、公网 Chromium 5/5，64 个资产哈希一致，首次窄屏入口可用；见 [部署验收记录](cloudflare-deployment-verification.md)。首屏耗时报告仅归档本轮测量，已恢复受跟踪原值，未提交成新基线。
- 4b25a948 的收尾曾为 6/8；来源统计候选合入后 C005 重新打开，当前为 5/8：C005、C006、C007 未完成。PR #129 为 Open / Draft，两个评审讨论已关闭、尚无正式 APPROVED。远端 4b25a948 为 45 项 success、2 项 failure、1 项 neutral、1 项 skipped；失败为 `ci / benchmarks` 及其汇总 `ci / gate`。性能失败为 Linux x64 / INTEL(R) XEON(R) PLATINUM 8573C / Node 26.13.0 的 status 比值 2.666 > 2.585，其他三项通过。
- 来源统计的单次聚合候选已完成隔离工作区的功能验证：插件 1286 项、六个真实后端新增回归及类型检查通过，但完整同机对照未证明性能改善，不能作为 C006 通过证据。首次对照中 status 比值从 2.015 变为 3.104，控制项耗时也发生变化；保留原始结果，继续验证，不降低预算或重新冻结 reference。
- C007 仍缺获准脱敏真实样本、独立人工基线及目标工程师操作记录。历史任务勾选、自动化与演示数据均不能替代这三项输入。

## 2026-11-07 来源统计候选验证

- `status()` 的两次顺序来源查询合并为一条 SQL；明确结果列名，避免 PostgreSQL 两个未命名 COUNT 列相互覆盖。干净分支仍不查条目表，两种来源均取真实行，不用冗余总数反推。
- 新增调用次数回归先因读两次失败，修复后完整工作树插件 81 文件、1286 项通过，语句/分支/函数/行覆盖率为 96.39% / 90.27% / 97.50% / 97.56%；lint、类型与公开文档构建通过。
- 共享真实后端回归覆盖含引号分支名、其他分支隔离与总数漂移；PGlite 首轮暴露结果列重名问题，修复后 SQLite、wa-sqlite、sqlite-wasm、sqliteai、PGlite、Electron 六端各执行同一条回归并通过，六个适配器类型检查通过。定向过滤项不计完整套件。
- 在完整 affected 和此前全量 benchmark 进程结束后，复制现行 benchmark 仅保留完整 status 测点进行诊断；夹具、预热、采样数、control 与计时方法未变，正式 benchmark 源码及 fixture 哈希保持原值。优化版先测、旧版后测：旧版 P95 7.60ms、control P95 3.70ms、比值 2.054；优化版 P95 5.92ms、control P95 3.55ms、比值 1.670。诊断画像为 Darwin x64 / Intel i9-9900K / Node 26.13.0，没有匹配冻结 reference，两轮仍按原规则报告环境不匹配，不能记为性能门禁通过。
- 保留前一轮并行运行完整门禁时的反向结果：完整 benchmark 的 status 比值从 2.015 变为 3.104，其他 control 也有明显变化。上述诊断只为候选提供同机证据，最终仍以新提交的正式远端门禁为准；预算、冻结 reference、正式 benchmark 与 fixture 未改。
- 证据为 `/tmp/bom-status-origin-final-plugin-evidence.json`、`/tmp/bom-status-origin-real-backends-evidence.json`、`/tmp/bom-status-origin-benchmark-comparison-evidence.json` 与 `/tmp/bom-status-origin-status-only-evidence.json`。暂未把新候选计为 C005 或 C006 完成。

- 来源统计候选合入工作区后已重新构建 Aiao BOM；64 个发布资产与已部署版本逐项同路径、同 SHA-256，`_headers` 控制文件也与已部署源码一致，C008 保持完成，详见部署记录与 `/tmp/bom-origin-app-public-equivalence-evidence.json`。

## 2026-11-07 虚拟件制费说明修复与门禁复核

- 复核来源为 a5a9f7cf。两个虚拟件先后穿透到根成本时，后继「工作中心未声明制费」会覆盖已计费理由，导致制费金额 `2.5` 与说明矛盾；应用成本依据直接显示该字段。双后端四项顺序回归在旧实现 2 失败、2 通过；修复后两份成本文件 74/74 通过。
- 隔离工作区完整 BOM 测试 89 文件、1554 项通过、1 项后端条件跳过；语句/分支/函数/行覆盖率 96.31% / 89.72% / 97.29% / 97.77%，四项均达到插件 80% 门槛。lint、typecheck 通过；代码及回归已按同一文件哈希迁入主工作区。
- a5a9f7cf 的正式 `ci / benchmarks` 已通过，run 42290634880 / job 128144524120。实际画像为 AMD EPYC 9V74 / Linux x64 / Node 26：status 1.706 ≤ 2.658、diff 2.010 ≤ 2.868、restore 12.547 ≤ 13.230、commit 15.184 ≤ 15.538；匹配既有冻结 reference。先前 Xeon 的失败和本机两轮诊断继续保留，不能跨机器直接比较。
- a5a9f7cf 的完整 affected 在 05:04:12 停止，源码与 HEAD 均稳定。SQLite-WASM 完整目标有 2 条用例触发本地 5 秒超时，1006 项通过、13 项跳过；同配置独立复跑仍是这两条超时。仅串行调度文件后 1008 项通过；隔离 BOM 完整套件结束后，恢复原有默认文件调度及 5 秒超时，再次完整执行也为 1008 项通过、13 项跳过，Nx 标记该目标 flaky。适配器源码、测试断言、超时和默认调度配置均未改，后续完整门禁独立执行。
- 修复初次合入工作区时收尾为 4/8；完成下述新版公网验收后恢复 5/8。C005 等待集成源码完整门禁，C006 等待最终提交全部远端检查，C007 缺真实业务输入。隔离完整套件不替代最终源码的 affected 与 CI。
- 证据为 `/tmp/bom-phantom-overhead-full-plugin-evidence.json`、`/tmp/bom-origin-benchmark-ci-success-evidence.json`、`/tmp/bom-final-affected-after-origin-evidence.json`、`/tmp/bom-origin-sqlite-wasm-rerun-evidence.json`、`/tmp/bom-origin-sqlite-wasm-serial-evidence.json` 与 `/tmp/bom-origin-sqlite-wasm-default-idle-evidence.json`。

## 2026-11-07 05:25 新版公网验收

- 运行源码提交为 `322bb6f0a72fdd03b0ad95c77e720e3bfcd008e3`。发布预检通过，生产浏览器 40/40、本地 Wrangler 5/5、公网 Chromium 5/5 通过；单 worker、零重试。
- 新 Worker 版本为 `4baf9e83-d6a7-4667-90dc-9cff57827cb5`，5 个新资产上传、59 个复用。全新窄屏浏览器中 64 个发布资产 SHA-256 与本地一致，首次主入口可用，跨源隔离正常；C008 重新关闭。
- 详细记录见 [Cloudflare 部署验收](cloudflare-deployment-verification.md)，实际浏览器结果为 `/tmp/bom-phantom-public-artifact-verification.json`。当前仍为 5/8，最终源码完整 affected 与远端全部检查待执行；真实样本试用所缺输入保持原状。

## 2026-11-07 入口体积与基准依赖修复

- 9a5d448b 的完整八类 affected 于 07:00:25（Asia/Shanghai）结束：102 项目、414 目标全部成功，197 本地缓存命中，耗时 90m47s；BOM 1554 项通过、三端完整浏览器分别 246/241/224 项通过，BOM 共享 51/51、应用生产浏览器 40/40。两个无日志 banner 的目标为 `nx:noop` 依赖聚合器，resolved task graph 对账无遗漏。
- 随后独占串行的三项 BOM/Reach 基准均在测量前报 `ERR_MODULE_NOT_FOUND: @aiao/rxdb-plugin-bom`；历史 Reach 报告明确排除。原入口审计真实失败：core 静态 gzip 50,060 字节，其余四入口通过；完整 affected 与常规远端 CI 没有替代该手动门禁。
- 通过 pnpm workspace 命令为 benchmarks 增加显式 BOM 依赖。将既有物料显示信息分块读取原样移至 `view-items.ts`，仅由异步快照入口按需加载，读取仍在同一事务内完成；公开入口、排序、分块大小、错误与返回合同保持原值。
- 原体积审计复验为 core 静态 gzip 49,907 字节，testing 39,034、Angular 4,092、React 2,484、Vue 3,362；五入口均严格低于原 50,000 字节门槛。core 完整动态可达为 108,505 字节，不能把静态入口预算表述为整个包体积。core 仅余 93 字节，预算未放宽。
- 完整 BOM 回归 89 文件、1554 项通过、1 项后端条件跳过；语句/分支/函数/行覆盖率为 96.31 / 89.72 / 97.29 / 97.77%，四项均达到本插件 80% 门槛。格式化及 BOM/benchmarks 静态检查共 38 目标通过；整个验证期间四个修改文件哈希稳定。
- 当前修复仍需新最终提交的完整 affected、四项手动门禁、全部远端 CI 和部署复验，C005/C006/C008 保持未完成。C007 继续缺获准真实样本、独立人工基线与目标工程师操作，自动化不能替代。
- 原始证据为 `/tmp/bom-final-affected-after-phantom-evidence.json`、`/tmp/bom-final-head-manual-release-gates/failure-analysis.json`、`/tmp/bom-view-items-bundle-fix-evidence.json`、`/tmp/bom-view-items-fix-checks-evidence.json` 与 `/tmp/bom-view-items-fix-source-sha256.json`。

## 2026-11-07 逻辑行索引与旧库升级

- 真实视图的 SQL 诊断发现，数量展开按 99 条逻辑行重复扫描发生项；夹具的 99 条边引用同一子件，子头缓存已去重，不能把它当作 99 个子件的 N+1 问题。
- 在发生项实体增加 `occurrence_line(lineId)` 普通索引，并贡献独立迁移 `0002-bom-occurrence-line-index`。已有表补建索引，新引入实体由建表路径创建索引；迁移不改动发生项和派生数据，不修改公共 SQLite 适配器。
- 新建库实际索引计划仍有双后端断言。旧库测试移除新索引和对应迁移水位后重新连接，核对实际索引目录、迁移记录、两条真实序列候选及未裁决结果；升级测试不强迫 PGlite 在小表上选择索引扫描。迁移实现前两条升级回归有效失败，实现后连同既有升级回归 20/20 通过。
- 新增迁移后原体积审计真实失败，core 为 50,051 字节；第一次拆分因保留内部静态重导出仍失败，为 50,122 字节。去掉该内部重导出，将安装指纹比对及 DDL 错误包装按需加载，函数体保持原值；安装测试直接引用新内部模块，公共包入口不变。
- 五入口原预算审计复验通过：core 静态 gzip 49,062 字节、testing 39,047、Angular 4,092、React 2,484、Vue 3,362，均严格低于 50,000 字节。core 完整动态可达为 109,077 字节，另行报告；不能把静态入口体积称作整个包体积。
- 拆分后类型检查与零警告 lint 已通过，完整 BOM 回归与覆盖率正在独立进程执行，结束后才执行性能诊断；尚未取得修复后的原性能门禁通过证据，C005 保持未完成。
- 证据：`/tmp/bom-occurrence-line-migration-red.log`、`/tmp/bom-occurrence-line-migration-green.log`、`/tmp/bom-occurrence-line-index-validation/bundle-before-split-evidence.json`、`/tmp/bom-occurrence-line-index-validation/regression-evidence.json` 与 `/tmp/bom-occurrence-line-index-validation-lazy/regression-evidence.json`。最终源码全门禁、远端 CI、部署及真实试用仍分别验收。

## 2026-11-07 连接器生命周期与同快照读取

- 真实浏览器重建案例暴露 DevTools 单例仍持有旧 RxDB；先补状态单测及现有 AC#1 两遍 seed 的控制台断言，两条路径均取得有效红测，再在初始化新实例前调用已有 disconnect 释放旧实例。修复后应用静态门禁、230 条单元测试及生产浏览器 40 条验收通过；单 worker、零重试。
- 4311 已有开发服务，浏览器回归通过临时配置独立端口静态服务同一生产产物；原有测试、超时、重试和业务断言不变，未中断开发服务。
- 结构与数量展开在同一次视图读事务中重复查询根修订；双后端先证明相同查询实际执行两次，再将成本已有的事务内读取缓存提取共用。同快照读取、后续快照的新物料描述与计划量、未裁决和截断回归共 22 条通过；性能收益仍须由独占实测确认。
- 包组合知识生成在隔离目录进行，现有 SDK skill 未被覆写；生成的 SDK skill 与工作区现有摘要逐字节相同。当前分支的相关生成物须在最终交付前保持一致。

- 连接器生命周期修复与两处回归已独立提交 b043d90a；当前最终门禁、远端 CI 和部署尚未覆盖全部后续修改。
- 同快照去重后一次视图读取 SQL 从 10 条降至 9 条，但最近独占诊断的 p95 为 33.843ms，仍不达标。交错 SQL 对照只证实结果等价，没有证明足够性能收益；未采用增加物化 CTE 的方案。随后修复数量 SQL 的重复子修订解析，真实 EXPLAIN 先红（198 > 99）后绿，数量、结构与视图 50 条回归通过；仍待新性能采样。
- macOS Tauri 失败产物中已发生初次握手、窗口重建和主窗刷新，但看门狗前未交出报告。补充两个「握手先于等待到达」的有效红测后，等待支持动作前基线，启动与刷新等待第一轮，重建窗口前先建立下一轮等待。定向 17 条及完整应用 353 条单测、零警告 lint 与类型检查通过，真实双 WebView 烟测 43/43 通过且源码指纹稳定。修复已独立提交并推送 d539e126，远端 macOS 验证尚未结束；保留原 20 秒等待预算与 Rust 60 秒看门狗。

## 2026-11-07 当前源码完整验证续跑

- 本轮完整回归启动于 d539e126，包含已推送的演示连接器重建与 Tauri 握手时序修复；BOM 安装分块与查询优化随后以原样源码分别提交 0bb8d0ce、89d59a0d，运行期间全部 BOM 源码哈希保持不变。上一轮完整 BOM 回归因会话中断，仅进入项目图发现，记录进程已退出，没有测试结果，不记为通过。
- 当前 BOM 源码完整回归与四项覆盖率已重新启动；其后才检查独占 CPU 条件并执行视图及普通反查诊断。全部既有阈值、夹具、断言与 reference 保持原值，最终完整 affected 与正式四项门禁仍单独验收。
- 三端入口静态核对的 7 个导出完全对称；该证据不替代运行时三端回归。现有 SDK skill 内容未改动，仍作为用户工作区修改保留；生成物漂移必须在最终交付前闭环。

- 临时浏览器会话在工具重建后未保留存储，旧 `/tmp/bom-line-index-upgrade-before.json` 仅作历史记录。新的旧部署合成基线改用 `.playwright-mcp/bom-line-index-upgrade-profile` 独立磁盘目录；关闭重开后不准备或重置数据，17 台、改前 CNY 598.75、改后 CNY 615.75 及 9 条变化均一致。基线主脚本哈希仍匹配 322bb6f0；新版部署后的原地升级尚未执行。证据为 `/tmp/bom-line-index-upgrade-persistent-before.json` 与 `/tmp/bom-line-index-upgrade-persistent-reopen.json`，不计作 C007 真实试用。

- d539e126 的远端 macOS Tauri 打包与真实 DevTools 烟测已通过：job 128268100165，打包 19 通过 / 2 条条件跳过，双 WebView 43/43。13 份诊断报告已归档；gear-none 的失败报告是不可用后端必须退出 1 的既有负向断言，其余正常启动报告均完成握手。证据为 `/tmp/bom-current-repair/tauri-ci-d539e126/evidence.json`，全部最终提交 CI 仍须统一核对。
- 89d59a0d 的 170 份 BOM TS 源码与本轮完整回归启动指纹逐字节一致；90 文件、1561 项通过、1 条后端条件跳过，语句 / 分支 / 函数 / 行覆盖率为 96.31% / 89.73% / 97.22% / 97.76%。随后独占诊断活视图 p95 24.436447ms、100 物料普通反查 p95 19.121884ms，仍未达到 16ms；命令退出 0 不记为性能通过。
- 原始发生项在结构与数量中仍重复读取：双后端新增执行次数断言均先红（2 次，应为 1 次），改为按已裁决的头共用原始读取后，定向回归通过；两套遍历的候选裁决与预算保持独立。头元数据的重复读取另取得双后端有效红测（4 次，应为 2 次），共享查询的修复仍在验证，当前修改尚未取得完整全量与最终性能通过证据。

## 2026-11-07 共享读取验证与反查诊断

- 共享头查询改变了绑定参数顺序，旧观测器只比较第一个参数导致双后端读取次数误报为 0。保留原 1 次 / 下一事务累计 2 次、99 条真实边与独立路径、数量翻倍断言，改为比较完整查询参数；失败文件 7/7 通过。此前 8 文件回归的其余 147 条已通过。
- 当前共享读取源码在静态检查、包组合知识检查、五入口体积审计与独占诊断期间指纹稳定。core 静态 gzip 49,125 字节，原 50,000 字节门槛未改；活视图 p95 11.759724ms，实际 6 条 SQL，结构与数量原始发生项只读取一次。诊断不替代正式门禁和最终完整回归。
- 反查保留原夹具、独立路径 oracle、完整返回值对照及 5 次预热 / 20 次交错采样。候选物化、ECN 物化、绑定去重和谓词去重均未取得稳定的原预算通过证据，未合入生产 SQL；后续仍以最终正式报告为准。
- 证据为 `/tmp/bom-current-repair/shared-header-observer-green.log`、`/tmp/bom-current-repair/shared-read-validation/evidence.json` 和 `/tmp/bom-view-profiling/after-shared-header-occurrences.json`。普通反查的隔离实验报告位于 `/tmp/bom-reach-query-profile/`，不能因进程退出 0 关闭 C005。

## 2026-11-07 长短路径的同快照使用方读取

- 长短路径让同一物料在不同反查层再次出现。双后端有效红测证明同一事务重复读取根物料 2 次；原始使用方按物料在本次事务内复用后只读 1 次，全部 6 条独立发生项路径仍保留。下一次查询新增父件后返回 10 条独立路径，4 条新增使用方路径均可见，读取不跨事务复用。
- 缓存保留同行完整候选并重新按路径修订、序列、批次及配置裁决。合并使用原 SQL 排序键，另携带数据库原始时间文本，保留 JavaScript Date 截断后的微秒次序。微秒夹具最初被已发布写协议拒绝，不计为有效红测；改为草稿写入、正常发布后，两后端均取得排序断言失败，再修复后连同展开、序列批次和修订边界共 86/86 通过。
- 独立 PG 候选套件的最小表定义缺少当前解析所需字段；补齐修订状态/日期、子修订、物料流方向及 ECN 字段，原有 201 个使用方跨块、过期目标和序列排除的三条断言不变，3/3 通过。
- 原 SQL 的普通反查诊断为 8 条查询，p95 21.794239ms，仍不满足 16ms。数组成员、标量 ECN 等后续方案仅在隔离脚本中比较，尚未合入生产。性能预算、原夹具、预热及采样次数、冻结 reference 保持原值，C005 不关闭。
- 当前反查修复的完整回归与覆盖率须单独记录在 `/tmp/bom-current-repair/usage-core-validation/evidence.json`。专项证据为 `usage-query-cache-red.log`、`usage-query-cache-order-valid-red.log`、`usage-query-cache-order-valid-green.log` 和 `usage-query-cache-pg-candidates-complete.log`，均位于 `/tmp/bom-current-repair/`。

## 2026-11-07 完整回归失败复核与 main 集成准备

- 03d86194 的完整回归在 11:36 退出 1：368 通过、2 条 PGlite 持久迁移超时、1 条条件跳过，另有浏览器断连运行错误；实际未完成全部 91 个文件，不据此生成全包覆盖率结论。源码指纹保持稳定。
- 保留原 15 秒超时、原断言与单 worker，对 `bom-generated-storage.spec.ts` 和 `bom-instance-source.spec.ts` 独立复跑，两文件 32/32 通过；本次未复现原失败，不能据此宣称业务回归或全量通过。完整套件已再次启动，证据为 `/tmp/bom-current-repair/core-full-retry/evidence.json`；定向证据为 `/tmp/bom-current-repair/browser-failure-recheck/evidence.json`。
- 隔离工作树 `/tmp/bom-main-integration-20261107` 已解决 main 依赖升级的 10 个冲突，保留双方 manifest 独立变化，BOM Angular 对齐 main 的 22.2.4。锁文件由 pnpm 按合并后的全部清单重建，并通过 frozen 校验；三份包组合知识产物按合并事实源重新生成并校验通过。补丁为 `/tmp/bom-current-repair/main-integration-review.patch`，尚未提交或应用到原分支。
- 原工作区 `packages/rxdb/skills/aiao-rxdb/SKILL.md` 的 SHA256 仍为 `edf363ef9d1c0bf6f7db9000825ebee428cd6bfb12774a1eb8ed93b7d14f4f4f`，没有覆盖或纳入提交；真实样本、独立人工基线及目标工程师记录仍未取得，C007 不关闭。

- 三端公共入口人工比对及 TypeScript AST 门禁通过：62 个公开包、100 个入口与基线一致；BOM 三端共享四种类型及三个运行时入口，状态容器按各框架约定包装。证据为 `/tmp/bom-current-repair/tri-framework-api-recheck.json`，只证明静态 API 对称。
- 隔离合并在 frozen 安装后进入静态构建，因本机磁盘已满（ENOSPC）失败，不能记为通过或据此判定业务回归。空间恢复后保留源码、锁、生成物和失败日志，回收本轮隔离依赖目录；后续验证须使用显式隔离缓存路径。原分支完整 BOM 回归仍在同一进程执行，未因观察超时重启。
