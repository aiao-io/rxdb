> 历史归档：2026-10-23 起首发范围由 [当前路线图](../roadmap.md) 替代。本文保留当时全媒体工程的计划与证据，不再驱动首发。

# 路线图

> 本文回答“下一步与依赖顺序”，不设置未经确认的交付日期；状态只看 [story YAML](../status-overview.md)。每个阶段按 story 验收标准关闭，不因上游 `rxdb_ai` 的完成状态自动关闭。`dependsOn` 是完整关闭的硬依赖，不阻止提前技术验证。

## 当前基线

[MEDIA-US-001](../stories/platform/MEDIA-US-001-nx-workspace.md) → MEDIA-US-002 → MEDIA-US-003 的骨架可以运行、构建和测试。工作台为三类入口、图片表单、声音/视频未开放提示；MiniMax 本地 Demo 是开发演示，不是正式生成。

[MEDIA-US-201](../stories/account/MEDIA-US-201-sessions.md) 已开工，具备 PostgreSQL 会话底座、显式账号初始化、角色 guard 与 Web 登录/退出入口。[MEDIA-US-105](../stories/generation/MEDIA-US-105-provider-management.md) 的真实管理员配置、密钥加密、CAS/事务审计与 Web 管理入口已实现；配置 API/BFF 权限在隔离 PostgreSQL 验证，浏览器为模拟响应。任务 A/B 资源所有权已在真实隔离 PostgreSQL 验证；Web 实际 SQLite/OPFS 与跨标签锁已验，24h 显式本地访问/离线壳已通过 production 浏览器测试；服务端参考图资源隔离 PostgreSQL 已验，公网部署尚未验收。正式生成：**匿名 401；已登录且来源合法但无供应商 503**。能力声明仍全 false。

## 首阶段实施选择与待定边界

| 决策         | 当前实施选择 / 仍须明确的边界                                                                                                                                                        | 影响                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 身份来源     | 首阶段单工作区、邮箱/密码、运营者预置账号、无公开注册；不透明服务端持久会话；admin/creator 取数据库                                                                                  | MEDIA-US-201、MEDIA-US-105、MEDIA-US-202、MEDIA-US-302 |
| 供应商与密钥 | 图片首批 MiniMax / OpenAI；加密/审计底座已实现；只读连接测试/受限出站已离线验；真实密钥联通、模型操作语义仍待核验；受限文本配音/视频候选 profile 已定，真实输出/费用与持久证据仍待验 | MEDIA-US-105、MEDIA-US-101～104                        |
| 任务与文件   | 已实现持久队列、幂等、单位额度预占/释放、派发意图和 24h 私有结果 TTL/清理；人工核查已实现；真实供应商及账单/结果对账待验                                                             | MEDIA-US-101、MEDIA-US-202、MEDIA-US-301/303           |
| 本地宿主     | Web 离线壳、OPFS/IndexedDB 与迁移；Electron 首阶段单应用实例/共享 host，SQLite 与文件体补偿恢复；备份显式包含文件体                                                                  | MEDIA-US-301～304                                      |
| 部署         | Node SSR + Bun API 保留；生产 TLS、Origin、Cookie/缓存、源站限制、全局入口限流必须实测                                                                                               | MEDIA-US-004、MEDIA-US-201                             |

当前选择是可执行的首阶段默认范围，不代表已交付未验证能力。其余边界可先做验证，决策与 AC 未完成前不能在能力矩阵标“可用”。

## 交付顺序与当前工作

1. **登录会话与权限底座（当前）**：[MEDIA-US-201](../stories/account/MEDIA-US-201-sessions.md) 第一阶段已实现并继续验收。先固定可信身份和管理员角色；所有权随具体端点逐一接线，story 保持 In Progress。
2. **供应商管理 + 本地存储底座**：[MEDIA-US-105](../stories/generation/MEDIA-US-105-provider-management.md) 配置管理、只读连接测试、OpenAI 文生图/单参考图编辑协议适配器和受限 POST 已实现并离线验证，继续真实密钥联通、具体实例/模型/操作核验和正式任务安全接线；[MEDIA-US-301](../stories/local-first/MEDIA-US-301-browser-persistence.md) 已接真实持久适配器及 OPFS，参考图/重开/中断/跨标签/账号隔离与 production 离线冷启动已验（API fixture）；本地 AC 通过仍受 MEDIA-US-201 关闭硬依赖约束。MEDIA-US-303 已通过 5 项 native host / 9 项 Electron 测试，覆盖原生文件、IPC/多窗口、重启/SIGKILL、整域备份和已加载窗口显式离线授权（API fixture；关闭依赖 MEDIA-US-201），不以远程 URL 代替本地文件。
3. **持久任务与本地作品闭环**：MEDIA-US-101 已实现可重启恢复的接受/消费/幂等/单位额度；人工核查已实现并经隔离测试；继续真实供应商及账单/结果对账。[MEDIA-US-202](../stories/account/MEDIA-US-202-library.md) 已接 Web 交付、保存确认与本地作品；Web 参考图、离线壳和 24h 本地访问已验；继续真实生成与桌面发行。仅在本地文件和关联记录可恢复后标“已保存”；任务完成不能提前清理仍在有效期的结果。
4. **逐一开放媒体与同步**：先 [MEDIA-US-102 图片](../stories/generation/MEDIA-US-102-image-generation.md)，再按供应商与存储能力完成 MEDIA-US-103 声音、MEDIA-US-104 视频。[MEDIA-US-302 草稿同步](../stories/local-first/MEDIA-US-302-draft-sync.md) 验收 tombstone、冲突保留和缺失本地参考图语义，不同步图片文件体或可解引用的本地文件标识。
5. **桌面发行**：MEDIA-US-304 验收无开发服务器启动、升级/失败回退、参考图/结果/关联记录与卸载数据保留边界。

**部署基础设施**：[MEDIA-US-004 Cloudflare 边缘代理与安全部署](../stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) 的测试域名、TLS、源站控制可提前并行开展，但完整 Cookie/登录缓存验收依赖 MEDIA-US-201。R2 的短期结果交付与 Queues 的任务消费在 MEDIA-US-101 中评估；接入 CDN 不代替生成或持久化验收。

### 可并行的 Web 创作体验

[MEDIA-US-106 图片提示词灵感库与一键套用](../stories/generation/MEDIA-US-106-prompt-gallery.md) 为 In Progress（Medium），只硬依赖已完成的 MEDIA-US-003。参考 YouMind 的示例/完整提示词流程，首期界面尽量参考其绿色 Hero、浅灰目录、黑框硬阴影卡片与两栏详情，使用人工维护的公共目录提供图文浏览、搜索筛选、详情、复制及 Tiptap 普通/内联参数输入，最终展开为现有 MiniMax Demo 的纯文本 prompt；不自动执行生成，不接入私有草稿持久化，不宣称新增模型可用，也不包含桌面发行验收。当前 12 条原创目录、最小 Tiptap 参数输入、9 项目录/序列化 + 3 项延迟焦点单测和 22 项浏览器验收已交付；专属 A/B/来源负例已验，仅真实 OS 中文 IME 保留。可与供应商核验并行，但不替代真实生成闭环的优先级。

## 完整关闭的跨故事依赖

| 故事               | YAML 硬依赖                                                                        | 额外决策或证据                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MEDIA-US-106       | MEDIA-US-003                                                                       | 公共内容可用依据、Web 浏览/复制/套用保护、Tiptap 参数/纯文本序列化与零自动生成请求；不依赖真实出图验收                           |
| MEDIA-US-004       | MEDIA-US-002、MEDIA-US-201                                                         | 域名、TLS、源站控制与真实登录缓存                                                                                                |
| MEDIA-US-201       | MEDIA-US-002                                                                       | 配置/任务所有权已在隔离 PostgreSQL 验证；24h 本地访问已验；服务端参考图 owner/TTL 已验，公网部署继续验证                         |
| MEDIA-US-105       | MEDIA-US-201                                                                       | 配置加密/审计、只读测试、OpenAI 与 MiniMax v2 双操作协议/受限 POST/mock 全栈已验；真实能力、可信批准/保全/恢复锚点及正式接线待验 |
| MEDIA-US-101       | MEDIA-US-201、MEDIA-US-105                                                         | 持久队列/幂等/日单位额度/24h 结果已验；人工核查/额度事务/审计已验；真实收费调用与供应商对账待验                                  |
| MEDIA-US-102       | MEDIA-US-101、MEDIA-US-105、MEDIA-US-201、MEDIA-US-202、MEDIA-US-301、MEDIA-US-303 | Web 与桌面全范围关闭前分别验收                                                                                                   |
| MEDIA-US-103 / 104 | MEDIA-US-101、MEDIA-US-201                                                         | 受限候选供应商/profile、WAV/MP4 私有存储与播放器已实现；真实输出/费用及持久证据待验                                              |
| MEDIA-US-202       | MEDIA-US-101、MEDIA-US-201、MEDIA-US-301、MEDIA-US-303                             | 本地保存确认、删除与恢复                                                                                                         |
| MEDIA-US-301       | MEDIA-US-201                                                                       | 浏览器 adapter/OPFS、参考图、离线壳/24h 政策已验；关闭受 MEDIA-US-201 约束                                                       |
| MEDIA-US-302       | MEDIA-US-201、MEDIA-US-301、MEDIA-US-303                                           | 显式元数据协议/Web/Electron 已接并验；参考图生成 AC5 与关闭硬依赖待完成                                                          |
| MEDIA-US-303       | MEDIA-US-201                                                                       | Electron host/IPC、文件后端、SIGKILL 恢复与整域备份已验；不依赖发行包完成                                                        |
| MEDIA-US-304       | MEDIA-US-303                                                                       | 内置 renderer/macOS 本地候选独立启动与同格式替换已验；原生清理/恢复已验；真实迁移/签名发行待验                                   |

草稿同步已提前技术验证：MEDIA-US-302 的独立 notebook 经真实 session/BFF/隔离 PostgreSQL 与 Electron 原生 SQLite 联通。既有主草稿不自动上传，图片字节/关联 ID 不同步；AC5 的显式采用/新参考图链路已验，仍缺真实图生图闭环，不将其写成完整交付。

### 源站准备与本地候选验收

MEDIA-US-004 已实现本地网关/缓存/Host 加固与审查用源站模板、发布/回滚手册；141 项 Web server/offline/review 单测及 production smoke 通过。状态为 In Progress，真正 DNS/TLS/Cloudflare/A-B 联调尚未开始。同步客户端最终 11 项 production Web/BFF/PostgreSQL 和 3 项 Web↔Electron 全部通过；MEDIA-US-302 AC5 的本机采用/重选已验，仍缺真实供应商闭环。

本轮已交付 MEDIA-US-102 的提交/上传/journal 设施，以及 MEDIA-US-304 的无服务内置 renderer、macOS 当前架构 ad-hoc 候选和 7 项包生命周期/清理/普通保存容量故障 smoke（历史最近基线，本次未重跑）。私有签名证据读取候选已实现（63 项隔离测试含实际 Bun），生产固定空源未改；共享纯校验器另有 14 项单测；持久证据事务账本已完成 43 项隔离 PostgreSQL 验证（原始签名、活动引用/revision/审计原子更新、并发、新 Bun 和 COMMIT 回执丢失对账）。下一步优先真实图像能力可追溯核验、可信批准与材料保全、独立锚点生产部署/鉴权/运维和正式 source 接线与 runtime 闭环；并完成公网 TLS/Edge/A-B 和历史迁移/真实升级故障/签名发行。声音已接入受限文本配音任务、WAV 私有交付、播放器/下载与本机原回执日志；实例级真实核验与费用证据仍缺失；视频已实现共享异步回执/有界 query-only 恢复、私有 MP4 及 Web 本机提交/播放/下载，仍缺真实实例输出证据，保持 In Progress。见 配音配置决策和视频交付边界；不得把合成静音或图片 fixture 当作真实音视频验收。见 [验收记录与剩余任务](../verification-report.md)。

当前 macOS 候选的原生清理入口和二次确认、备份/授权清除/停机恢复/中断拒绝已验；不是安全擦除，也不是历史版本迁移。恢复规则随包交付，见 清理与恢复说明。

### 仅有 MiniMax key 时的当前推进边界

已完成 MiniMax v2 文生图 / 单张人物参考的 8 项 API 工作流、10 项隔离 PostgreSQL 工作流和独立 7 项本地全栈浏览器（签名准入/任务/额度/私有文件/本机保存是真实应用路径，批准材料、签名者/凭据与供应商响应为 synthetic）。ordinary 95、API 1144、PG 160 和 harness 10 项最近回归已通过（其中 API/PG 本轮复跑，其余层为此前最近基线）；包含的子集不重复加算。缺 OpenAI key 不阻塞这些本地任务，本次未查看/输出已提供的 MiniMax key，也未用其调用供应商，也不取消 MEDIA-US-102 的真实双供应商 AC。

独立持久恢复锚点与显式读写门禁候选已补齐；**287 项真实双库测试**覆盖三阶段 COMMIT 未知回执、CAS/回滚、配置变更、真实旧业务备份恢复/已 prepare 拒绝及新 Bun 进程。原隔离 PostgreSQL **160 项/6 文件**本轮已复跑；70 项纯策略与 47 项无 I/O 适配器/guard/测试安全边界均计入 API，最新结果见 [验收记录](../verification-report.md)。两个数据库共享本机服务，不证明生产独立故障域/HA/灾备；未注入旧候选仍不具有恢复防回滚保证。详见 恢复 fence 协议。

后续仍须完成可信批准者/管理鉴权与观察结果认证、真实采集/材料保全、独立权威服务生产部署/权限/故障域、身份预配/人工修复/维护 fence 和正式 runtime 全体读写者接线。真实能力/使用权/费用验收另需精确实例/操作与独立的小额费用授权；公网 TLS/Edge/A-B、OS 中文 IME、历史迁移与桌面签名发行也须真实环境证据。没有把 mock 或本地持久候选通过记为全部任务完成；生产图片/配音/视频 source 仍固定为空，详见 [验收记录](../verification-report.md)。

本地后续已补齐 独立凭据与可信业务观察管理候选：批准/撤销使用限定库/实例/操作的独立凭据，actor 不由请求声明；只读检查与显式结果核对不重放业务，真实双库管理 COMMIT 未知和旧备份恢复负例已验。本轮继续补齐配置编辑/轮换/删除凭据/停用/归档的专属 config-* 权限、原 operationId/完整配置审计指纹、同事务不可变 journal 及可信当前观察/显式 finalize。新增 78 项单测已计入 API 1868 项/51 文件；新增 32 项配置双库用例及 6 项 SQL 摘要边界计入 195 项双库总数，不重复加算。业务 journal/authority 摘要约束仍是隔离测试显式安装的候选 schema，没有生产自动 migration/升级。仍缺初始身份与人工修复、全局维护 fence、管理传输/生产权限和正式 runtime 接线；不得概括为“只缺 key”。

受控初始 closed 预配的本地协调候选已补齐，见 初始化协议：独立 provision/provision-inspect grant 不继承证据/配置权限，显式当前 revision 与固定逻辑身份，健康业务上下文核对后至多一次创建；unknown 仅按原 ID 只读确认，不写业务库、不学习 active、不重置既有 scope。66 项单测与新增 22 项双库用例分别计入 API 1868 项/51 文件及双库 317 项总数。它消费预配身份，仍缺生产身份签发/登记/保管/撤销与初始化运维、人工修复、维护 fence 和正式 runtime 接线。

同日补齐 持久维护屏障与在途准入候选：独立数据库级权限、单向关闭、新准入与入维护行锁串行化、开始/完成不可变记录和可信 callback 包装器；未知结果/断连接不能作为已排空证明。57 项单测和 28 项双库用例分别计入 1400/135，总数内不重复加算。仍须将所有生产 API/BFF/worker/直接读写/执行生命周期绑定该入口、保证 callback 全部工作结束才 settled，并完成未知准入可信修复、恢复/重新开放和独立部署/权限/运维；不是全局生产维护 fence 已验收。

管理维护接线已覆盖显式构造的证据批准/撤销、配置编辑/归档、初始预配及各自 inspect/finalize/confirm 全流程，先鉴权再准入，actor/kind/原 ID 由服务端固定。58 项新增单测与 41 项真实双库分别计入 API 1868 项/51 文件和独立双库 317 项；此前 1400/135 是上一子阶段。仍缺默认 runtime/公开路由/直接存储与 sources/生成 worker/外部生命周期接线、未知准入可信修复、受控恢复/重新开放与真实生产运维验收。

同日 底层维护证明与任务登记新增 23 项单测/19 项真实双库：保护配置/证据 stores 及媒体 read，私有 context 精确绑定同 executor/provider/actor/原 ID/kind；结束后证明撤销，上层忘记 await 已开始 SQL 也不提前结算，未知子任务不因父 settled 而清除。最新 API 1868 项/51 文件、双库 317 项，旧 1458/176 为上一阶段；全局 runtime/worker/外部生命周期、未知修复/恢复/运维仍待完成。

2026-10-04 CST：继续完成 同步生成 worker 的显式维护准入。入口/租约 preflight/原 job 同步执行三阶段覆盖 image/audio 与结果 cleanup；独立原执行记录在 preflight 前阻断旧队列恢复，未知回执/供应商/文件结果保持 held、不重派/误退款。真实队列/文件/额度与实际 COMMIT/单语句事务丢回执、旧业务 dump/restore 的结果见 [验收记录](../verification-report.md)。参考图、身份/可变输入与 stop/drain 有单测；受保护视频刻意拒绝 create/poll，视频跨轮询和全部公开/default runtime/运维接线仍缺。三空 source、3 Done / 13 In Progress 与 122 条 AC 状态不变，不宣称完成全部产品任务。

2026-10-04 CST：新增 视频持久交接与继续准入基础。独立 original root/digest/deadline/epoch 不随业务旧恢复重建；已知 receipt 交接而不完成，closing 可续已登记阶段，unknown/期限不自动解锁，终态 metadata 原子结算。仅协议/受控 synthetic callback 候选；GenerationWorker 的视频领取/receipt 核对/query/download/文件与业务结算 handler 仍未接，默认/公开 runtime 不启用。3 Done / 13 In Progress、122 条 AC 和三空 source 不变，最新独立分层结果见 [验收记录](../verification-report.md)。

2026-10-04 CST：实际视频 worker 显式生命周期已接入原 ticket target-claim/request+receipt+deadline 核对、known 交接/续阶段/MP4+文件+业务结算/terminal。not-due/unknown/旧恢复不派发或自动退款；stop/drain/closing/新 Bun worker 和真实隔离数据库验证见 [验收记录](../verification-report.md)。双重服务端 opt-in 才启用，默认/main/runtime/三空 source 不变，mock/32×18 不能当真实 supplier/profile/账单证明；全体生产接线、未知修复/受控恢复/运维和真实授权原始材料仍待验，3 Done / 13 In Progress、122 条 AC 不变。

2026-10-04 CST：新增 任务只读 ingress，固定 server binding 在 session/owner/role/file 前取得维护准入，用户/管理员 GET/HEAD 只在完整字节准备后 completed。explicit read-only mode 的 unsafe mutation/catalog 暂拒绝，不 fall back；unknown/abort/期限不自动排空，default/main/其它域仍未全体接入。真实 HTTP/PG/session/files 的准确分层结果见 [验收记录](../verification-report.md)，无 production migration/环境解锁/真实收费，三空 source 与 3 Done / 13 In Progress、122 条 AC 不变。

2026-10-05 CST：继续补齐 目录/能力查询的单独维护 opt-in，四类规范 GET/HEAD 与实际 guarded config/evidence/anchor/auth/HTTP 已验；编码别名或 HTTP 自报不能借 task proof，unknown/nullable 回应不假装无模型。仍不调用供应商、不解密凭据，默认/main/三空 source 不变。下一步的写入口不能复用新 read nonce：应按原 job/idempotency/业务 operation 完成持久去重、回执未知/旧恢复以及取消/保存确认/对账/文件补偿闭环，然后才补全生产接线与受控恢复运维。

2026-10-05 CST：queued cancellation 原操作准入另需 cancelQueued:true 与同 executor/DB 的保护 job store。ingress 在实际 session/body/owner 前准入，原 jobId/真实 owner 的 cancel intent 与 image/audio/video paid execution 互斥；真实 SQL/quota、COMMIT 未知、旧 business/session/quota restore 和新 Bun HTTP 验证不作为供应商证据。post-intent 状态竞争/abort/unknown 保留隔离，不假装取消/费用退款、不自动重派。其它写者与 default/main/三空 source、故事/AC 不变；完整修复/恢复和生产接线仍缺。

2026-10-05 CST：保存声明与原结果清理准入另需 acknowledgeSaved:true 与同 executor/DB 的保护 job/result stores。原 jobId 与冻结结果 pin 防重放，mark→私有 quarantine/身份/hash核对→delete→引用清除→completion 不吞 unknown；旧 business/session/file restore 不重新删除或派发。saved:true 只是客户端声明，不证明本地副本，不退 consumed quota/实际费用；未放开提交/对账、default/main/三空 source 与故事/AC不变，可信修复/补偿/生产接线仍缺。

2026-10-05 CST：[主创作区本机优先优化](../stories/local-first/local-first-studio.md)把已验证/解锁账号的主 promptState 接入 @aiao/rxdb 原子 snapshot、公开 Repository 活查询与 300 ms 防抖保存，正文/模板/未填写字段刷新恢复；dirty 跨窗口保留输入并明确 CAS 处理。匿名公共图库不读写私有数据；保存不生成/上传/同步/ACK，不把 Demo Blob 当作品。旧显式/同步草稿与文件不替换，锁定/切账号/迟到结果清 UI，真实 IME 与生产生成仍待验；统一音视频本机文件另见后续说明。

2026-10-05 CST：音视频本机文件闭环新增 additive 作品记录与实际 WAV/MP4 文件，保存后回读校验、账号锁内验证再 ACK；刷新/过期后仍可本机播放下载，失败回执不丢本地副本，写入/删除中断可恢复。公开 Repository 活查询与窄跨窗口提示不在每次主编辑器保存时扫描大媒体文件；授权离线与桌面原生重启另验。生产三空证据源、收费门禁、无跨设备文件同步与故事/AC 状态不变。
