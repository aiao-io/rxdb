# 计划与验收记录

MVP 首发收口与同步扩展的实施计划、真实环境验收记录和历史归档。当前范围与状态以[需求索引](../README.md)、[状态概览](../status-overview.md)、[路线图](../roadmap.md)和各 story 为准；这里的记录带日期，不作为当前状态的派生视图。

| 验收记录                                                                             | 回答的问题                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [local-first-app-verification.md](local-first-app-verification.md)                   | 默认应用已经验证什么、还缺什么                                      |
| [local-reliability-verification.md](local-reliability-verification.md)               | 凭据、作品信息、并发草稿、文件/备份中断恢复与 schema 守卫的复验入口 |
| [supabase-account-verification.md](supabase-account-verification.md)                 | 真实本地账号会话、开发探针授权及产品同步的边界                      |
| [local-first-direct-probe-verification.md](local-first-direct-probe-verification.md) | 浏览器直连供应商的最小实验结论                                      |
| [public-delivery-verification.md](public-delivery-verification.md)                   | 正式域名发布、代理三画幅、A→B→A 更新/回退的证据与发布身份           |
| [provider-acceptance-follow-up.md](provider-acceptance-follow-up.md)                 | 直连与真实 URL 补验、MiniMax 适配、未知请求锁定与尝试记录           |
| [jpeg-delivery-verification.md](jpeg-delivery-verification.md)                       | PNG/JPEG 原图交付、JPEG 版本发布与原图网络诊断                      |
| [rxdb-import-verification.md](rxdb-import-verification.md)                           | 同仓迁入的来源、目录映射、兼容性与复验结果                          |
| [local-delivery-verification.md](local-delivery-verification.md)                     | 原生复制、账号隔离、后台、实体化与 affected 任务结果                |
| [branch-completion-20261029.md](branch-completion-20261029.md)                       | 2026-10-29 分支收尾的修复、复验结果与新增验收入口                   |
| [image-mvp-verification.md](image-mvp-verification.md)                               | 旧实现的历史验收记录，不作为当前能力证据                            |
| [image-mvp-live-verification.json](image-mvp-live-verification.json)                 | 旧实现真实页面派发的脱敏机器记录                                    |
| [roadmap-before-image-mvp.md](roadmap-before-image-mvp.md)                           | 范围调整前的全媒体路线图历史归档                                    |

产品规则整理在对应 story；计划记录研究结论、依赖与实施切片，不能替代实现证据。

| 实施计划                                                     | 回答的问题                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| [account-workspace-binding.md](account-workspace-binding.md) | 已确定的账号绑定、退出/切账号、本机副本和同步接线方案           |
| [business-admin.md](business-admin.md)                       | 跨用户后台的权限、对象、数据来源与 A/B/C 交付切片               |
| [library-search-tasks.md](library-search-tasks.md)           | MEDIA-US-204 检索/稳定分页/视口预览的完成记录、样本与覆盖率边界 |
| [local-delivery-tasks.md](local-delivery-tasks.md)           | 本地产品交付的实施清单                                          |
| [release-completion-tasks.md](release-completion-tasks.md)   | 剩余真实验收顺序、供应商验收入口与生产账号服务启用步骤          |
| [rxdb-product-incubation.md](rxdb-product-incubation.md)     | 迁入 RxDB 的目录、应用需求隔离、MVP 保全与发布交接方案          |

原仓基线和依赖版本见[导入清单](source-import.json)。
