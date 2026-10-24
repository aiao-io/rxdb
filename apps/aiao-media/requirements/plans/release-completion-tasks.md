# 正式验收收尾清单

当前分支 PR：[154](https://github.com/aiao-io/rxdb/pull/154)。本地实现及 82 个项目、344 个 affected 任务的结果见[本地产品交付验收](local-delivery-verification.md)。本页只记录当前剩余工作，不把准备完成或本地模拟记为正式通过。

## 已作出的关键决策

- [x] D-04：桌面首发，移动真机继续暂缓，保留 MEDIA-US-107 的三个 AC。
- [x] D-05：独立本机副本、显式绑定、账号隔离；登录不上传，退出保留本机数据。
- [x] D-06：无限期保留冲突原始双方、tombstone 和同步日志，不启用 TTL/自动 GC，不重置远程序列；显式重扫仅重置拉取水位，保留 outbox、业务 revision、推送确认水位和本机内容。
- [x] D-07：只承诺已验 0.0.26 基线升级；未验证历史库不承诺自动迁移；未知/更高 schema marker 拒绝访问并保留原库。回退只选认识 schema marker 且通过同库验证的构建，客户端数据库不降级。
- [x] D-08：本机模式独立可用，正式账号/同步/后台使用独立产品 Supabase 项目，经迁移与权限复验后启用；不自动创建项目或升级计划。现有共享项目必须先提取、评审按对象收口的 SQL，不能复用本地初始化。

完整定义见[决策与执行条件](../decisions.md)。

## 当前输入条件

2026-10-24 的复核确认：

- [x] Cloudflare 官方登录已恢复；当前构建已发布，version `deaaa727-7f52-4da2-9da5-fe33088cd244`，返回 `media.aiao.io (custom domain)`。仍缺 DNS 传播、四路由/WASM/CSP/离线清单公网 smoke、Worker secrets 和 Free 计划账单核验。
- [ ] 正式域名与证书；`media.aiao.io` 的 A/AAAA 当前 ENOTFOUND。旧 workers.dev DNS 存在，但本机 HTTP 超时，不能据此判断线上停机。
- [ ] 私有供应商配置：`AIAO_IMAGE_BASE_URL`、`AIAO_IMAGE_API_KEY`、`AIAO_IMAGE_MODEL`。进程、当前应用和源仓 `.env` 均未配置约定字段；不要在聊天、报告、截图或 shell 参数粘贴 Key。
- [ ] 正式 Supabase 项目、公开 URL/anon key、Worker 服务端配置与首管理员 Auth UUID；当前仅有本机服务配置，生产迁移包已准备但未执行，不能将回环 URL 发布为正式服务。
- [ ] 解锁 Mac，使用真实 OS 中文输入法；原生自动化当前报告锁屏，不能以粘贴中文或合成 composition 事件代替。

## 验收顺序

| 工作                  | 对应 AC                              | 关闭条件                                                                                                                                         |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ 已验：显式重新扫描 | MEDIA-US-302 AC5                     | 真实本地服务重放旧日志，保留未确认修改和删除冲突；重复扫描不复活、不增业务 revision                                                              |
| 正式部署              | MEDIA-US-004 AC1/2                   | 已保存 version/deployment 回执；待 DNS 传播后完成四路由/WASM/CSP、免费计划、精确代理策略与公网 smoke，当前不把 1010/未解析当通过                 |
| 正式图片交付          | MEDIA-US-102 AC7、105 AC6/7、202 AC7 | 正式 origin 直连/主动代理、三画幅逐项出图；PNG 尺寸/字节摘要、刷新回读和下载一致，跨 origin 原图请求不携带供应商 Key；不确定请求停止且不自动重发 |
| 正式离线更新/回退     | MEDIA-US-004 AC3/4                   | 当前 origin 完成离线安装；真实更新等待旧页面关闭，兼容版本回退后草稿/配置/原图仍在，未知/更高 schema marker 阻止访问且不清库                     |
| 桌面输入法            | MEDIA-US-106 AC7                     | 真实系统中文 IME 在正文和字段输入、粘贴、撤销重做，不丢字、不抢焦点、无溢出                                                                      |
| 正式账号/后台         | MEDIA-US-201、203 的部署边界         | 正式 Auth 邮件与密码登录、A/B 隔离、双副本恢复；普通用户拒绝管理、管理员撤权、模板/策略版本生效与上报来源分别留证                                |

移动真机不进入这次桌面发布，未验项保持原状态。全部故事合入后才按需求约定更新 Done，不通过修改状态制造完成。

## 真实供应商自动验收入口

入口位于 e2e 项目，应用不反向依赖 e2e。先运行本地 fixture：

```sh
NX_NO_CLOUD=true pnpm nx run aiao-media-e2e:provider-acceptance-fixture --skipRemoteCache
```

正式验收由 `aiao-media-e2e:provider-acceptance` 执行，必须显式设置以下非敏感参数，并在进程或应用私有 `.env` 提供供应商三字段：

| 参数                                    | 取值                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `AIAO_MEDIA_ACCEPTANCE_GENERATE`        | `1`，允许本轮真实生成；普通 CI 不设置                                               |
| `AIAO_MEDIA_ACCEPTANCE_ORIGIN`          | 固定 `https://media.aiao.io`                                                        |
| `AIAO_MEDIA_ACCEPTANCE_RELEASE`         | 实际 Cloudflare 发布回执的 version UUID                                             |
| `AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256` | 已审核发布产物 `offline-manifest.json` 的 SHA-256；不是临时从未知线上内容接受的摘要 |

脚本在发请求和复用证据前核对线上 manifest 与预期摘要，不匹配即停止。直连/代理 × 正方形/横向/纵向依次执行，各项只允许一次生成请求；返回 PNG 尺寸须精确匹配请求。使用实际产品界面保存、刷新、回读与下载，比较 SHA-256 和精确文件字节；结果 URL 请求检查无 Authorization、Cookie 或 Referer。

每项发送前在忽略的 `apps/aiao-media-e2e/tmp/provider-acceptance/live` 创建独占尝试文件（0600），按 origin、发布产物、供应商/模型、通道与画幅确定身份。只复用同产物已完成证据，任何未完成或不确定尝试均停止，不能通过轮换 Key 绕过。不启用截图、trace、视频或 Playwright 调试日志；报告只保留摘要、合法数值和固定枚举，不保存 Key 或完整供应商响应。Base64 结果不伪造跨 origin 原图读取证据，该边界仍须 URL 结果实证。

## 正式账号服务的运维边界

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
