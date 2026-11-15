# Aiao BOM 能力矩阵

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 0    |
| 🚧 In Progress | 0    |
| 👀 In Review   | 6    |
| 📝 Backlog     | 1    |
| 🚫 Blocked     | 0    |
| **合计**       | 7    |

## 当前产品边界

| 能力组合                                    | 当前实现入口           | 验收边界                                                                                |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| 单人浏览器工作区、SC-100 样本、已有数据重开 | 概览、应用服务         | 浏览器原库标识保留，显式重置会清库；跨 origin 数据迁移另验                              |
| 展开、反查、替代、多输出与工序              | 展开、反查及计算面板   | 确定性样本与 golden；真实大型结构性能未证明                                             |
| ECN、生效期、配置、序列批次与双图           | 时间轴、展开、映射     | 明确评估条件与未裁决候选；不包含配置求解器                                              |
| 普通成本与联合生产成本                      | 成本页、联产场景       | 保留精确十进制和单位；不是财务审计结果                                                  |
| 生产改版核对与摘要                          | `/review`              | 两时点真实计算及人工确认；不自动发布或下单                                              |
| 导入、待发布草稿恢复及导出                  | 展开页的集成面板       | 事务回滚、显式选中发布与 manifest；真实 ERP 接线未验                                    |
| 实例装机、换件与来源保护                    | 实例追溯页             | 样本安装事实，不代表真实设备验证                                                        |
| 已加载核对页的离线重算                      | `/review` 热页         | 不承诺冷启动、整站离线刷新或资源缓存完整性                                              |
| Cloudflare 静态发布                         | Workers Static Assets  | 公网 Chromium 5/5 通过；深链接、隔离、WASM 和同源数据重开可用，跨 origin 数据不自动迁移 |
| 真实生产样本与正式发行                      | 真实样本故事及未来需求 | 尚待业务试用、历史库升级与受支持浏览器证据                                              |

Angular 是本应用的 UI 实现；平台 Angular / React / Vue 对称性由共享绑定及平台故事管理，不因本应用建档产生三套应用承诺。

## 故事索引

- 👀 [BOM-US-101 结构、数量、成本与变更分析](stories/analysis/BOM-US-101-structure-cost-analysis.md)
- 👀 [BOM-US-102 连续工作条件、结果快照与窄屏操作](stories/analysis/BOM-US-102-continuous-workflow.md)
- 👀 [BOM-US-301 导入草稿恢复、导出与实例追溯](stories/data/BOM-US-301-data-instance-workflow.md)
- 👀 [BOM-US-001 独立应用目录、需求与工程门禁](stories/platform/BOM-US-001-application-workspace.md)
- 👀 [BOM-US-201 生产改版核对与人工交接摘要](stories/production/BOM-US-201-change-review.md)
- ⬜ [BOM-US-202 真实生产样本的业务试用验收](stories/production/BOM-US-202-real-sample-pilot.md)

- 👀 [BOM-US-002 Cloudflare 静态发布与公网验收](stories/platform/BOM-US-002-cloudflare-deployment.md)
