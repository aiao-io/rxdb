# Implementation Plan: BOM 第 9 步

**Branch**: `claude/bom-related-work-77235b` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

现有 BOM 插件增加独立实例安装实体、实例树与追溯查询。实际修订固定于实例，不重新解析主数据。双后端守卫保护物理装机与来源，演示阶段 F 接回同一 SC-100。

## Technical Context

- TypeScript strict、Nx 23、Node 26、pnpm 10；现有 RxDB、SQLite 家族/PGlite、Angular 演示。
- 实例落 bom_instance_node，不复用头/行/发生项，不写主数据可达性表。
- Vitest 双后端真实存储，Playwright 保留原 21 条并新增 2 条。
- 100 节点实例展开/序列点查 p95 <16ms、保存 <100ms；1000 台/10 万节点批量准备单独计时，主数据摘要/结果/计划零变化。
- 入口静态 gzip <50KB；查询模块随调用加载，DDL 连接时加载，完整分块另报。

## Constitution Check

- 质量：strict、零 ESLint 警告、无 any、中文 TSDoc、单责、嵌套最多 3 层。
- TDD：先真实失败测试再实现，插件四项覆盖率 ≥80%，来源保护验证整次回滚。
- UX：加载/空/错误态、标签、键盘操作。既有 Angular 演示扩展符合 US-525，可复用三框架绑定归 US-522。
- 性能：基准覆盖实例关键路径，规模回归证明主数据隔离，测量首屏与分块 gzip。
- 设计后复核：无原则例外；沿用户原始要求继续当前分支，可选中途提交合并到最终验收提交。

## 设计决定

1. 一行代表一次安装。父、实际修订、来源、序列/批次和安装起点固定；拆卸时间必须合法。换父/重装先截止旧行，再新增行，不加稳定实物 ID。
2. serialNumber 全局排他，NULL 不参与；复用 US-030 声明式排他，范围 [installedAt, removedAt)。批次不互斥。
3. 实例无环、序列必填与事实保护走独立节点 DDL。实例错误使用自己的前缀，不进入主数据环的 unionOnly 补算。
4. 仅处理已注册 BomInstanceNode 时装实例与来源 DDL。独立发生项删除与 ECN 状态转移前置守卫覆盖直连 SQL；来源 FK 显式 RESTRICT，计数包括已拆卸历史实例。
5. 发生项仓储删除的来源预检、位号清理和父删除进入同一 executor 事务；事务内不重排队 super.remove。
6. 根来源可空，子节点来源必填；实际修订可与来源预期不同，不限制来源在安装日有效。
7. 查询只连接实例、物料与实际修订；无时点查历史，有时点按半开区间过滤；稳定排序，预算截断显式标记。
8. 当前无 US-510 阶段 B / bom_reach，不在此引入；规模对照现有主数据表与真实解析 SQL 计划。

## Project Structure

```text
packages/rxdb-plugin-bom/src/
  entities.ts / plugin.ts / index.ts / types.ts / repository.ts
  instance.ts
  backend/instance-node-ddl.ts / instance-source-ddl.ts / bom-trigger-ddl.ts
  __tests__/bom-instance*.spec.ts
  testing/scooter-dataset.ts
apps/dev-rxdb-bom/src/app/pages/instances/
apps/dev-rxdb-bom/src/app/bom-demo.service.ts
apps/dev-rxdb-bom-e2e/src/bom-demo.spec.ts
benchmarks/bom.bench.ts
```

## 并行边界

主会话写共享实体/导出/插件/错误并集中跑 Nx。节点与查询、来源保护、演示分别在各自文件并行；先交失败测试，确认红后才实现。禁止多条独立 Nx 构建同时写共享 dist。

## 红阶段记录

2026-10-16：阶段 F 两条 e2e 因缺实例追溯入口失败；共享实体接入后，双后端实例查询缺失、序列化物料缺序列号仍可保存、实例环未拒绝、删除受引用发生项先丢位号均已真实复现。约束名超过 PG 63 字节与直连 INSERT 缺 audit 字段属于装配问题，先修正，不能当作功能红证据。ECN 用例补齐完整分摊后另行确认取消/撤回失败路径。

## 门禁必要修复

来源 fixture 暴露双后端已有发布聚合缺陷：合法比例 `1` 被 `substr(ratio || zeros, 3, 9)` 算成零。保留单工序比例 1 的真实失败回归，以统一整数位缩放修复头发布与 ECN 校验，不引入浮点，也不增加比例 1 特判。复杂 ECN 回滚用例保留两工序各 0.5，保证对子表原子性的覆盖。

通用基准首轮实测快照导出 p95 16.75ms，超出 16ms 参考预算。复用这份失败测量作为性能红阶段；导出排序原先在比较器中重复构造自然键（含日期格式化与 JSON 规范化），改为每行构造一次键再排序，保留原排序和快照语义。使用既有双后端导入导出回归与相同基准复验。

首次打开的空库在 hydrate 时创建 PCBA 的演示修订，但物料尚不存在，导致 COMMIT 外键失败。页面走查和首条 e2e 新增空状态断言已确认红。连接承诺包含 hydrate，使重置等待整段初始化结束；读取状态后仅在已有种子时创建演示数据，壳明确显示连接、失败或未装载种子。保留独立的持久化 A～E→F schema 升级回归，验证已有数据不变。
