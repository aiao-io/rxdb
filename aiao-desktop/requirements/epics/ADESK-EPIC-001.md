---
id: ADESK-EPIC-001
status: Done
startDate: 2026-11-12
targetDate: 2026-11-12
owner: jimmy
---

# 产品工程结构

## 愿景

Aiao Desktop 作为一个多应用产品管理：Angular 桌面与浏览器冒烟各是一个 Nx 应用，产品需求集中在产品根目录，结构、影响范围与安全边界由门禁约束。

## 目标

- [x] 升级为仓库根的产品根目录，拆成 web 与 e2e 两个应用，门禁覆盖需求结构、影响范围、安全边界与 CI 接入（[ADESK-US-001](../stories/platform/ADESK-US-001-product-root.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-001 产品根目录与多应用拆分](../stories/platform/ADESK-US-001-product-root.md) (High)

## 非目标

- 不改变桌面的产品行为。
- 不为复用提前抽包：眼下没有跨应用共用的代码。
