# Aiao BOM 需求管理

Aiao BOM 是制造工程师的本地 BOM 工作台。当前范围为单人浏览器工作区、结构与成本分析、生产改版核对、数据导入导出和实例追溯。SC-100 与联产数据用于可复现验收；真实企业数据、Cloudflare 静态发布与正式发行分别验收。

story YAML `status` 是唯一状态真相源，应用统计独立于根 `requirements/`。根需求维护共享领域能力；应用通过 `capabilities: [rxdb:US-525]` 引用，应用内的关闭前置通过 `dependsOn` 引用。

| 文件                                             | 用途                                       |
| ------------------------------------------------ | ------------------------------------------ |
| [CONVENTIONS.md](CONVENTIONS.md)                 | BOM 编号段、工作流及 Nx 门禁               |
| [stories/](stories/)                             | 当前用户故事与验收标准                     |
| [epics/](epics/)                                 | 工作区、业务分析、生产核对与数据闭环的范围 |
| [status-overview.md](status-overview.md)         | 从故事派生的当前状态与阻塞                 |
| [roadmap.md](roadmap.md)                         | 依赖顺序和当前可开展的工作                 |
| [decisions.md](decisions.md)                     | 产品、数据兼容和验收决策                   |
| [capability-matrix.md](capability-matrix.md)     | 当前可用组合和限制                         |
| [verification-report.md](verification-report.md) | 本地结构、单测、浏览器与真实环境证据       |
| [future-requirements.md](future-requirements.md) | 后续产品范围与准入条件                     |
| [plans/](plans/README.md)                        | 实施计划、研究和验收留档                   |
| [reviews/](reviews/README.md)                    | 应用评审模板与待处理报告                   |
| [code-scanning/](code-scanning/README.md)        | 应用 CodeQL 工作集                         |

## 术语

- 发生项路径：某个物料在结构中的具体使用位置，同物料多次出现保留各自身份。
- 评估条件：物料、组织、BOM 类型、日期、计划量、单位及适用的序列、批次、配置和替代选择。
- 核对摘要：基于执行条件、数据版本、两时点结果及人工确认导出的交接内容。
- 平台能力：根需求及公共包提供的领域契约；平台故事 Done 不替代本应用验收。

## 验证入口

```bash
pnpm nx run aiao-bom:requirements-check
pnpm nx run aiao-bom:requirements-test
```

门禁只验证文档结构和引用。故事标记 `In Review` 表示实现及本地证据待评审确认，不能从平台 Done 或既有研究中的测试计数推导为应用 Done。
