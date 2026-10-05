---
id: RV-079
title: PGlite 树计数在锚点不存在或已删除时返回负数
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
---

# RV-079：PGlite 空树计数返回 -1，并向三端发布成功状态

## 问题

**P2，独立实际仓储与三端真实运行确认。** PGlite 的 `countDescendants` / `countAncestors` 对不存在的指定锚点返回 `-1`；正常树锚点删除后，同一活查询亦变为 `-1`。对应数组查询为 `[]`，计数资源却标 `hasValue=true / isLoading=false`，没有错误。

影响是数量 API 违反非负计数/空集契约，树删除后 Angular/React/Vue 的计数 UI 可显示负数；不是数据删除失败、wrapper 生命周期缺陷、旧 registry core 错配或 rrweb 声明故障。

## 根因与锚点

- [PGlite SQL 生成器](../../packages/rxdb-adapter-pglite/src/query/query_tree_sql.ts)：`generate_tree_sql` 的非根计数分支，当前第122–126行无条件 `(count(*) - 1) AS count`。锚点取不到时递归 CTE 0行，减1自然为-1；两种 count 共用此生成器。
- [PGliteTreeRepository](../../packages/rxdb-adapter-pglite/src/repository/PGliteTreeRepository.ts)：`parseCountResult` 只检查安全整数；-1合规返回，查询资源因此发布成功，不代表库计数有效。
- [SQLite 同契约实现](../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts)：第142–147行已明确“节点不存在≡空集”，不会返回负数。此处只作源码对照，没有冒充本轮 SQLite 实测。

## 实测证据

1. 实际0.0.26发布tar安装在工作区外，PGlite内存库真实建表/写入；没有仓储结果mock。`index.js`/声明与当前构建输出字节相同，业务输入指纹未漂移。存在锚点对照的祖先/后代计数各为1；不存在锚点与删除后锚点的两种计数均-1，对应行数组均空。
2. [独立SQL最小复验](evidence/2026-10-05/parallel-round3/tree-real/count-anchor.mjs) 与 [原始失败日志](evidence/2026-10-05/parallel-round3/tree-real/independent-count-anchor/20261005T153041127937.txt)。不存在和删除两组值均先打印后断言，存在节点对照已断言通过；进程exit1。
3. [三端冻结复验](evidence/2026-10-05/parallel-round3/tree-real/fixture-v4.mts) 与 [真实运行原日志](evidence/2026-10-05/parallel-round3/tree-real/triple-framework-v4/20261005T152912281359.txt)：numeric主键0和string UUID各一个真实数据库，每种均同时挂两React根、两Angular注入上下文、两Vue scope。四查询初值、level0、跨父移动与独立适配器SQL对照先通过；删根后六份公共快照和独立SQL均输出descendantCount=-1。3个测试中1通过、2因本缺陷失败，不称整个suite绿。
4. [夹具修订与失败归属](evidence/2026-10-05/parallel-round3/tree-real/fixture-revisions.json)：早期React act窗口、connect前仪器被重绑、log=false关闭变更触发器均已隔离。主控只改自己新增的夹具，原红日志保留。三端probe的独立strict声明检查还有PGlite缺失Emscripten环境类型，另列类型环境缺口；没有靠skipLibCheck/any掩盖，也不将该类型失败当成本计数bug的证据。

以上是Node/happy-dom真实框架与PGlite WASM运行，不是浏览器、设备、持久化崩溃恢复或其他后端矩阵验收。

## 最小修法与验收

非根计数应排除实际存在的锚点，而不是不问CTE是否含锚点就减1；空CTE自然得到0。共享分支同时修两个count，保留根集合、level、where、numeric0/string UUID语义。

新增回归至少覆盖存在叶子、从不存在的锚点、已删除锚点、级联删除后的旧活查询，验证两种计数与直接SQL/对应数组的基数一致。SQLite/PGlite共享空树契约不能只由SQL字符串快照证明。

## 解决记录

- [ ] 最小红例保持可复现
- [ ] 两种计数修复并红转绿
- [ ] 三端计数与全量查询回归通过；不能把报告登记当修复完成
