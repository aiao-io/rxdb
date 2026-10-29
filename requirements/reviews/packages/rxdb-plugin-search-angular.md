# rxdb-plugin-search-angular 深度评审

- 包：`@aiao/rxdb-plugin-search-angular`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。
- 2026-10-29 复核：源码自基线起无变更（git diff 7bb16a9..HEAD 本包为空）；抽查关键符号与报告链接均有效，结论与计数不变。

## 评审计划与实际范围

比对本组三端实际 src/index.ts 的值/类型导出；检查 required signal 未绑定时的读取边界、source/options 改变后的句柄替换、两个 effect 的清理顺序及 ErrorHandler 错误通道。

## 核查结果

- [`useSearch`](../../../packages/rxdb-plugin-search-angular/src/inject-search.ts)：同步可读输入立即 install，未绑定 required input 延迟到 effect；只容忍 NG0950，其他异常仍抛。
- [`useSearch`](../../../packages/rxdb-plugin-search-angular/src/inject-search.ts)：旧 handle 的订阅先退订再销毁；loadMore/clear/retry 现取 active。DestroyRef 清理两个 effect 与订阅。
- [`useSearch`](../../../packages/rxdb-plugin-search-angular/src/inject-search.ts)：结果/state/error/hasMore 通过 asReadonly 暴露；协议流异常交给 ErrorHandler。
- 三端都导出运行时 `SearchExecutionError`，共享类型 `SearchHandle/SearchOptions/SearchResult/SearchState` 与本地 `SearchSourceLike/UseSearchReturn` 均齐全；无仅 type 导出错误类的旧问题。

- initialQuery 用于种子值，活动查询由当前 query 状态驱动；source/options 的配置更换与 query 文本变化使用不同路径，不能把后续 initialQuery 变化未强制覆盖用户输入直接判成丢失更新。

## 问题

本次未发现可给出确定触发链的新增包内问题。

**2026-10-29 复核：**本包源码自基线起无变更；抽查关键符号与链接仍有效，结论不变，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 6 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-search-angular:test`：40 passed (40)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 未新增真实组件故障注入测试；本端实现及同组导出已审，完整后端搜索正确性归属核心 search 包。SSR 不启动交互句柄的差异按本端现有生命周期检查，未做生产SSR构建。
