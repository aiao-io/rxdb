---
kind: review-execution
created: 2026-10-04
updated: 2026-10-04
baseline_start: 8b29b549ac5758b2e31a6148b98b8c394754e918
execution: in-progress
---

# 2026-10-04 第四批：生成器、图与小程序实际深审

新增 **3 个 P2 确认问题**，更新 **4 个包/应用执行记录**。70 对象已启动、0 个全对象深审完成；本批未将未审完的 C 项标为完成，也不把 Node runner 的小程序接缝复验冒充微信 GUI/真机。

导航：[总计划](deep-review-plan.md) · [当日上一批](execution-2026-10-04-tree-devtools.md) · [本批证据](evidence/2026-10-04/generator-graph-miniprogram/)。

## 1. 已确认意见

| 意见                                                       | 实際问题                                                                 | 本轮证据                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| [RV-049](RV-049-generator-new-output-alias-queue-order.md) | 初次 generated 不存在时，父软链别名拆成两队列；旧请求最后提交覆盖新结果  | 实际生成/文件系统；1 failed /1 passed                     |
| [RV-050](RV-050-graph-nan-depth-silent-empty-result.md)    | NaN 深度被实际图查询成功返回为空/0，隐藏参数错误                         | 实際 RxDB/wa-sqlite；3 failed /2 passed                   |
| RV-051（已修复）                                           | 页面先 unload、open 后完成时迟到 demo 没 dispose，仍继续 query/reconnect | 原页面编译后回调＋明确模块/hooks 接缝；1 failed /1 passed |

全部 Open，未改业务实现，失败断言保留。三个问题的不同测量面/限制各写在报告中。

## 2. 四个对象的实际核查

- [client-generator](results/packages/rxdb-client-generator.md)：输入分析/元数据到 SourceFiles、叶文件 containment、staging/manifest/stale cleanup、物理路径队列。JSDoc terminator 与模板插值已经有安全处理，未把初步注入/任意子路径猜测列成无证据意见。确认 FIFO 的不存在目录别名缺口。
- [graph](results/packages/rxdb-plugin-graph.md)：directed/undirected upsert/remove、两向写事务、neighbors/path 深度与 budget、cycle/回填以及 query task。两向写已有单事务、层级/expansion 已有上限，未报不存在的无限递归/半边写；确认 NaN 没过范围校验。
- [小程序应用](results/apps/dev-rxdb-miniprogram.md)：preflight→runtime/module prepare→connect→activeDemo→page ref、pending dispose/reconnect 与 unload。前一实例释放 barrier 不等于当前 pending open 的取消；确认迟到回调资源归属。
- [小程序 E2E](results/apps/dev-rxdb-miniprogram-e2e.md)：新增 Node 源码回调复验通过现有 Nx Playwright target 运行，没有引入 DevTools fixtures，明确单列测量面。未知 source require 拒绝；不是复制一个手写 start。

## 3. 真实执行结果

| 任务 / 测量面             | 结果                 | 证据                                                                                       |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| generator 整包先行基线    | 38 files /371 passed | [日志](evidence/2026-10-04/generator-graph-miniprogram/rxdb-client-generator-baseline.txt) |
| graph 整包先行基线        | 17 files /184 passed | [日志](evidence/2026-10-04/generator-graph-miniprogram/rxdb-plugin-graph-baseline.txt)     |
| generator FIFO probe      | 1 failed /1 passed   | [日志](evidence/2026-10-04/generator-graph-miniprogram/generator-alias-queue-final.txt)    |
| graph NaN probe           | 3 failed /2 passed   | [日志](evidence/2026-10-04/generator-graph-miniprogram/graph-nan-depth-repaired.txt)       |
| mini page lifecycle probe | 1 failed /1 passed   | [日志](evidence/2026-10-04/generator-graph-miniprogram/mini-page-bootstrap-lifecycle.txt)  |

均禁本地/远端 Nx 缓存、串行/maxWorkers=1；Playwright 新案例 retries=0。coverage 关闭，不用以前 summary 验收新变更。generator 的新失败不被 371 个原测试绿覆盖，graph 同理。

## 4. 取证错误不报成业务缺陷

- generator 最初 spy 错了 default export，后来又把 JS emitter 输出形态误写成 class 字符串断言，分别导致初始 probe 失败。已修测试为实际 completionOrder 与 Alpha/Beta 符号/最终生成文本对照；旧日志保留。
- graph 最初生成的数据库名超过 VFS 49-byte 上限，五例未执行。已改短测试名再执行真实图，未把 fixture 错误写成资源/查询 bug。
- 小程序生命周期 spec 的同意/能力返回与 demo 是接缝。已明确未观测真机句柄数量、未证明原生框架调度；公开页面源中 missing cancellation 的实际回调行为仍能被受控先后证明。
- 范围外的依赖/Cargo/benchmark 等工作区变更保留，不回滚、不格式化、不自动提交。本批仅新增复验测试与评审文档。

## 5. 尚未完成

1. generator 所有公共类型/发布 consumer/浏览器完整链路以及新的多级不存在目录/FIFO 失败重试。
2. graph 深度其它数字形态、全图属性/多后端并发/reactive 失效矩阵。保留已文档化的 negative clamp/上限/0 行为，不擅自全改 RangeError。
3. 小程序真实快速 reLaunch/unload、连接失败、多 start 竞争、dispose 拒绝与各发布档位。历史 DevTools e2e 16 passed 仍只是历史测量面。
4. 其它包/应用按 70 对象索引继续；本批三个意见不等于全仓深审完成。

## 最终门禁与证据快照

四个项目严格零警告 lint /typecheck 均通过：[lint](evidence/2026-10-04/generator-graph-miniprogram/final-lint.txt) / [typecheck](evidence/2026-10-04/generator-graph-miniprogram/final-typecheck.txt)。最终负向重跑保持 generator 1 failed /1 passed、graph 3 failed /2 passed、mini lifecycle 1 failed /1 passed，没有改业务或删除失败断言。

[当轮任务汇总](evidence/2026-10-04/generator-graph-miniprogram/round-results.json) · [源码/版本快照](evidence/2026-10-04/generator-graph-miniprogram/runtime-and-sources.json)。已复核的生产源与开始基线字节相同，未改范围外工作区内容或暂存区。

## 续评索引：2026-10-04 第五批

[Sync /QueryCache 实际深审](execution-2026-10-04-sync-querycache.md)：新增 RV-052/053/054（三个 P2），两个包最终整包 650 passed /5 failed；原有 646 条仍通过。没有修业务、没有覆盖本文件历史测量结果，仍不宣称全仓深审完成。
