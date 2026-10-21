---
id: US-104
title: rxdb-model 表单校验反馈与保存失败的展示（三端对称）
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-10-21
updated: 2026-10-21
tags: [framework, rxdb-model, tri-framework, validation]
---

# 用户故事：rxdb-model 表单校验反馈与保存失败的展示（三端对称）

## 作为/我想要/以便

**作为** 使用 rxdb-model 组件的工作台使用者
**我想要** 提交非法表单或保存失败时在对话框内看到可读的反馈
**以便** 知道哪条字段没通过、保存为什么失败，而不是点击保存后什么都没有发生

## 范围边界

### In Scope

- 三端 `EntityDetail` 把校验结果与保存失败渲染在对话框内（`role='alert'` + `data-testid='entity-detail-errors'`）
- 校验失败：逐条显示 `FormValidationResult.errors` 的 `message`；不落库；对话框保持打开
- 保存失败：显示「保存失败：<原因>」；对话框保持打开
- 成功保存 / 取消 / 字段变更时清空已展示的错误

### Out of Scope

- 字段级内联错误标记（每个字段下方单独展示）
- 修改 `validateForm` / 校验规则本身
- `EntityList` 之外的页面级错误横幅（宿主自行处理）

## 验收标准

| #   | 前置条件                     | 操作               | 预期结果                                               | 状态 |
| --- | ---------------------------- | ------------------ | ------------------------------------------------------ | ---- |
| 1   | 三端任一 create 对话框已打开 | 不填必填字段点保存 | 对话框内出现「X 是必填项」；数据不入库；对话框保持打开 | ⬜   |
| 2   | 三端任一 edit 对话框已打开   | 改成非法值并保存   | 对话框内出现可读校验反馈；不落库；对话框保持打开       | ⬜   |
| 3   | 三端任一 create 对话框已打开 | 提交触发保存失败   | 对话框内出现「保存失败：<原因>」；对话框保持打开       | ⬜   |
| 4   | 错误已展示                   | 修改字段或点取消   | 错误消失                                               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

模型驱动后台工作台的组装（[admin-framework 候选分析](../../domain-research/admin-framework.md) 首版
AC「校验反馈可读」）实测发现：三端 `EntityDetail` 都只把 `FormValidationResult` 转发给宿主
（React 回调 / Angular output / Vue emit），保存失败只进 `console.error` / `ErrorHandler`——
内置对话框没有任何可见反馈，用户点保存后「什么都没有发生」。

修复落在组件层而非工作台层：三端同改、同一组 `data-testid` 与文案；回归由三端包内 spec 与
工作台 e2e 共同钉住。错误消息源：
[`validateEntityFieldValue`](../../../packages/rxdb-model/src/entity-value.utils.ts) 的
「`X` 是必填项」与 [`validateForm`](../../../packages/rxdb-model/src/entity-form/form-validation.ts)。

## 实现文件

- `packages/rxdb-model-react/src/entity-detail/entity-detail.tsx` — 校验 / 保存错误面板
- `packages/rxdb-model-angular/src/entity-detail/entity-detail.ts` + `entity-detail.html` — 同语义
- `packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue` — 同语义

## References

- [admin-framework 候选分析](../../domain-research/admin-framework.md) — 触发背景（首版边界「校验反馈可读」，US-526 工作台 AC#4 的红色用例）
