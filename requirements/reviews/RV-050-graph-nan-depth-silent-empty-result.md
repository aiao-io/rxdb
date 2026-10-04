---
id: RV-050
title: 图查询 NaN 深度被当作成功的空结果
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-050：图查询 NaN 深度被当作成功的空结果

## 问题

🔴 **P2，确认问题，待修复。** 三节点两条边的有效有向图，level=2 明确有两个邻居、maxDepth=2 明确有一条路径；传 Number.NaN 时，findNeighbors、countNeighbors、findPaths 分别成功返回空数组、0、空数组，而不是指出非法深度。

NaN 是 TypeScript number 的有效取值，但不在所声明的层级/最大深度范围内。把它当成“没有邻居/路径”会隐藏调用方数值计算或输入解析错误。

## 根因

[utils.ts](../../packages/rxdb-plugin-graph/src/utils.ts) 的 clamp 只判断 `<min` / `>max`，NaN 两者都不成立，原样返回；normalizeNeighborsOptions / normalizePathsOptions 未检查 NaN。结果 limit 已用 Number.isSafeInteger 验证，但深度没有对应边界。

NaN 随深度绑定进入实际递归 SQL，不再按正常的 depth/level 展开；后端结果被 repository 包装为普通成功，无法区分非法参数与真实不可达。现有边/节点不变量不是失败原因。

## 复验

[实际 wa-sqlite/WASM 图 spec](../../packages/rxdb-plugin-graph/src/__tests__/review-query-nan-depth.spec.ts) 使用实际 RxDB、Graph 插件、SqliteGraphRepository、三节点及两条边，不用 SQL 结果假对象。

**3 failed /2 passed**：[日志](evidence/2026-10-04/generator-graph-miniprogram/graph-nan-depth-repaired.txt)。三种 NaN 查询均 resolve 而非 reject；两个正常整数深度对照通过。初次 fixture 的数据库名超过 VFS 49-byte 限制，导致五例未执行，已经缩短测试名；该初始日志不记为产品查询断言。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-graph:test --args='src/__tests__/review-query-nan-depth.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

在共用规范化入口明确拒绝不能判定范围的 NaN，给出稳定参数错误；不要等 SQL 成功为空才处理。是否拒绝 fractional/Infinity 等其它输入应与公开契约一起明确，本轮没有把所有非整数行为扩写成已复现故障。

保留已经文档化的负值规范化、超过 100 的限制以及 level=0 语义，不盲目把这些既有用法全部改成异常。补 observable/Promise/直接 backend 的同输入对照和整数边界。

## 解决记录

- [x] 真实图的三个失败复验及可达性对照保留。
- [ ] 明确并落实 NaN 深度校验，复跑调用方。
- [ ] 当前 Open，业务实现未改。
