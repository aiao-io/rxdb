# BOM 剩余任务收口：真实 PostgreSQL 环约束

## 授权与范围

用户本轮要求完成 BOM 所有任务。本切片先处理 US-509 AC#13 的真实 PostgreSQL 验收；这份规格不把旧的第 10 步范围边界解释成用户需要重复授权。

保持 `cycleConstraintDdlForRemotePg(): string` API、SQLite/PGlite 本地行为及 http/supabase 初始化拒绝规则兼容。测试使用本机 PostgreSQL 在临时目录创建的独立集群，只开放该目录下的 Unix socket，不使用既有数据库、Docker 容器或远端凭据。

## 验收

1. 原样部署导出的 DDL 到 `bom` schema、camelCase 物理列，默认 `search_path=public` 也成功；不靠测试改写 SQL 或创建同义列。
2. Read Committed 两连接并发写入同一作用域的 A→B、B→A：观察第二连接确实等待 advisory lock，先写者提交后后写者重新读到已提交边并拒绝；仅一条边留下。
3. Repeatable Read、Serializable 先建立快照，再由另一连接提交 A→B；其反向边写入均被明确拒绝，消息点名隔离级别。
4. 两连接以相反顺序占有 `(ebom, X)` 与 `(mbom, Y)` 两个作用域：PostgreSQL 报 `40P01` 并中止其中一个事务，两个作用域都保持无环。
5. 自环拒绝；非 consume 边不参与判环；不同类型/组织互不干扰；把已有非 consume 边改成 consume 时同样检查。
6. 服务启动、连接、SQL 或清理失败均使测试失败，不静默跳过。停止并删除测试自己创建的集群，原始命令及红/绿结果由主会话记录。

## 其他剩余范围的原约束

- US-510 B 尚无 `bom_reach` 实体与维护，原文要求 where-used 实测热路径；已有基准只测 `whereUsedInstance`，不能冒充主数据热路径证据。
- US-513 B 要先补批量、输出身份、联合成本分配及下游取成本 AC，原文明确不能仅增加 `produce` 枚举宣称交付。
- US-519 AC#3/#7 依赖 US-030 D 的生成列/表达式/索引方法元数据；GIN 查询计划必须实测，不能假定标量提取等值会自动命中。
- 这些范围由同一次用户授权继续推进，各自单独补齐规格与验证；本文件中的 PG 子任务不声称已经完成它们。
