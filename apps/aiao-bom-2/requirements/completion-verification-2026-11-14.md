# aiao-bom-2 领域接入与最终验收

日期：2026-11-14，Asia/Shanghai。独立新版保留原站与原库；领域接入、迁移演练和新旧业务回归已经完成，应用性能与浏览器验收已通过，main 基线受影响门禁已通过，独立公开预览发布及公网验收已完成。本记录更新初轮 [实施记录](implementation-report-2026-11-13.md) 和 [快照验收](version-snapshots-2026-11-14.md) 中的后续事项。

## 实际交付

结构工作台仍以 VTable 为核心，包含树、逐位置平铺、物料汇总、系统范围、20 列、搜索筛选、保存视图与分段物化。真实来源按主清单、采购关系和 CAD 场景分别保存；模型匹配等级与数量缺口保留。

领域代码统一在 `modules/bom-workspace`。新旧应用复用页面和领域 API，以各自路由参数创建服务和状态，使用独立数据库。新版 `/domain` 提供领域概览，`/review`、`/explosion`、`/timeline`、`/mapping`、`/cost`、`/where-used`、`/instances` 覆盖原有流程，`/transfer` 提供备份、恢复与回退。惰性加载保持结构工作台入口独立。

结构草稿可选择明确装配，经制造关系确认、数量和结构校验后转为领域草稿，通过既有领域内核原子导入，再明确发布。测试里的制造父子关系由用户核对流程确认，不把来源分类或 CAD 父子关系宣称为制造事实。

完整逻辑归档迁移使用新库恢复与指针切换，不共写旧库。坏归档拒绝、刷新重开、原库保护与回退均已真实演练；全部数据条目原文相等，schema 按名称排序后定义全等。运行顺序和边界见 [领域迁移说明](domain-migration-2026-11-14.md)。

## 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 公共 BOM 内核 | 91 个文件、1,565 项通过 / 1 项既有跳过 | 四项覆盖率 96.32% / 89.75% / 97.24% / 97.77%，完整 SQLite / PGlite 图查询与历史测试 |
| 新版完整浏览器验收 | 59 / 59 通过，5.5 分钟 | Chromium 结构 / 性能 / 迁移、40 项领域流程及 Firefox / WebKit 兼容 |
| 新版领域流程 | 40 / 40 通过 | 复用旧版完整 E2E，从 `/domain` 进入 |
| 旧版流程回归 | 40 / 40 通过 | 旧入口 `/`、独立静态服务、原库身份 |
| 共享模块 | 437 / 437 单测通过 | 四项覆盖率 89.43% / 81.13% / 92.63% / 92.42%，依次为 statements / branches / functions / lines |
| 浏览器兼容 | Chromium / Firefox / WebKit 各通过 | 真实清单、平铺搜索、375px 抽屉焦点、SQLite 数据准备与备份入口 |
| 归档迁移与草稿领域化 | 浏览器通过 | 自定义长 Decimal、发布、完整导出、换件历史、损坏归档与回退 |
| 最终应用覆盖率与源码门禁 | 100 / 100 单测、lint / typecheck / spec-typecheck 与生产构建通过 | 四项覆盖率 93.13% / 85.95% / 94.01% / 96.99% |
| 性能与资源 | 分项全部通过 | 首屏、双向选择、50k 同屏、20 次模型资源、100k 深树；原始样本及首次 100k 样本配置失败保留 |
| main 基线全量 affected 门禁 | 通过，21m03s | main 基线 114 个受影响项目，463 项任务 / 330 项缓存；原脚本同目标串行 |
| 独立公开预览 | 已发布，线上验收通过 | 10 个深链接、9 个关键文件哈希、真实 GLB / WASM、SQLite 备份恢复及移动导航；原站未切换 |

修复了两个真实边界：本地视图读取期间取消装载不再提前替换当前数据；移动抽屉首次打开时，可见性立即生效，再执行焦点迁移，保留滑出动画。另为实例与映射补齐成功 / 拒绝 / 重置 / 迟到响应 / 过期条件的测试。

## 性能计量边界

`bom2:data-ready` 起点为规范化来源快照已解析、准备安装，不包含网络下载、JSON 解析或完整 SQL 查询。计时包含本地草稿 / 视图读取、索引、查询和 VTable 首次绘制。因此该数值是结构工作台数据就绪到首屏的验收，不是领域 SQLite 查询总耗时，也不是冷导入耗时。

首屏用 50k 合成发生关系、20 个业务列、20 次独立页面重载；真实模型反向计时用 PointerEvent 触发实际 raycaster，再等待 VTable after_render，核对发生位置 URL 改变。相机动画单列。模型资源用真实 GLB 与 WebGL driver 的 create / delete 和 contextlost 事件记录，不能用模拟销毁次数替代浏览器资源验收。

50k 同屏模型测试复用 20 个真实 CAD 位置，不表示 50k 个独立几何资产。滚动 FPS 只表示表格滚动，不表示整车旋转 FPS。失败原始测量与最终通过样本分别保留，不放宽阈值。

## 本轮性能结果

本轮完整门禁中的最新生产构建，macOS 24.6.0 x64、Intel i9-9900K、32 GiB，Chromium 单 worker、1280 × 720。浏览器使用 SwiftShader。没有并行执行本工作区的其他测试或构建；系统其他工作区和应用可能有负载，不宣称机器完全空闲。

| 场景 | 实测 | 门槛 |
| --- | --- | --- |
| 50k / 20 列数据就绪到首屏 | p95 306.98ms | ≤ 1000ms |
| 模型反向拾取到表格 | p95 62.54ms | ≤ 150ms |
| 纯表格树 / 平铺切换 | p95 95.83ms | ≤ 150ms |
| 纯表格搜索，扣除 180ms debounce | p95 119.21ms | ≤ 300ms |
| 真实整车同屏切换 | p95 102.21ms | ≤ 150ms |
| 真实整车同屏搜索，扣除 debounce | p95 137.51ms | ≤ 300ms |
| 表格到已就绪模型选择 | p95 89.13ms | ≤ 150ms |
| 表格滚动 | 平均约 60 FPS，p95 帧耗时 16.67ms | ≥ 50 FPS / ≤ 32ms |
| 纯表格 JS heap 增量 | 95.30 MiB，窗口 1,000 行 | ≤ 200 MiB / ≤ 4000 行 |
| 20 次真实整车开关 | 每次关闭活跃 context 归零；每轮分配 84、显式释放 77、context loss 释放剩余 7 | 活跃 context 不累积 |
| 100k / 50 层 | 范围 depth:49 含 99,951 个位置，末项 depth:99999 可定位；取消保留当前数据 | 完整位置与取消 |

证据位于 [正式证据目录](evidence/)，文件统一以 completion- 开头。首轮 100k 样本复用了补充目录物料，默认筛选排除了其中一部分，导致计数断言失败；改用主清单物料后，100k 规模、50 层和完整计数断言保持原样通过。其余五项性能 / 资源测试首次全部通过，未修改阈值。

## main 基线完整门禁执行记录

原 `pnpm test-all` 以 `main` 为基线，覆盖 114 个受影响项目。前三次原始并行度 4 的运行依次遇到看板覆盖率用例超时、客户端生成器 Vite watcher 等待超时，以及 sqlite-wasm 三个浏览器用例超时和 sqlite 浏览器进程挂起。看板与生成器的整包独立复跑均通过，Nx 将其标记为 flaky；没有修改公共包代码或放宽超时。第三轮挂起约 11 分钟，进程与浏览器 CPU 均为 0，记录 PID 和工作目录后只终止该轮拥有的 Vitest 与 Chromium，第三轮按失败归档。

最终复跑从 `package.json#scripts.test-all` 动态读取原命令，只把唯一的 `--parallel=4` 替换成 `--parallel=1`，保留八类目标、依赖、缓存与失败即停配置。没有给 `pnpm test-all` 追加重复 `--parallel`，因为本机 Nx 24 的重复参数会仍取首值 4。第一轮串行在 3m22s 后收束：原先挂起的 sqlite 整包通过，sqlite-wasm 仍有 1 项超时、1,027 项通过。进一步定位发现该包没有限制 Vitest 浏览器文件并发，Nx 串行并不限制包内并发。同一 S1 用例独立执行 789ms 通过。因此只为 sqlite-wasm 测试配置加入 `fileParallelism: false`，与 sqlite / sqliteai 适配器保持一致；保留原有 5 秒超时、全部用例、覆盖率和断言，整包验证 34 个文件全部通过，1,028 项通过 / 13 项既有跳过；S1 用例为 426ms。statements / branches / functions / lines 为 95.95% / 87.30% / 98.70% / 97.34%，lint / typecheck 同时通过。随后继续运行完整门禁。

```text
pnpm --config.verifyDepsBeforeRun=false nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e --output-style=static --skipRemoteCache --parallel=1 --nxBail
```

第二轮串行执行 103m41s，已完成 448 项任务、179 项缓存命中。新版 59 项、旧版 40 项、Angular / React / Vue 示例 247 / 242 / 225 项及 Electron 应用 58 项 E2E 全部通过，文档站构建也通过；随后 `rxdb-adapter-electron:test-memory` 两项恢复测试因真实磁盘空间不足失败。失败后磁盘可用约 1.5 GiB，临时库已由测试自身清理。只清理本仓库旧 Nx 派生缓存与已核对缓存一致的网站构建目录，保留本轮有效缓存；原 24 / 96 MiB 两档、原并发配置、预算和断言不变，独立整包内存测试 2 / 2 通过，耗时 2m56s。随后继续完整门禁，未改业务或测试规模。缓存清理清单、原始失败和独立复验均已归档。

主体实现于运行期间被记录为提交 `2c9a3347`，提交范围保持在本功能内；测试运行中的业务源文件未发生变化。后续工作区变化为验收文档、证据与全仓 E2E 自动生成的测量记录。

第三轮完整串行门禁全部通过：114 个受影响项目、463 项任务，330 项缓存命中，耗时 21m03s。PGlite 1,683 项与隔离 Docker Supabase 664 项均通过。最终应用覆盖率为 93.13% / 85.95% / 94.01% / 96.99%，100 项单测通过；独立发布 dry-run 成功。历史 flaky 提示仍包含先前已处理的生成器、sqlite 与磁盘空间失败，不代表本轮新增失败。最终门禁摘要及原日志哈希见 `evidence/completion-test-all-final-2026-11-14.*`。门禁结束后通过既有 Nx `test-env-down` 目标清理本 checkout 的 Supabase 测试环境，所属容器和状态文件均已移除，见 [环境清理结果](evidence/completion-test-environment-cleanup-2026-11-14.json)。

## 独立公开预览验收

预览地址：<https://aiao-bom-2.aiao.workers.dev>。Cloudflare 版本 `ae3a514b-3463-400d-a731-b277e2bb5fb3`，部署源为 `2c9a3347722d345a95b4af37efcecf6f0e57a1f9`。独立 worker 上传 97 个静态文件；本地发布清单共 98 个文件、38,976,642 字节，包含不作为静态资源上传的 `_headers` 配置。部署成功后没有修改应用运行源码。

| 线上检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 路由与响应头 | `/`、`/domain`、`/review`、`/explosion`、`/timeline`、`/mapping`、`/cost`、`/where-used`、`/instances`、`/transfer` 均 200，HTML 哈希与构建相同；COOP `same-origin`、COEP `require-corp`、nosniff 正确 | [HTTP 验证](evidence/completion-live-http-2026-11-14.json) |
| 关键文件 | 主 JS、来源 JSON、整车 GLB、Draco、三种 SQLite WASM 及 index 共 9 个文件下载字节数和 SHA-256 与本地构建一致；WASM MIME 正确 | [发布清单](evidence/completion-release-artifacts-2026-11-14.json) |
| 真实整车 | CAD 深链接定位 `1321315X9D01A`，隔离 / 还原成功，实际点击模型后表格定位到 `cad:8591`；浏览器 `crossOriginIsolated=true`，无 pageerror | [桌面结果](evidence/completion-live-desktop-2026-11-14.json)、[截图](evidence/completion-live-workbench-2026-11-14.png) |
| 真实独立零件 | 主清单 `1300001X9D01` 加载来源 CN `1300001X9D01A` 模型，15,479,312 字节，HEAD 200 且 CORS `*`；实际解码成功，独立视图不宣称整车位置匹配；平铺搜索匹配 1 个位置 | [零件结果](evidence/completion-live-part-2026-11-14.json)、[截图](evidence/completion-live-part-2026-11-14.png) |
| SQLite 与移动导航 | 隔离浏览器准备 40 项领域演示物料，下载 666,760 字节完整归档；375px 宽无横向溢出，抽屉聚焦当前链接，Escape 恢复按钮焦点 | [领域结果](evidence/completion-live-domain-2026-11-14.json)、[移动截图](evidence/completion-live-mobile-2026-11-14.png) |
| 公网恢复与回退 | 同一隔离上下文向新库恢复、刷新保留库身份、损坏归档 checksum 拒绝且库身份不变、回退原库；29 个归档条目逐项比较，数据原文、排序 schema 及两类指纹一致，原库未变 | [恢复结果](evidence/completion-live-restore-2026-11-14.json) |

本轮公网浏览器使用专属上下文 `bom2-release-20261114`。这里准备和恢复的都是该上下文的演示数据，没有读取或迁移用户既有浏览器数据。Node / curl 直接访问公网出现连接超时，因此 HTTP 字节与头验证通过实际隔离 Chromium 的 fetch 执行，记录中保留传输方式；不是以本地响应代替线上响应。线上恢复归档不提交到仓库，正式证据仅保留结果和 SHA-256。

线上验收脚本初轮修正了即时读取 Angular 更新状态的竞态、浏览器工具不支持动态 Node 导入，以及独立零件深链接使用了来源资产变体而非主清单发生项件号的问题；最终断言通过，应用源码没有为此修改。发布日志和版本记录见 [部署输出](evidence/completion-public-deploy-2026-11-14.txt) 与 [发布摘要](evidence/completion-public-release-2026-11-14.json)。

## 尚待生产放行的动作

领域 owner 已批准完整功能演示范围，见根 requirements/domain-research/README.md 与 epic-009；本轮独立 Windrose 工作台也已有用户明确授权，无需重新立项。领域与公共包的 PR 最终统一评审，以及用户真实 origin 的备份核对、生产路由切换和回滚记录，仍需独立完成。自动化迁移只使用隔离测试库。公开预览不会自动完成生产替换。
