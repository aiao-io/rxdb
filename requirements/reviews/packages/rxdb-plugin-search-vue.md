# rxdb-plugin-search-vue 深度评审

- 包：`@aiao/rxdb-plugin-search-vue`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

实际比对本组 Angular/React/Vue 三个 src/index.ts，再审查本端运行时实现，重点是effectScope 释放、props/ref 身份与只读输出。框架原生容器差异按设计归一，不把 inject/use 或事件命名差异当成产品缺陷。

## 核查结果

- [`useSearch`](../../../packages/rxdb-plugin-search-vue/src/use-search.ts)：cloneSearchOptions 的 getter 逐字段读取依赖并复制 collections，能识别原地 pageSize/数组变更。
- [`useSearch`](../../../packages/rxdb-plugin-search-vue/src/use-search.ts)：要求活动 scope；重建时先清旧订阅/handle，scopeDispose 将 active 置空后清理，旧命令 no-op。
- [`useSearch`](../../../packages/rxdb-plugin-search-vue/src/use-search.ts)：四个流输出使用 readonly，query 是唯一可写输出；协议流失败交给 Vue 错误链，clear 抑制重复 watcher 转发。
- 三端都导出运行时 `SearchExecutionError`，共享类型 `SearchHandle/SearchOptions/SearchResult/SearchState` 与本地 `SearchSourceLike/UseSearchReturn` 均齐全；无仅 type 导出错误类的旧问题。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 7 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-search-vue:test`：40 passed (40)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 未新增真实组件故障注入测试；本端实现及同组导出已审，完整后端搜索正确性归属核心 search 包。SSR 不启动交互句柄的差异按本端现有生命周期检查，未做生产SSR构建。
