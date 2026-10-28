# rxdb-plugin-search 深度评审

- 包：`@aiao/rxdb-plugin-search`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

从 `createSearchHandle` 的查询泵、分页、数据变更重查和销毁入手，追到 SQLite FTS/contains SQL 与结果归并；核查查询长度、参数数量与返回状态边界。

## 核查结果

- [`createSearchHandle`](../../../packages/rxdb-plugin-search/src/core/search-handle.ts) 通过单个 pump 串行执行，page-0 重查优先于排队的 loadMore，clear/destroy 同时推进 generation 并中止活动请求。
- 同一入口的 `loadMore` 只有 `success && hasMore` 才入队，失败走 `SearchExecutionError` 状态而非把 Promise 异常丢给全局。
- [`createSearchEngine`](../../../packages/rxdb-plugin-search/src/core/search-engine.ts) 对绑定参数数量设门禁，contains 扫描先检查源表总行数上限；FTS 结果非空时不额外扫 contains。
- [`buildFieldContainsSql`](../../../packages/rxdb-plugin-search/src/core/search-engine.ts) 将列名交给标识符转义、查询词走参数；本次未将 token 内容插进 SQL。
- [`createSearchHandle`](../../../packages/rxdb-plugin-search/src/core/search-handle.ts) 在销毁后结清 pending 请求的等待者，避免调用方永久挂在已丢弃的排队请求上。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 41 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-search:test`：302 passed (302)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 未逐后端重跑 FTS 安装/迁移、PG 搜索排序及真实浏览器数据变更压力测试；已读的 SQLite 查询实现与句柄状态机是本次结论的主要边界。
