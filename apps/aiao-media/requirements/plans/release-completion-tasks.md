# 正式验收收尾清单

图片首发交付关联 PR：[154](https://github.com/aiao-io/rxdb/pull/154)。本地实现及 82 个项目、344 个 affected 任务的结果见[本地产品交付验收](local-delivery-verification.md)。本页记录该交付范围的进度、剩余真实验收和后续边界；新增 [MEDIA-US-204 本地检索/视口预览](library-search-tasks.md)已独立完成分层本地验收，待 PR 评审、未部署，不以旧数字替代新证据。

## 本轮任务核对（2026-10-25）

[本地交付清单](local-delivery-tasks.md) 17/17、[作品检索清单](library-search-tasks.md) 10/10 均已完成。12 条故事共 79 条 AC，73 条已通过；004、201、202、203、204、301、302 的全部 AC 已验，按用户本次指令及 D-11 记为 Done，PR 评审与合并单独跟踪。102、105 各保留一条真实验收并记为 Blocked，106 保留一条跳过的真实桌面 IME 验收，107 保留三个暂缓 AC，逐项关闭条件见[状态概览](../status-overview.md#未完成验收与关闭条件)。

用户已推送，PR #154 远程 head 为 `7651e58e`，仍为草稿、未合并；核对时该 head 的 CI 正在运行。本地当前源码的复验结果单独记录于[验收记录](../verification-report.md)。

供应商补验的只读复核、缺失日志和外部输入见[补验记录](provider-acceptance-follow-up.md)，本轮新增生成请求为 0。

## 已作出的关键决策

- [x] D-04：桌面首发，移动真机继续暂缓，保留 MEDIA-US-107 的三个 AC。
- [x] D-05：独立本机副本、显式绑定、账号隔离；登录不上传，退出保留本机数据。
- [x] D-06：无限期保留冲突原始双方、tombstone 和同步日志，不启用 TTL/自动 GC，不重置远程序列；显式重扫仅重置拉取水位，保留 outbox、业务 revision、推送确认水位和本机内容。
- [x] D-07：只承诺已验 0.0.26 基线升级；未验证历史库不承诺自动迁移；未知/更高 schema marker 拒绝访问并保留原库。回退只选认识 schema marker 且通过同库验证的构建，客户端数据库不降级。
- [x] D-08：2026-10-25 用户再确认 Supabase 本轮仅本地；生产账号/同步/后台未部署，不列为本轮输入条件。正式静态产物保持关闭公开账号配置；未来生产启用仍需独立项目或先评审按对象收口的迁移，不自动创建项目或升级计划。
- [x] D-09：真实桌面中文 IME 本轮跳过、保持未验，MEDIA-US-106 AC7 保持 ⚠️；不以自动化输入改成通过。移动真机三个 AC 继续暂缓。

完整定义见[决策与执行条件](../decisions.md)。

## 当前输入条件

2026-10-25 的输入与公网复核：

- [x] 2026-10-25 正式 B version `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`、46 资源/账号 `null`/allowlist 1 项。原始生成验收 deployment `12606e16-5ba7-44e5-ba8f-0c7081821544`；官方真实切换验收后恢复 B，当前 deployment `aac93845-7add-4fd3-b45a-d37dfc5d1319`，API 确认 100% B 流量。身份、摘要与时间见[正式交付验收](public-delivery-verification.md)。
- [x] 正式 DNS/域名可访问，四路由/WASM HTTP 200，响应 CSP 已核对，线上离线清单资源 46/46 与审核摘要匹配。旧 ENOTFOUND、403/1010 均为历史观察，1010 归因未定，不再列为当前阻断。
- [x] 私有供应商配置、模型目录 GET 200/配置模型存在、OPTIONS 403 已留证。显式代理三画幅各一次 HTTP 200、PNG 精确尺寸与刷新回读/下载字节一致；直连正方形无响应、保持未知，另两幅直连未尝试。
- [x] 正式官方 A→B→A 实际产物更新/回退、waiting/旧 DOM/关闭旧页/activated/新入口顺序，以及各阶段真断网四路由已通过；完整测试供应商配置与空 Key、草稿、导入 fixture 原图精确下载和 profile/schema `1` 保持，0 生成。最终官方恢复 B，随后 public smoke 再通过；未在线注入更高 marker，兼容拒写引用本地守卫。
- [x] Cloudflare 控制台确认 Workers 当前免费套餐 US$0、活动 Workers Free 订阅；账户另有既有订阅，不称全账户免费或零账单。

Supabase 本轮仅本地，生产项目与管理员凭据不作为当前待提供输入。真实桌面 IME 按用户决定本轮跳过、保持未验，不再安排解锁后继续；移动真机三个 AC 保留暂缓。

## 验收顺序

| 工作                   | 对应 AC                      | 关闭条件                                                                                                                |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ✅ 已验：显式重新扫描  | MEDIA-US-302 AC5             | 真实本地服务重放旧日志，保留未确认修改和删除冲突；重复扫描不复活、不增业务 revision                                     |
| ✅ 正式部署已验        | MEDIA-US-004 AC1/2           | 当前回执/最终100% B、四路由/WASM/CSP/旧API404、allowlist1/实际代理和运行边界测试、Workers Free范围均已记录              |
| ✅ 已验：代理 PNG 交付 | MEDIA-US-105 AC6、202 AC7    | 三画幅各一次 HTTP 200，尺寸/字节/SHA、保存/刷新回读/精确下载一致；直连限制与未知独立记录                                |
| 分通道生成仍有保留     | MEDIA-US-102 AC7             | 代理部分已验，直连正方形未知未重发，横向/纵向未尝试；整项保持原条件与 ⚠️，不重发未知请求                                |
| 真实 URL 原图读取      | MEDIA-US-105 AC7             | 三个已成功结果均为 base64，仍需真实跨 origin URL 结果无 Authorization/Cookie/Referer 且可精确下载的证据                 |
| ✅ 正式离线更新/回退   | MEDIA-US-004 AC3/4           | 官方真实A→B→A及waiting/关闭旧页/activated；每阶段真断网四路由、完整配置/草稿/导入fixture原图精确下载保持，最终B恢复     |
| 本轮跳过：桌面输入法   | MEDIA-US-106 AC7             | 用户决定本轮不执行，保持 ⚠️、未验；不以粘贴中文、合成 composition 或视口模拟代替系统 IME                                |
| 后续：正式账号/后台    | MEDIA-US-201、203 的部署边界 | Supabase 本轮仅本地，生产尚未部署；后续启用时另验真实 Auth、A/B 与双副本隔离、管理授权、模板/策略运行版本及任务上报来源 |

移动真机不进入这次桌面发布，MEDIA-US-107 三个 AC 保持未验。跳过、暂缓、本地通过和生产通过分别记录；故事仍按 YAML 与 AC 更新，不通过修改状态制造完成。

## 真实供应商自动验收入口

入口位于 e2e 项目，应用不反向依赖 e2e。先运行本地 fixture：

```sh
NX_NO_CLOUD=true pnpm nx run aiao-media-e2e:provider-acceptance-fixture --skipRemoteCache
```

正式验收由 `aiao-media-e2e:provider-acceptance` 执行，必须显式设置以下非敏感参数，并在进程或应用私有 `.env` 提供供应商三字段：

| 参数                                    | 取值                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AIAO_MEDIA_ACCEPTANCE_GENERATE`        | `1`，允许本轮真实生成；普通 CI 不设置                                                          |
| `AIAO_MEDIA_ACCEPTANCE_ORIGIN`          | 固定 `https://media.aiao.io`                                                                   |
| `AIAO_MEDIA_ACCEPTANCE_RELEASE`         | 实际 Cloudflare 发布回执的 version UUID                                                        |
| `AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256` | 已审核发布产物 `offline-manifest.json` 的 SHA-256；不是临时从未知线上内容接受的摘要            |
| `AIAO_MEDIA_ACCEPTANCE_MODES`           | 可选：`direct`、`proxy` 的逗号子集；未设置时为 `direct,proxy`；空、非法或重复值拒绝            |
| `AIAO_MEDIA_ACCEPTANCE_ASPECTS`         | 可选：`square`、`landscape`、`portrait` 的逗号子集；未设置时为全部三画幅；空、非法或重复值拒绝 |

脚本在发请求和复用证据前核对线上 manifest 与预期摘要，不匹配即停止。默认执行直连/代理 × 正方形/横向/纵向六项；显式模式/画幅参数仅筛选计划，不改变尝试身份。输出 `planned`、`complete` 或 `stopped`、所选范围、计划数和成功数；子集通过只覆盖所选项，不能称六项全部通过。

各项只允许一次生成请求，返回 PNG 尺寸须精确匹配请求。使用实际产品界面保存、刷新、回读与下载，比较 SHA-256 和精确文件字节；结果 URL 请求检查无 Authorization、Cookie 或 Referer。当前正式证据已覆盖代理三画幅，direct 正方形无 HTTP 回执而保留未知，另外两幅未试；OPTIONS 403 只作为该次预检限制，不能据此断言上游未处理或零计费。

每项发送前在忽略的 `apps/aiao-media-e2e/tmp/provider-acceptance/live` 创建独占尝试文件（0600），按 origin、发布产物、供应商/模型、通道与画幅确定身份。只复用同产物已完成证据，选中的任何未完成或不确定尝试均停止，不自动继续或重发，不删除/覆盖未知记录，也不能通过轮换 Key 绕过。独立未尝试组合可显式另选，已完成项复用不增加生成请求。

不启用截图、trace、视频或 Playwright 调试日志；报告只保留摘要、合法数值和固定枚举，不保存 Key 或完整供应商响应。Base64 结果不伪造跨 origin 原图读取证据，该边界仍须 URL 结果实证。

本轮生产 Nx 构建/审查/部署必须同时使用 `NX_LOAD_DOT_ENV_FILES=false AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY=''`，并复核产物公开账号配置为 `null`；仅两个空值不足以阻止 Nx 展开私有 `.env` 的公网值。完整命令、发布身份、4 个生成 journal、正式浏览器 JSON 和本地 API 复验见[正式交付验收](public-delivery-verification.md)。

## 后续正式账号服务的运维边界

以下保留未来启用生产 Supabase 的条件；本轮仅本地，当前未执行这些生产步骤，也不据此要求提供生产项目或管理员凭据。

1. 核验已有 Cloudflare 账户、`aiao-media` Worker、`aiao.io` active zone、正式域名现存记录与选定的独立 Supabase 项目。保留当前 Worker version/deployment、静态摘要、Auth 配置与数据库备份，不覆盖未知 CNAME。
2. 使用 `aiao-media:production-bundle` 生成的 9 源 SQL 包，仅对经核验的独立空产品项目审查初始化事务。包内保留每个源文件 SHA-256，排除 `001-local-account-checks.sql`；首个事务 guard 会拒绝 public 非扩展关系、既有 `media_`/`rxdb_` 对象和相关函数。本地 `supabase-migrate` 不能换 URL 后用于生产。
3. core `01-rxdb-system-tables.sql` 含全 public 授权、关闭 RLS、历史日志改写/去重；应用 003 改变全局 RxDB 分支函数与权限。这些操作不能直接投向已有数据或共享项目；必须先提取按对象收口的 SQL 并评审。不同文件自带事务边界，不能不经整理直接拼接成所谓单事务。
4. 复验所有产品表 RLS、匿名/A/B 的私有数据隔离、变更日志隔离、普通用户管理 RPC 拒绝，以及 `rxdb_change` 的 Realtime publication。SQL 执行成功不代表权限矩阵通过。
5. Auth Site URL 设为 `https://media.aiao.io`，仅允许精确正式返回地址。当前是邮箱密码流程，邮箱确认后回站点再登录；没有 `/auth/callback`，不声明 OAuth/PKCE 已实现。真实邮件投递必须验收。
6. 核验首管理员存在于该项目 `auth.users`、已验证且未被封禁，通过可信 SQL Editor 或受保护数据库会话调用 `media_trusted_membership`。使用目标 UUID、当前成员 revision（不存在才为 0）及固定操作 UUID；超时沿用相同操作 ID 核对结果。现有 `admin-membership` target 强制本地，不能用于生产；部署账号不自动获得产品管理权。
7. 浏览器构建设置 `AIAO_SUPABASE_URL`、`AIAO_SUPABASE_ANON_KEY`；GitHub 手动发布 workflow 已映射同名公开 vars。Worker 的 `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY` 全部使用 secrets，指向同一项目。`deploy/.dev.vars` 不会自动上传。普通远程 vars 未列入配置会被后续部署删除；secrets 保留。首轮使用已验证的 legacy anon/service_role JWT，新 Key 格式另验。
8. 服务端配置以 0600、Git 忽略的私密 JSON 经 Wrangler `secret bulk` 接入，不把值写入 shell 参数或日志。然后执行 `aiao-media:deploy-check`，核对公开配置与 Supabase 精确 CSP、无服务端 Key，最后 `aiao-media:deploy` 并保存真实回执。
9. 正式服务按本页验收表收口。服务端 schema 采用前向修复，前端回退不自动删除表、冲突、tombstone、SQLite 或 OPFS；数据库恢复单独作为灾备操作处理。

源码依据：[生产迁移包脚本](../../scripts/build-production-supabase-bundle.mjs)、[本地迁移入口](../../scripts/supabase-local.mjs)、[可信管理员入口](../../scripts/admin-membership.mjs)、[Worker 后端请求](../../deploy/product-http.mjs)、[公开配置/CSP 构建](../../scripts/build-supabase-config.mjs)、[发布脚本](../../scripts/deploy-local-first.mjs)。
