# 平台积分生图服务端接线（2026-11-13）

关联 [MEDIA-US-109](../stories/generation/MEDIA-US-109-relay-durable-task.md)、[MEDIA-US-108](../stories/generation/MEDIA-US-108-platform-generation.md) 与 [MEDIA-US-206](../stories/account/MEDIA-US-206-credit-admin.md)。本记录接续[积分账本交付](credits-delivery-20261113.md)，记录服务端、前端与本地验收成果；故事保持 In Progress，正式海外与国内验收尚未完成。

## 已实现

- `PUT /api/relay/tasks/:id` 必须通过真实平台会话与账号状态校验，只接收平台模型标识、提示词、单张参数和设备任务令牌。供应商型号、允许列表和模型凭据仅在服务端解析。
- `/api/models` 仅返回平台 ID、展示名称、积分数与响应协议；配置不可读或凭据缺失返回 503。后台发布的供应商启停、型号和画幅策略继续约束接单。
- 持久任务先保存预占意图与看门狗，再访问 PostgreSQL 账本，确认预占后才调用一次上游。并发接单、确认、释放、删除、alarm 串行执行；状态长轮询不占用这条执行队列。
- 原始响应仍只做有界读取与 AES-GCM 加密，不在服务端解析或转码。2xx 响应仅记为 received 并继续预占；本机解密验证图片后 POST `/confirm` 才扣一次。验证失败 POST `/discard` 释放，不自动重发生成。
- 新迁移 013 的 `media_abort_credits` 可以在迟到预占之前建立释放墓碑，按任务锁与预占串行，不能回滚已扣积分。未接单的放弃同时在任务存储封存标识。
- 预占应答丢失、上游拒绝、5xx、断连或实例重置不能触发第二次生成。预占期间重置会释放迟到预占；密文已写入时由看门狗恢复 received；扣费应答丢失可幂等确认。
- 释放失败保留结算意图并由 alarm 重试。24 小时清理前必须先确认账本终态；账本故障时保留任务与密文，恢复后再清理。
- SQLite 旧任务只增加账号、额度、积分状态列，可继续取回和删除，不追溯扣费。国内 Node 启动恢复 alarm 前已接入安装配置与账本凭据，开发替身使用同一套 Worker 和状态机。
- 按请求 Key 的无状态 `/api/relay` 已删除并返回 404；OpenAPI 增加模型目录、确认与释放，移除用户供应商头与 Key。新项目 SQL 包包含 013，现有项目积分升级包在一个事务里执行 012 与 013。
- 开发环境只把模型配置及引用的凭据写入私有临时 `.dev.vars`，不改源文件、不写浏览器配置，也不复制无关密钥。Node 从服务端环境读取相同定义。

## 本地验证

- `aiao-media-api:relay-coverage`：59 项通过；本批五个接线模块合计行覆盖 99.83%、分支 92.23%、函数 98.65%，三项均超过 80%。覆盖真实 Worker + SQLite DO/R2 替身、国内磁盘运行时与 HTTP 桥接；不代表 Cloudflare 上已验收。
- `aiao-media-api:script-test`、`typecheck`、`lint` 与 OpenAPI `test` 已通过。国内运行时的测试已加入常规 `script-test`，避免只存在于单独入口。
- `aiao-media:credits-local-test`：真实本地 Supabase Auth/PostgreSQL 通过。八路并发发放幂等、八路预占防双花、八路结算只扣一次、失败释放、RLS、流水不可修改/删除、先放弃再迟到预占封存均通过；临时账号已清理。

- 本批 `run-many -t lint typecheck script-test release-check requirements-check build-node -p aiao-media aiao-media-api --parallel=1 --nxBail` 共 43 个任务通过；用户端脚本 33 项通过，发布检查 69 个文件，Node 服务端产物可构建。需求检查为 20 个故事、830 条链接、77 个锚点、零错误。随后复验积分升级产物只含一个事务且包含预占与放弃 RPC，通过。`aiao-media-api:deploy-check` 的 Wrangler dry-run 通过，列出 RelayTask 与 R2 绑定；未发布到真实账号。

## 前端与浏览器验收

2026-11-13 完成前端接线：公开模型目录、平台会话接单、登录与余额不足门禁、本人积分流水、图片验证后的确认扣费，以及失败释放。用户端供应商、Key、直连与策略入口已移除，旧本机公开配置与备份继续兼容。任务令牌只存设备，备份与同步不携带账号会话或令牌。

确认应答不明时保留原任务供幂等续接；本机保存失败仍保留可下载结果和服务端密文，刷新后取回同一任务。成功保存后才删除服务端结果与设备令牌。账号变化和双标签页仍受工作区生成锁约束。

| Nx 入口 | 本地证据 |
| --- | --- |
| `aiao-media:coverage --args='--maxWorkers=2'` | 817 项通过；语句 88.96%、分支 82.68%、函数 92.12%、行 93.02% |
| `run-many -t lint typecheck test -p aiao-media aiao-media-api aiao-media-e2e --parallel=1 --nxBail` | 33 个任务通过，21 个缓存命中；含服务端脚本、需求门禁与应用测试 |
| `aiao-media-e2e:local-first-e2e` | 57/57 通过；含平台登录、零积分、成功结算与流水、HTTP 401/502、损坏图片释放、关页续接、三画幅、双标签页与保存失败恢复 |
| `aiao-media-e2e:provider-acceptance-fixture` | OpenAI PNG 与 MiniMax JPEG 各三画幅；已登录与表单登录；每项单次 PUT、模型积分与单条流水、刷新后的原字节下载一致 |
| `aiao-media-e2e:provider-acceptance-check` | 27 项通过；平台选择、公开模型参数、尝试身份、进程锁、未知记录阻断与响应捕获 |
| `aiao-media-e2e:platform-account-update-fixture` | 旧 Service Worker 与 null 配置缓存仍在时，新 HTML 正确取得内容指纹配置；激活后离线原图、草稿与账号表单保留；远程请求 0 |
| `aiao-media-e2e:public-origin-smoke-fixture`、`actual-release-update-check` | 本地公开四路由/完整性/离线烟测与更新控制器检查通过；不作为正式发布或真实 A→B→A 更新证据 |

平台验收 fixture 复用 `setupPlatform` 与 `taskFixture`，不修改构建后配置文件；外链原图请求无 Authorization、Cookie、Referer。产物摘要变化、错误尺寸、模型业务错误与未知尝试均停止，复跑不产生第二次生成。该 fixture 验证验收程序与应用集成；真实 Worker/SQLite DO/R2 由服务端套件覆盖，两层都不能替代正式 Cloudflare 验收。

## 继续任务

1. 正式 Cloudflare 与国内分别部署、应用 012/013 升级、发放积分并生成，核对真实模型、积分流水和精确下载。
2. 在正式 Cloudflare 验证长任务、断开/刷新与结果恢复，确认私有 R2 与 1 天生命周期规则；完成桌面安装版及公众邮箱证据。
3. 使用正式 A/B 产物验证更新与回退；旧版公开配置从备份核对，不能恢复旧供应商编辑入口作为验收手段。
4. 整轮完成后运行仓库级 `NX_NO_CLOUD=true pnpm test-all`，按失败任务串行复核；当前产品检查不代替最终门禁。
