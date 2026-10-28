# rxdb-plugin-graph 深度评审

- 包：`@aiao/rxdb-plugin-graph`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。新增确定问题见下文。

## 评审计划与实际范围

先核对图仓储入口、查询参数边界与返回实体身份，再检查邻居去重、路径搜索上限、边写入原子性、实时刷新和物理表名。实际深入读取 `GraphRepository`、`SqliteGraphRepository`、`query_graph_sql`、三类 merge 与 `graph_edge_table_name`。

## 核查结果

- [`GraphRepository.createGraphTask`](../../../packages/rxdb-plugin-graph/src/GraphRepository.ts) 把边实体列入查询依赖，结果指纹纳入 `truncated`；边变化会触发刷新。
- [`SqliteGraphRepository.findPaths`](../../../packages/rxdb-plugin-graph/src/sqlite/SqliteGraphRepository.ts) 在同一只读事务里完成路径枚举和节点回填，并拒绝缺失节点，避免两次查询间删除造成错位。
- [`SqliteGraphRepository.addEdge`](../../../packages/rxdb-plugin-graph/src/sqlite/SqliteGraphRepository.ts) 对无向图双向写入使用同一事务；自环只写一次。
- [`generate_entity_find_paths_sql`](../../../packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts) 以扩展次数上限截断搜索并显式回传元数据；本次未把有上限的枚举当作无限递归误报。

## 问题

### GRAPH-001 [P2] 图查询没有转义节点物理表名中的双引号

**证据**：[`generate_entity_find_neighbors_sql`](../../../packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts)、`generate_entity_count_neighbors_sql`、`generate_entity_find_paths_sql` 均把解析后的节点表名直接嵌入 `FROM "${table_name}"`。[`SqliteGraphRepository.findPaths`](../../../packages/rxdb-plugin-graph/src/sqlite/SqliteGraphRepository.ts) 的节点回填也使用同样拼法。与之对照，[`graph_edge_table_name`](../../../packages/rxdb-plugin-graph/src/sqlite/graph_edge_table.ts) 对边表调用了 `quote_sql_identifier`。

**触发**：图实体配置 `tableName: 'order"line'`，建立合法节点表后调用 `findNeighbors`、`countNeighbors` 或 `findPaths`。核心 [escaping.spec.ts](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/escaping.spec.ts) 已明确把这种表名纳入 CRUD/DDL 支持域。

**预期 / 实际**：应查询 `"public$order""line"`；实际生成 `"public$order"line"`，SQLite 解析失败。已有普通 CRUD 能工作，图查询单独失效。

**实证**：本轮用 TypeScript 转译当前 SQL 生成模块，仅替换表名解析/边表解析依赖，把三个实际生成函数的 SQL 交给 Node `node:sqlite` 内存库执行；三个入口均返回 `syntax error`。这验证了生成器与真实 SQL 解析器的组合，未宣称跑过完整六后端图集成测试。

**修复建议**：统一用 `quote_sql_identifier(get_table_name_by_metadata(...))` 生成一次已转义节点表引用；包括路径节点回填，避免只修 CTE。

**回归建议**：图实体名称保持普通字符串、仅给 `tableName` 加双引号，验证 addEdge 后的三个读入口及只读检出位上的同一组查询。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 20 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-graph:test`：192 passed (192)；目标实际执行。命令及整体边界见[总索引](README.md)。
- SQLite 诊断已复现 GRAPH-001；未对 PGlite 或六个真实浏览器后端逐一复验。路径最优性只审查当前排序与截断实现，不扩展成算法完备性证明。
