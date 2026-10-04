---
id: RV-047
title: DevTools 脱敏预处理在 changes 环引用上溢出并向生产者抛错
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-047：DevTools 脱敏预处理在 changes 环引用上溢出并向生产者抛错

## 问题

🔴 **P2，确认问题，待修复。** generic 查询文档或事件 patch 的 changes 数组引用对象自身时，DevTools 的脱敏遍历会无限递归。查询输出丢失正常兄弟字段、退化为错误记录；事件路径会向事件生产者同步抛出 RangeError。普通 self 环引用的已有安全序列化对照正常。

## 根因

[maskEmbeddedChangeValue](../../packages/rxdb-devtools/src/connector-mask.ts) 第 80–98 行递归数组与 changes，没有路径 visited / WeakMap。[connector](../../packages/rxdb-devtools/src/connector.ts) 第 995–997 行先 mask，再调用已经有循环检测的 serialize；因此后者根本得不到输入，不能提供既有保护。

查询文档也走 maskEncryptedDocument→maskEmbeddedChangeValue，故只测 serializer 的 `[Circular]` 或 self 字段并不足以证明整条链路安全。

## 复验

在 [connector.boundaries.spec.ts](../../packages/rxdb-devtools/src/__tests__/connector.boundaries.spec.ts) 增加 self/changes 两种形态的 query 与 event 对照。实际 connector、masker、serializer、消息接缝；RxDB/repository 为项目既有夹具。

新增 **2 failed / 2 passed**，该文件整体 **2 failed /77 passed**：[日志](evidence/2026-10-04/tree-devtools/devtools-circular-changes.txt)。changes 查询失去 name 兄弟字段；changes event 抛 `Maximum call stack size exceeded`。self 两例均正常。没有将其包装成“已复现普通数据库 JSON 存储行存在环”或已证明业务 SQL 写入失败；已确认的是公开调试接缝接受的 generic 对象/事件在预处理阶段破坏已有循环安全契约。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-devtools:test --args='src/__tests__/connector.boundaries.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

脱敏遍历也必须图安全：先登记输出对象身份，再递归子节点，保留循环/共享引用供后续 serializer 正确处理；或用受控路径 visited 与明确的节点降级。不要因为遇到环就跳过脱敏泄露加密字段，也不要吞异常后把整条文档删成只有 id。

补循环数组、深 changes 链、共享兄弟引用、嵌套加密字段以及查询/事件两条路径。调试监听不应向业务事件生产者传播这种表示层异常。

## 解决记录

- [x] connector 全链路失败与正常循环对照保留；业务实现未改。
- [ ] 图安全脱敏并保留现有加密/序列化语义。
- [ ] 当前 Open。
