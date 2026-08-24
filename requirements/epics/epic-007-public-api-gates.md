---
id: epic-007-public-api-gates
status: In Progress
startDate: 2026-08-24
targetDate: TBD
owner: jimmy
---

# 公开 API 门禁

## 愿景

让 [versioning-policy.md](../versioning-policy.md) 第 2 节定义的「公开 API」**全部**处在自动化门禁之下：
凡是被策略文档承诺为公开的入口，破坏性变更都必须在 CI 上被拦住，而不是靠 PR 作者记得声明。
承诺与门禁之间的每一处差额，要么补齐门禁，要么改小承诺——不允许长期停在「文档说受保护，实际没扫」。

## 为什么单列一个 Epic

现有六个 Epic 都以**产品能力**分组（核心引擎、同步、UI、平台扩展、类型系统、工作树）。
门禁不是产品能力，它是这些能力的发布约束，因此挂进任何一个都会让那个 Epic 的愿景失真——
[epic-004](epic-004-future-features.md) 的愿景是「全文搜索、桌面原生文件存储等中长期能力」，
把「扫描器覆盖子路径」塞进去只会让读者以为它是一项用户可见功能。

同时这类工作有稳定的复现模式：**某道门禁的覆盖面小于它被引用时暗示的范围**。
一次评审即一次性暴露了三处（见下方目标），说明它需要一个能持续接收此类缺口的归属，
而不是每次现补一个「杂项」故事。

## 目标

- [x] `api-surface.mjs` 覆盖 `exports` 子路径入口的导出表面（[US-601](../stories/tooling/US-601-subpath-api-surface-baseline.md)，✅ 2026-08-24）——
      30 个公开包 44 个入口全部进基线；唯一不扫的 2 个资产入口没有导出表面可扫，由 SHA-256 守护。
      **本 Epic 因此转 `In Progress`**：三条目标关了第一条，剩两条仍无故事认领
- [ ] 迁移发布门禁的三个 git 钩子（`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`）
      进入 PR CI，而不只在打 tag 时跑——**尚无故事认领**，背景见
      [release-plan 的执行顺序第 0 步](../release-plan.md#执行顺序)
- [ ] 手工发布路径的前置校验：`pnpm test-all` 未跑绿即发布，会重演 0.0.25 的版本漂移——**尚无故事认领**，
      背景见 [release-plan](../release-plan.md) 的「开项：0.0.25 遗留的两条版本漂移」

新缺口进入本 Epic 的判据只有一条：**它是一道门禁的覆盖面问题**。
「某个功能还没做」不属于本 Epic，哪怕它会顺带改到门禁配置。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-601 子路径入口纳入 API 表面基线](../stories/tooling/US-601-subpath-api-surface-baseline.md) (Medium)

## 非目标

- 替代类型契约测试与 `public-contract` 消费者：本 Epic 只管「导出表面被增删改」这一层信号，
  不做完整签名快照（口径见 [api-surface.mjs](../../scripts/audit/api-surface.mjs) 的设计取舍）
- 覆盖率阈值的调整：`coverage-check.mjs` 的 80% / 90% 硬门槛已生效，改阈值是策略决策不是覆盖面缺口
- `apps/` / `modules/` / `examples/` 等非发布项目的 API 稳定性——它们不对外发布，没有公开 API 承诺
- 把门禁从「拦 CI」升级为「自动改代码」：门禁只负责拦截与指明，修复始终是作者的动作
