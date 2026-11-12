---
id: MODEL-EPIC-002
status: Done
startDate: 2026-11-12
targetDate: 2026-11-12
owner: jimmy
---

# 产品工程结构

## 愿景

模型设计器作为一个多应用产品管理：浏览器设计器、Cloudflare Worker 与 Trigger.dev 智能体各是一个 Nx 应用，共用的纯函数是产品私有包，产品需求集中在产品根目录，依赖方向和安全边界由门禁约束。

## 目标

- [x] 升级为产品根目录，按运行时拆成三个应用与一个私有包，门禁覆盖结构、依赖方向、影响范围与安全边界（[MODEL-US-003](../stories/platform/MODEL-US-003-product-root.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [MODEL-US-003 产品根目录与多应用拆分](../stories/platform/MODEL-US-003-product-root.md) (High)

## 非目标

- 不改变三个应用的产品行为。
- 不为复用提前抽包：只有 web 与 agent 都要用的模型操作进私有包。
