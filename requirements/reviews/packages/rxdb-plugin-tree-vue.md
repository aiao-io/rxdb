# rxdb-plugin-tree-vue 深度评审

- 包：`@aiao/rxdb-plugin-tree-vue`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

实际比对本组 Angular/React/Vue 三个 src/index.ts，再审查本端运行时实现，重点是effectScope 释放、props/ref 身份与只读输出。框架原生容器差异按设计归一，不把 inject/use 或事件命名差异当成产品缺陷。

## 核查结果

- [`useFindDescendants`](../../../packages/rxdb-plugin-tree-vue/src/use-tree.ts) 与 `useCountDescendants/useFindAncestors/useCountAncestors` 全部直接调用本端核心 `useRepositoryQuery`，方法名没有互换。
- 列表默认值为 `[]`，计数为 `0`，输入与返回值继续使用核心 `EntityStaticType` 和本端 `RxDBResource`，本层未另建查询状态机。
- 三个 index.ts 的四个运行时导出集合完全一致；没有添加单端专属功能面。
- 生命周期、错误和 options 追踪委托 `@aiao/rxdb-vue`，本层没有额外订阅需要释放。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 上游问题

where 不匹配的基准根新增后实时结果不更新，归属 [rxdb-plugin-tree：TREE-001](rxdb-plugin-tree.md)。三端都可能受影响，此处不重复计数。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 5 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-tree-vue:test`：35 passed (35)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 本层薄包装没有发现独立缺陷；委托层与后端语义仍需组合测试，不能从四个正确方法名推导出树增量始终正确。
