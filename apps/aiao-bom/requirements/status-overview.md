# Aiao BOM 状态总览

状态只从 story YAML 派生；应用需求不进入平台计数。当前六条实现故事的对应本地验收通过，其中 Cloudflare 发布已通过真实公网验收；等待 PR 评审与合并，一条真实样本试用故事留在 Backlog。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 0    |
| 🚧 In Progress | 0    |
| 👀 In Review   | 6    |
| 📝 Backlog     | 1    |
| 🚫 Blocked     | 0    |
| **合计**       | 7    |

## 当前工作

- 独立目录与需求治理、现有业务分析、连续工作、改版核对和数据闭环均纳入应用独立验收。
- `BOM-US-002` 已发布 Cloudflare 静态应用，公网 Chromium 4/4 通过；深链接、SQLite 隔离、样本重开及计算均有真实部署证据。
- `BOM-US-202` 需要获准真实样本及目标工程师，满足准入条件后再开展；没有项目实施阻塞故事。

## 故事索引

- 👀 [BOM-US-101 结构、数量、成本与变更分析](stories/analysis/BOM-US-101-structure-cost-analysis.md)
- 👀 [BOM-US-102 连续工作条件、结果快照与窄屏操作](stories/analysis/BOM-US-102-continuous-workflow.md)
- 👀 [BOM-US-301 导入草稿恢复、导出与实例追溯](stories/data/BOM-US-301-data-instance-workflow.md)
- 👀 [BOM-US-001 独立应用目录、需求与工程门禁](stories/platform/BOM-US-001-application-workspace.md)
- 👀 [BOM-US-201 生产改版核对与人工交接摘要](stories/production/BOM-US-201-change-review.md)
- ⬜ [BOM-US-202 真实生产样本的业务试用验收](stories/production/BOM-US-202-real-sample-pilot.md)

- 👀 [BOM-US-002 Cloudflare 静态发布与公网验收](stories/platform/BOM-US-002-cloudflare-deployment.md)
