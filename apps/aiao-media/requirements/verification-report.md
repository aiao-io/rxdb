# 验收记录与剩余任务

> 状态唯一真相源为 story YAML；此记录区分模拟供应商、真实本地服务和正式环境。当前 **1 Done / 9 In Progress / 1 Backlog，共 11 条**。

同仓迁入后的复验与旧构建升级证据见[RxDB 迁入验收](plans/rxdb-import-verification.md)。以下保留各产品 AC 的证据边界。

## 当前本地基线

| 入口                                                      | 当前结果                                                                                      | 证据边界                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `aiao-media:offline-assets`                               | 生产 CSR 构建通过，初始包低于 500 kB 预算                                                     | 无 SSR server bundle；包括公开账号配置和版本化离线资源                                |
| `lint` / `typecheck` / `test`                             | contracts、local-data、web 的检查和单元测试通过；web-e2e 类型/lint 与 supabase 脚本 lint 通过 | 本机状态机、契约、提示词与账号会话测试                                                |
| `aiao-media-e2e:local-first-e2e`                          | 28/28 通过：本机图片、本地可靠性与账号 fixture                                                | 真实 Chrome/RxDB/WASM/IndexedDB/OPFS/Service Worker；供应商和该套件 Auth 使用 fixture |
| `aiao-media:supabase-e2e` / `aiao-media-e2e:supabase-e2e` | 3 项真实本地账号浏览器场景通过                                                                | 生产静态应用、真实 Auth 和本地邮箱；断网场景只注入网络失败，不伪造成功响应            |
| `aiao-media:supabase-test`                                | 通过：真实 Auth、RLS、Realtime、刷新/退出探针                                                 | 此入口仅覆盖开发探针；产品业务表另由 product-test/product-e2e 验证                    |
| `aiao-media:relay-test`                                   | 4 项代理边界测试通过                                                                          | 同源/允许列表/参数限制、按请求凭据、无缓存、敏感错误清理与无自动重试                  |
| `aiao-media:auth-config-test`                             | 公开配置与精确回环 CSP 校验通过                                                               | 禁止服务端 Key、非回环 HTTP 和任意 HTTP 放行                                          |
| `aiao-media:release-check` / `aiao-media:deploy-check`    | 产物审查与 Wrangler dry-run                                                                   | 产物无凭据/SSR/source map/旧 API；不代表当前产物已发布                                |
| `aiao-media:requirements-check`                           | 17 项检查器及需求结构/链接门禁通过                                                            | 不验证需求描述与源码的语义一致性，也不替代产品验收                                    |

本机图片套件覆盖默认供应商、配置/草稿恢复、三画幅生成/保存/下载、不确定结果不重发、Key 生命周期、主动代理及结果 URL 无凭据读取、四路由离线、移动视口、多标签生成互斥和草稿冲突选择、OPFS 写失败重试、保存/删除 journal 重开恢复、超限/损坏/中断备份、schema 兼容守卫、模板撤销边界及资源失败重试。逐场景边界见[本地可靠性验收](plans/local-reliability-verification.md)。账号逐条 AC 证据见[真实账号验收说明](plans/supabase-account-verification.md)。

## 正式环境证据

现有 Workers Static Assets 与 `/api/relay` 发布记录为 `aiao-media.aiao.workers.dev`，version `92883918-76ac-47de-a424-4bc5af23bee9`；已有四路由、WASM 和旧 API 404 的静态烟测证据。其证据范围与本地新构建分开，发布记录详见[应用集成验证](plans/local-first-app-verification.md)。

## 首发关闭条件

| 待验项目               | 对应故事 / AC                                             | 必需证据                                                                                   |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 正式 origin 真实供应商 | MEDIA-US-102 AC 7、MEDIA-US-105 AC 6/7、MEDIA-US-202 AC 7 | 直连和主动代理分别记录 origin、模型/参数、三画幅生成、刷新回读与精确下载                   |
| 正式版本回退           | MEDIA-US-004 AC 4                                         | 0.0.26 升级、旧引擎拒绝降级后恢复新版、schema 守卫已验；正式产物/Service Worker 回退仍待验 |
| 桌面真实中文输入法     | MEDIA-US-106 AC 7                                         | 正文/字段、粘贴、撤销重做不丢字不抢焦点；合成 composition 和视口测试不能代替系统 IME       |
| 正式域名与部署更新     | MEDIA-US-004 AC 1–4                                       | 自定义域名、CSP/离线安装/更新、代理允许列表、版本回退和免费计划账单                        |

正式目标 origin 已选定为 `https://media.aiao.io`，尚未以该域名完成发布验收。移动真机属于暂缓的 MEDIA-US-107，不作为当前关闭条件；桌面真实输入法继续独立验收。账号/后台可在正式供应商配置暂缺时推进，顺序见[路线图](roadmap.md)，外部输入与已定范围见[决策与执行条件](decisions.md)。本地可复验 AC 已回写各 story。视口模拟、fixture、开发探针表与 dry-run 分别只覆盖其声明的验证层。

## 产品绑定、同步与后台

真实本地产品表、原生复制、双独立副本、账号隔离、首次确认、冲突/删除、作品信息、后台与显式任务上报已接线。详细实现、命令、7 个浏览器场景及边界见[本地产品交付验收](plans/local-delivery-verification.md)。

`aiao-media:product-test` 与 `aiao-media-e2e:product-e2e` 分别验证真实服务边界和生产静态应用。`aiao-media:script-test` 覆盖代理运行策略的实际处理函数，供应商响应使用 fixture。D-06 已确定首发不设 TTL、不自动清理，完整保留 tombstone、冲突与日志；检查点恢复已由 7 项真实产品套件单独留证，不把本地通过视为已经上线。正式执行顺序与条件见[收尾清单](plans/release-completion-tasks.md)。
