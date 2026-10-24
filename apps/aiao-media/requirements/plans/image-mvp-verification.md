# 图片 MVP 实施验收记录

> **旧版实现证据。** 本文验证的是已废弃的带账号/API/PostgreSQL 图片实现，仅作历史记录；当前能力以 story 和[验收记录](../verification-report.md)为准。

日期：2026-10-23，Asia/Shanghai。本文记录实际实现、本地自动化验证与已配置真实网关的开发环境验证；公网域名及邀请用户反馈仍需目标环境验收。

## 当前交付

- 默认 Web 为发现灵感、生成图片、我的图片三个页面，含 12 个静态模板、四类筛选、关键词搜索、来源详情及手机 Web 布局。
- Tiptap 支持正文、行内参数、撤销重做、最终纯文本预览/复制，限制 2000 字符；RxDB 保存提示词、模板身份与画幅。
- RxDB 使用 `@aiao/rxdb`、`@aiao/rxdb-adapter-wa-sqlite`、`@aiao/rxdb-plugin-storage` 的 npm `0.0.26` 包；构建自动准备 WASM，默认任务不链接同级源码。
- API 默认单一服务端图片配置、单张 PNG/固定质量、三种画幅；复用邀请账号、PostgreSQL 持久任务、原请求幂等、任务额度、私有结果文件和归属校验。
- 浏览器冻结提交意图后发送；断连或回执无效时保留原 key。MVP 已用 key 持续绑定原任务，不因旧 24 小时窗口结束而重新出图；明确拒绝可重新提交，派发未知不会自动重出图。
- 图片保存后回读校验，支持本机列表、下载、复用、删除及存储失败降级；已处理结果标记避免删除后重新自动导入。
- 提供外部 HTTPS 反馈表单配置和未配置时的复制反馈入口；提供运营核查命令，复用管理员、版本、证据摘要与审计约束。
- 生产默认构建只覆盖 API/Web，不初始化旧供应商管理、参考图、音视频或云同步运行时。

## 验证范围与证据

本地已完成生产 Web 构建、真实 Chrome 浏览器及隔离 PostgreSQL 验证。下表中的浏览器 HTTP API 和 PostgreSQL 测试上游是 fixture，数据库、任务事务、SQLite、IndexedDB、OPFS、文件和下载是真实实现。真实网关的开发环境验证单独记录。

专项测试环境：macOS，Bun `1.3.10`、Node.js `26.7.0`、本机 Google Chrome，独立 `postgres:16-alpine` 测试容器。专项测试库为本机 `aiao_auth_test_mvp`，与开发环境数据库分开。

| 验证命令                                                                    | 结果及边界                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                             | 通过；三个 RxDB 包均为真实安装的 npm `0.0.26`，没有源码软链接                                                                                                                                               |
| `AIAO_PLAYWRIGHT_CHANNEL=chrome bun nx run aiao-media-e2e:image-mvp-e2e`    | **9 项通过**；生产构建、真实编辑器/SQLite/OPFS、下载、刷新、参数/画幅恢复、回执丢失、额度拒绝、存储不可用、跨账号迟到结果、删除后不导回、撤销重做、原生模态焦点、结果过期及 390px 布局；HTTP API 为 fixture |
| `bun nx run api:test-image-mvp-db`                                          | **6 项通过**；真实 PostgreSQL 迁移、会话与登录路由、幂等/隔天回放、额度/并发、持久恢复、文件归属、核查权限/结算、单张 PNG 交付、退出与旧媒体隔离；上游为注入 fixture                                        |
| `bun nx run api:test-image-mvp`                                             | **7 项通过**；三个画幅请求/方向、服务端固定配置、文本限制、非法结果与路由范围                                                                                                                               |
| `bun nx run-many -t test -p web contracts local-data`                       | 三个项目全部通过，含草稿/提交兼容与 handled-result 标记                                                                                                                                                     |
| `bun nx run-many -t typecheck lint -p api web web-e2e contracts local-data` | 五个项目类型检查和 lint 全部通过                                                                                                                                                                            |
| `bun nx run aiao-media:smoke-production`                                    | API/Web 生产构建、三个 SSR 路径、同源 API、Host、缓存、示例资产与 WASM 全部通过；本地 loopback                                                                                                              |
| `bun nx run aiao-media-e2e:requirements-check`                              | 13 项检查测试通过，996 个本地链接检查无错误；历史故事状态保持 3 Done / 13 In Progress                                                                                                                       |

PostgreSQL 命令需显式提供 `AIAO_AUTH_TEST_DATABASE_URL`，仅允许可丢弃的本机测试数据库。完整源码 API suite 的已知失败见下一节，不包含在“专项通过”中。构建还提示三个传递依赖的 CommonJS 优化警告，不阻止构建。

实际页面截图在 [implementation 目录](../design/image-mvp/implementation/README.md)，原始界面设计在 [设计总览](../design/image-mvp/00-overview.png)。

## 完整回归发现的旧模块问题

完整 API 单测曾得到 1874 通过 / 1 失败：`capability-evidence-tls.spec.ts` 的 `Bun verifies trusted wrong IP SAN even with ambient TLS disabled` 失败；单独复跑也失败。该用例及对应私有维护数据库连接模块未在本次修改，当前图片 MVP 不启用它。不能把完整 API suite 宣称为全绿，也不通过跳过断言来隐藏此问题。应在重新启用私有维护模块前修复并复验。

## 真实网关验证：三个画幅已出图

2026-10-23，使用现有 `.env` 配置的网关和 `gpt-image-2.5` 模型，通过真实 Web 登录、Tiptap 模板参数、图片 API、持久任务和 npm RxDB 完成三次实际生成。未更改用户选择的模型；没有重生成已完成的正方形任务。

| 画幅   | 请求尺寸  | 实际 PNG 尺寸 | 服务端派发至完成 | 文件字节  |
| ------ | --------- | ------------- | ---------------- | --------- |
| 正方形 | 1024×1024 | **1254×1254** | 47.636 秒        | 2,756,118 |
| 横向   | 1536×1024 | 1536×1024     | 31.024 秒        | 2,832,315 |
| 纵向   | 1024×1536 | 1024×1536     | 37.935 秒        | 2,751,618 |

耗时来自数据库任务的 `dispatch_started_at` 到完成时间，包含上游请求、解码和服务端文件落盘，不是仅模型推理时间。横向/纵向的浏览器生成到保存、下载时间分别为 33.015 秒 / 40.574 秒。样本只有三张，不构成性能或成功率承诺。

三张均确认真实 PNG、正确画幅、本机保存和下载，下载文件 SHA-256 与数据库中的结果摘要一致。正方形首次脚本在下载后因精确尺寸断言停止；网关实际返回的正方形有效，产品按画幅校验并保留原图。脚本现分别记录请求尺寸和实际尺寸。另一轮提交前的浏览器等待失败经数据库确认没有新增任务；后续只提交尚未生成的横向和纵向。未自动重提任何已派发的任务。

后续浏览器上下文中的横向/纵向两张图片通过作品库刷新恢复、真实文件读取和退出后私有界面清空检查，`aiao-media-e2e:smoke-image-mvp-live` 成功结束。正方形属于前一上下文，因此没有把作品库两张截图说成同一上下文验证了三张。

证据：[真实页面截图](../design/image-mvp/live-provider/README.md)、[脱敏机器记录](image-mvp-live-verification.json)。完整报告和 PNG 保存在本机 Git 忽略目录 `tmp/image-mvp-local/`。此次实际派发三次，不包含供应商后台账单核对，也未部署公网。

## 当前本地开发环境

已读取用户配置的 `.env`，校验图片网关和模型配置，完成 PostgreSQL 迁移。使用 `bun run dev` 同时启动 API 与 Web，入口为 `http://localhost:4300`；健康检查为同源 `/api/health`。开发 Web 当前通过 `localhost` 监听，真实浏览器脚本默认使用该地址。

- 本地 PostgreSQL：容器 `aiao-media-dev-postgres`，仅映射 `127.0.0.1:5432`，数据库 `aiao_media`；数据卷 `aiao-media-dev-postgres-data` 持久保留。已配置自动重启，停机后可用 `docker start aiao-media-dev-postgres` 恢复，不应删除容器数据卷。
- 图片结果：位于用户 Library 中的独立私有开发目录；已补充 `AIAO_GENERATION_RESULT_DIR` 和网关主机允许列表，保留原数据库、密钥和模型配置。`.env` 权限为 `0600`。
- 独立开发账号：`mvp-dev@aiao.test`，随机密码只保存在 Git 忽略文件 `tmp/image-mvp-local/account.json`（`0600`），不写入文档或日志。
- 显式真实生成目标：`aiao-media-e2e:smoke-image-mvp-live`。默认实际提交三个画幅各一张；`AIAO_MVP_LIVE_RATIOS=landscape,portrait` 可只检查尚未提交的画幅。该命令不自动重提失败或未知任务，不加入普通测试/CI。已有任务先按报告中的任务 ID 查询，不能用画幅参数绕过待核查状态。

## 仍需目标环境完成

本地开发环境已配置真实上游与持久数据库/目录，尚未执行公网部署。

- 核对上游后台实际用量与费用；图片成功和应用额度消耗不等于已核对供应商账单。
- 在正式 HTTPS 域名验证账号隔离、同源网关、反馈表单和回退。
- 目标移动设备和真实中文输入法验证；当前仅 Chrome 桌面及 390px 响应式检查。
- 邀请 10–20 位目标用户，收集出图成功率、满意度、下载/保存意愿和主要阻碍。

按 部署步骤 完成后再将 M5 标为上线完成；这不阻止运行当前本地交付。
