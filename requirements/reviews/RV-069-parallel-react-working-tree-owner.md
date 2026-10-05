---
id: RV-069
title: React 切换 provider 后旧库工作树状态残留并覆盖新库
status: Open
severity: P1
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-069：React 切换 provider 后旧库工作树状态残留并覆盖新库

## 问题与影响

**P1，当前复验确认，待修。** 同一公开 RxDBProvider 消费组件从数据库 A 切 B；commands 会按 B 重建，但十二格 useState 与稳定 patch sink 没有跟随库身份重置或废弃旧实例。已完成 A 状态继续显示在 B；旧 A.isEnabled 迟到还会盖掉 B 已确认的 false。

## 根因与锚点

[生产源码](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts)：84–95；[详细子任务阅读与边界](evidence/2026-10-05/parallel/frameworks/findings.pending.md)。源码行属于本轮输入，不以旧行号指代未来改动。

## 实际复验与限定

两条原 React/provider + 官方 testing IO 接缝回归都失败：B 初始仍是 A 的 success/value；A 迟到把 B false 覆盖成 true。没有证明已向错误数据库落写，也不把这个 React 根因泛化成三框架共有。

[新增复验](../../packages/rxdb-plugin-working-tree-react/src/__tests__/review-parallel-provider-switch.spec.ts) / [集中复验原日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)。extension/HTTP新测试随后修正原spec目标库缺Promise.withResolvers及缺显式sync配置的类型问题，类型修复不改业务；对应 [修正夹具后的复验](evidence/2026-10-05/parallel/validation/corrected-new-probes.txt) 以实际状态为准。原失败日志不删除，红测试不skip。

## 最小修法与回归

状态与 sink 绑定 database identity；换库立即暴露 B 初态，撤销旧实例的写回能力。保留原数据库命令 Promise 契约，不靠要求所有用户给组件加 key 掩盖 ownership；补 StrictMode、旧 diff、CAS/dirty 中换库。

## 解决记录

- [x] 主控实际失败与成功对照/公开契约核对，按同根因去重。
- [ ] 修复业务和补遗漏边界；评审完成不等于已修/发布就绪。
