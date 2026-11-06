# Aiao BOM 分层验收台账

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 0    |
| 🚧 In Progress | 0    |
| 👀 In Review   | 6    |
| 📝 Backlog     | 1    |
| 🚫 Blocked     | 0    |
| **合计**       | 7    |

## 证据层级

| 层级                    | 复验入口或证据                                                                                                                                        | 当前结论                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| L1 需求结构             | `pnpm nx run aiao-bom:requirements-check`                                                                                                             | 通过，7 条应用故事独立计数，四份派生视图与本地链接一致                                                                         |
| L1 门禁回归             | `pnpm nx run aiao-bom:requirements-test`                                                                                                              | 16/16 通过；行 94.90%、分支 93.96%、函数 93.48%，默认阈值均为 80%                                                              |
| L2 静态与单元测试       | `pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e --targets=lint,typecheck,spec-typecheck,test --parallel=1 --skipRemoteCache --output-style=static` | lint 零警告、typecheck 与 spec-typecheck 通过；单测 25 文件、229/229 通过                                                      |
| L3 生产产物及浏览器     | `pnpm nx run aiao-bom-e2e:e2e`                                                                                                                        | 生产构建及浏览器 40/40 通过，单 worker、零重试；含既有库重开、离线热页重算、375px 窄屏，以及首次准备至依据查看、返回和摘要下载 |
| L4 真实业务试用         | BOM-US-202 的样本、人工基线与目标用户记录                                                                                                             | 缺少真实样本与目标用户试用证据                                                                                                 |
| L3 Cloudflare 本地仿真  | `pnpm nx run aiao-bom-e2e:e2e-cloudflare`                                                                                                             | Wrangler 服务生产产物，部署验收 5/5 通过，单 worker、零重试                                                                    |
| L4 Cloudflare 公网部署  | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare`                                                                  | 实际发布成功，公网 Chromium 5/5 通过；64 个发布资产 SHA-256 均与本地产物一致，含首次窄屏主入口核对流程                         |
| L4 历史库迁移与正式发行 | 受支持浏览器、历史版本及发行产物记录                                                                                                                  | 跨 origin 自动迁移、历史 schema 升级及正式发行仍需独立验收                                                                     |

## 复验规则

AC 标为 ✅ 仅代表表内承诺与对应证据匹配。应用故事在 PR 评审及合并前保留 In Review；平台能力 Done、研究记录中的测试数量和结构门禁均不能代替应用实测。自动化不证明首次用户三分钟理解，也不证明真实客户适用。

研究及旧运行记录见[产品体验研究](plans/bom-product-ux-2026-10-19.md)。工程迁移证据见[应用化验收记录](plans/application-promotion-verification.md)，实际部署地址、Worker 版本与公网验收见[Cloudflare 部署验收](plans/cloudflare-deployment-verification.md)。

## 故事索引

- 👀 [BOM-US-101 结构、数量、成本与变更分析](stories/analysis/BOM-US-101-structure-cost-analysis.md)
- 👀 [BOM-US-102 连续工作条件、结果快照与窄屏操作](stories/analysis/BOM-US-102-continuous-workflow.md)
- 👀 [BOM-US-301 导入草稿恢复、导出与实例追溯](stories/data/BOM-US-301-data-instance-workflow.md)
- 👀 [BOM-US-001 独立应用目录、需求与工程门禁](stories/platform/BOM-US-001-application-workspace.md)
- 👀 [BOM-US-201 生产改版核对与人工交接摘要](stories/production/BOM-US-201-change-review.md)
- ⬜ [BOM-US-202 真实生产样本的业务试用验收](stories/production/BOM-US-202-real-sample-pilot.md)

- 👀 [BOM-US-002 Cloudflare 静态发布与公网验收](stories/platform/BOM-US-002-cloudflare-deployment.md)
