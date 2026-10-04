---
id: RV-032
title: Vue 搜索选项原地修改没有重建 SearchHandle
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
---

# RV-032：Vue 搜索选项原地修改没有重建 SearchHandle

**P2 · 确认问题，待修复**；业务实现未在本轮修改。

## 问题

`useSearch` 接受 `MaybeRefOrGetter<SearchOptions>`，文档明确承诺 pageSize/collections 等语义变化会重建句柄。但 `ref({pageSize:10})` 的 `value.pageSize=20`，以及 `ref({collections:['todo']})` 的数组 push，都不触发重建。

## 根因与源码证据

[use-search.ts 的 activate/install](../../packages/rxdb-plugin-search-vue/src/use-search.ts) 监听 `() => toValue(options)`，使用 `{deep:false}`，没有订阅内部字段。`lastOptions = nextOptions` 还保存同一个对象，而 [searchOptionsEqual](../../packages/rxdb-plugin-search/src/core/options-equality.ts) 对同一引用直接返回 true；单独打开 deep 并不足以正确比较前后快照。

## 动态复验

[真实 Vue scope/scheduler＋源码 hook 的复验 spec](../../packages/rxdb-plugin-search-vue/src/__tests__/review-options-mutation.spec.ts) 中两种原地修改均只有一次 search 调用，预期两次；替换整个 Ref 对象的对照用例正常。结果 **2 failed / 1 passed**，见 [日志](evidence/2026-10-03/full-run/vue-search-probe.txt)。SearchHandle 使用测试替身，只证明绑定重建契约，不代证 FTS 后端。

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-search-vue:test --args='src/__tests__/review-options-mutation.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

显式追踪用于重建的字段和 collections 元素，并保存前一份不可变语义快照/键；保留 initialQuery 仅首次播种、重建保留当前 query 的既有契约。补 ref/getter/plain reactive 对象、原地数组编辑、语义不变对象替换与旧句柄释放的三端对照。不建议仅把 deep:false 改为 true。

## 解决记录

- [ ] 保留失败复验/门禁证据并定位最小修法。
- [ ] 修复后复跑关联回归，不用缓存或跳过换绿。
- [ ] 合并后按评审目录清理规则处理；当前仍 Open。
