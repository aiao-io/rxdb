# 本地作品检索与视口预览实施清单

范围与 AC 见 [MEDIA-US-204](../stories/account/MEDIA-US-204-library-search.md)，依赖 MEDIA-US-202/301。2026-10-25 已完成本地实现与本故事的自动化验收；旧故事已通过的 AC 与正式未验边界保持原证据。当前功能未部署、PR 未合并；全部 AC 已验，故事按用户本次指令及 D-11 记为 Done，PR 评审与合并单独跟踪。

## 约束与数据流

- 现有作品 metadata 是全库事实，筛选/分页结果与 IO 相交 ID 是两个独立派生集合。全库事实继续用于同步快照、`remoteOnlyWorks` 与任务文件归属；当前页不代表库中全部本机作品。
- 独立 `search`/`model` 分别对 `prompt`/`modelId` 使用原生字面 `contains`，大小写敏感，条件 AND；`from`/`to` 按浏览器本地日起止，用结束日次日零点作排除上界。
- 页大小 24，排序 `createdAt DESC` 再作品实体唯一 `id DESC`，不使用生成任务 `jobId` 作排序键。筛选变化回第一页，数量变化钳制有效页，空结果时禁用翻页。
- 仅“当前页且 IO isIntersecting”的卡片读取原图；视口外固定高度占位。滚出/翻页/筛选/离页/关闭/切工作区使对应读取失效并释放 URL，迟到结果仍释放。
- 冷重开只恢复 ready 元数据，不遍历读取已确认原图；显式预览/详情/备份仍完整验证，损坏与暂时不可读分别失败且保留文件。saving 必须完整回读后才转 ready，deleting/孤儿清理不变。
- 全库 metadata 首次成功前保持未知，不显示“本机无原图/无副本”或空库；后续错误保留已知归属，独立重试不污染其它存储错误。
- 不添加 schema/backfill、索引平台或 packages 改动，不启用生产服务。新只读浏览操作不发生成或上传，不修改全库 metadata；已有显式删除保持原语义。

## 任务顺序

- [x] T01 先写红测：查询契约覆盖独立 prompt/model 与 AND、英文大小写、字面 `%`/`_`、空条件、日期边界、非法日期/倒置区间、本地整日与 DST；覆盖零结果、24 件页边界、同时间稳定 ID 排序和越界页。
- [x] T02 实现应用内查询/分页状态与 metadata 读取契约：匹配总数、当前页 24 项与全库本机 ID 来源独立；使用原生过滤/排序/分页/计数，不预读图片 Blob，不改变持久 schema。输入错误不变成空集或持久写入。
- [x] T03 先为 `work-library-session.spec.ts` 增加红测：IO 未相交零读取、进入/离开/再进入、在途切页/筛选/工作区、旧 URL 与迟到结果释放、单文件错误继续、关闭后无活动 URL。
- [x] T04 改造 `WorkLibrarySession` 与可见性接线：只接收当前页相交 ID；为可见性/页/筛选/工作区变化建立失效边界，取消旧订阅并拒绝旧回调；保留仍有效的可见 URL，不遍历整页或全库准备原图。
- [x] T05 接入 `/images` 独立提示词/模型筛选框、from/to、匹配总数、页码与前后页按钮；固定占位高度与真实 IntersectionObserver。区分空库/无结果/加载/查询错误/单卡错误及全库未知，筛选回第一页。
- [x] T06 删除与全库事实回归：删除末页最后一项回最近有效页；页外、筛掉和未相交作品仍参与归属与同步快照。首次 metadata 失败不推断无副本，后续错误保留成功事实；不制造 tombstone/上传，保留下载/复用/显式删除。
- [x] T07 真实本机浏览器验证：50 张 fixture 图片覆盖筛选/日期/多页、滚动 IO、离页和同文档工作区切换，记录活动 URL；原有 28 项本机/可靠性/Auth fixture 与新增 3 项统一 31/31 通过，不调用真实供应商。
- [x] T08 分层验证大图库与生命周期：真实原生 SQLite/OPFS 用 1,005 条 metadata 验证页/计数不截断且零原图读取；真实全应用用 50 张图片验证相交预览及活动 URL 上界，冷启动另验 ready 延迟读取与 saving 恢复。会话单测验证迟到回收，不将累计 URL 次数当驻留量，不声称 1,000 张原图 UI 或毫秒性能实测。
- [x] T09 经 Nx 完成应用/e2e lint/typecheck、查询/会话/metadata/根组件测试、真实原生浏览器、统一本机 E2E 和生产构建；需求回填后运行 format 与 requirements-check。覆盖率只按实际报告说明范围，不复用旧百分比。
- [x] T10 回填 MEDIA-US-204 AC 与派生视图，明确本地/fixture/原生与全应用样本边界；未部署、未合并不标 Done，旧故事 AC 与正式未验项保持原证据。

## 主要落点

`src/app/work-library-session.ts` 与真实视口指令负责预览资源；`work-metadata-session.ts` 保留全库事实和未知/错误状态；`local-image-mvp.ts`/`.html` 负责筛选、分页、归属呈现与工作区生命周期。`src/local-data/library-query.ts` 使用现有原生查询，`browser-media.ts` 保持写入恢复与按需完整验证。实现与测试均在应用私有目录，未创建新包或修改 `packages/*`。

## 验收记录

2026-10-25，Node 26.12.0，全部入口通过 `pnpm nx`、禁用 Nx Cloud；本轮未部署、未执行真实供应商生成。生产 CSR/offline-assets 构建 `36099280eb40`，46 个完整性校验公开资源；统一 Chrome E2E 使用该产物，31/31 通过，耗时约 1 分 27 秒。

| 入口与用例                                                                | 已验证结果                                                                                                                                 | 对应 AC 与边界                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [library-query.spec.ts](../../src/local-data/library-query.spec.ts)，7 项 | prompt/model 独立 AND、日期/非法输入、23/25 小时 DST 日与稳定排序/分页参数                                                                 | AC1–4；时区夹具不替代真实视口                                      |
| `aiao-media:test-browser`，22 项                                          | 真实 SQLite/IndexedDB/OPFS；新增查询、1,005 metadata、冷启动 ready 零读/只读错误和 saving 完整恢复                                         | AC1/2/4/8–11；1,005 条压力记录为 metadata，不是 1,005 张可读原图   |
| 会话/视口指令/metadata/根组件呈现专项测试                                 | 可见性去重、隐藏重进、迟到/关闭回收、查询错误/重试、末页收敛、全库未知与失败后归属保留                                                     | AC5–9；根组件真实模板呈现，存储失败通过可控流注入                  |
| `aiao-media-e2e:library-e2e`，统一 31 项                                  | 原有 28 项加[新增 3 项](../../../aiao-media-e2e/src/library.spec.ts)：50 张图片筛选/IO、末页删除/离线精确下载、同文档 Alice→Bob→Alice 切换 | AC3/5–11；生成/上传为零，Auth 和绑定服务为 fixture，无真实业务服务 |
| 应用/e2e lint、typecheck；`aiao-media:offline-assets` / `release-check`   | 零 ESLint 告警、类型检查和生产构建通过；静态审查60文件无凭据/SSR运行时/source map/旧API                                                    | 无 schema/backfill/packages 变更；不是正式发布                     |
| `aiao-media:coverage`，30 文件、294/294                                   | 272 项 unit/data + 22 项真实浏览器通过；query/directive/metadata 四项100%，预览会话各项88.63%以上                                          | 测试通过不等于全应用80%覆盖率；详见下方限制                        |

切换验收只有一份 50 张图片库：Alice 显式确认绑定后 fixture 的 ensure 请求返回 503，保留合法、未初始化的待完成绑定；再经真实 UI 退出并登录 Bob 创建同组空库，Bob 设置筛选后返回 Alice 原 50 库。每次切换重置四筛选框/页码、释放旧 URL，返回后全部 50 条任务仍有本机保存记录，URL owner 属于原 profile，`performance.timeOrigin` 不变。准备阶段仅有 1 次 fixture 工作区目录读取和 1 次失败 ensure；随后浏览/切换不新增业务请求，不启用复制、上报或上传。

冷启动不再扫描 ready 原图，不表示跳过完整性验证。显式 preview/imageInfo/backupImage 继续拒绝坏图；暂时不可读与确定 corrupt 都不改写历史保存 metadata 或删除原文件。显式备份失败不生成缺图备份，snapshot 读取失败不能被替换为空集。

检索首次验收的 Vitest 全应用基线为行 63.32% / 语句 60.99% / 函数 60.73% / 分支 56.65%，当时低于 80%。后续质量收尾沿用相同配置和排除范围，36 文件、632/632 通过（610 项 unit/data + 22 项真实浏览器），当前行 94.62% / 语句 86.64% / 函数 84.62% / 分支 80.06%，四项均达到 80%。E2E 不折算 Vitest 覆盖率；历史新模块专项结果与当前报告分别见[验收记录](../verification-report.md)。

旧[本地交付](local-delivery-verification.md)与[正式图片交付](public-delivery-verification.md)只保留各自基线；本故事没有生产部署、真实跨 origin URL、真实系统 IME、移动真机、云原图或 TTL 的新增证据。
