# Aiao BOM 路线图

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 0    |
| 🚧 In Progress | 0    |
| 👀 In Review   | 5    |
| 📝 Backlog     | 1    |
| 🚫 Blocked     | 0    |
| **合计**       | 6    |

## 依赖顺序

1. `BOM-US-001`：应用目录、Nx 配置及需求门禁。
2. `BOM-US-101` / `BOM-US-102`：领域接线与连续工作，均依赖应用工作区。
3. `BOM-US-201`：基于分析与连续工作完成改版核对；`BOM-US-301`：基于分析完成数据和实例闭环。
4. `BOM-US-202`：产品主线通过应用验收后，凭获准真实样本和目标工程师进入业务试用。

前五条的本地验收通过，等待 PR 评审与合并；不按平台 Done 自动关闭。真实样本试用不承诺日期，未取得样本不扩展部署、团队协作或 ERP 范围。候选方向见[未来需求](future-requirements.md)。

## 故事索引

- 👀 [BOM-US-101 结构、数量、成本与变更分析](stories/analysis/BOM-US-101-structure-cost-analysis.md)
- 👀 [BOM-US-102 连续工作条件、结果快照与窄屏操作](stories/analysis/BOM-US-102-continuous-workflow.md)
- 👀 [BOM-US-301 导入草稿恢复、导出与实例追溯](stories/data/BOM-US-301-data-instance-workflow.md)
- 👀 [BOM-US-001 独立应用目录、需求与工程门禁](stories/platform/BOM-US-001-application-workspace.md)
- 👀 [BOM-US-201 生产改版核对与人工交接摘要](stories/production/BOM-US-201-change-review.md)
- ⬜ [BOM-US-202 真实生产样本的业务试用验收](stories/production/BOM-US-202-real-sample-pilot.md)
