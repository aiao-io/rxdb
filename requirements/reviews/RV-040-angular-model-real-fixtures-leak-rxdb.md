---
id: RV-040
title: Angular 模型真实组件套件未销毁共享数据库导致合跑失败
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-040：Angular 模型真实组件套件未销毁共享数据库导致合跑失败

## 问题

🟡 **确认测试基础设施问题，待修复。** EntityDetail / EntityList 的真实组件 spec 各自在 `beforeAll` 创建并连接一个 RxDB，复用同一批导入的实体类型，却没有对应的 afterAll 销毁。单文件通过，合跑时另一个 suite 遗留的 manager 使 `new Account(...)` / `new Todo(...)` 触发合法的多库歧义拒绝。

这会让核心没有变化的 CI 按文件顺序出现不同失败数，掩盖真正的组件回归。它不是 EntityDetail 的关系编辑能力已被证明坏掉，也不是核心应该自动“选第一个数据库”。

## 根因与源码证据

- [entity-detail.real.spec.ts](../../packages/rxdb-model-angular/src/__tests__/entity-detail/entity-detail.real.spec.ts) 第 77–110 行建立共享数据库，第 399–402 行用实体类静态构造入口；文件没有 afterAll 关闭该共享实例。
- [entity-list.real.spec.ts](../../packages/rxdb-model-angular/src/__tests__/entity-list/entity-list.real.spec.ts) 第 29–70 行建立共享数据库，第 80–83 行使用 `new Todo`。第 709–736 行只销毁额外 fresh 数据库，不处理 suite 自己的共享实例。
- [test-setup.ts](../../packages/rxdb-model-angular/src/test-setup.ts) 仅 resetTestingModule；它不认识这两个 suite 创建的 RxDB。
- [EntityManager](../../packages/rxdb/src/entity/entity-manager.ts) 第 655–686 行登记同一实体类型的多个 manager；静态入口在没有调用上下文时拒绝歧义，第 219–221 行通过 destroy 解绑。这是应保留的保护。

## 动态复验与根因对照

| 场景                      | 结果                                   | 证据                                                                  |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| detail 单文件             | 17 passed                              | [日志](evidence/2026-10-03/follow-up/model-detail-alone.txt)          |
| list 单文件               | 44 passed                              | [日志](evidence/2026-10-03/follow-up/model-list-alone.txt)            |
| 原始两文件合跑            | 1 failed / 60 passed，Account 多库歧义 | [日志](evidence/2026-10-03/follow-up/model-detail-list-pair.txt)      |
| 当前包全套串行            | 35 failed / 249 passed，Todo 多库歧义  | [日志](evidence/2026-10-03/follow-up/rxdb-model-angular-isolated.txt) |
| 两文件副本加显式 teardown | 61 passed                              | [日志](evidence/2026-10-03/follow-up/model-cleanup-pair-control.txt)  |

对照只在同目录的临时测试副本加入 `afterAll`：先 resetTestingModule，再 `await rxdb.destroy()`。产品组件、核心和原 spec 均未修改，副本跑完已删除。原文件 SHA 与命令见 [对照状态](evidence/2026-10-03/follow-up/model-cleanup-pair-control-status.json)；可复用 [detail 差异](evidence/2026-10-03/follow-up/model-detail-cleanup-control.patch) / [list 差异](evidence/2026-10-03/follow-up/model-list-cleanup-control.patch)。这是根因试验，不是假装修好了原始门禁。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-model-angular:test --args='src/__tests__/entity-detail/entity-detail.real.spec.ts src/__tests__/entity-list/entity-list.real.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

为 beforeAll 创建的数据库登记明确的 afterAll 销毁；先关闭组件/订阅，再销毁数据库。其它自建数据库 spec 同样核查归属和清理，不能把 `resetData()` / TestBed.resetTestingModule 当作数据库销毁。跨库场景用显式 EntityManager/Repository，不修改 core 的歧义拒绝，不用单文件单进程隔离把泄漏藏起来。

修复后跑原始两文件组合、全包串行及不同顺序；本轮没有证明该包所有合跑失败都只有这一种根因。

## 解决记录

- [x] 单文件、组合和显式 cleanup 对照取证；原始测试与业务实现未修。
- [ ] 补 fixture 生命周期登记并复跑原始门禁。
- [ ] 当前仍 Open。
