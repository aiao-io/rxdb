# R2-03：rxdb-plugin-tree-react 待主控确认问题

本次有界实读未新增本包待确认缺陷，未分配 RV。新增测试已冻结。

## 已归属的上游声明消费缺口

主控真实 tarball 裸 valid/invalid 都含 @aiao/utils 的声明错误：`dist/async/nextMacroTask.d.ts` 缺 `NodeJS`（TS2503），`dist/date/msTimeToMilliseconds.d.ts` 缺 `ms` 声明（TS7016）。加显式 `types: [node]` 与真实 `@types/ms 2.1.0` 后 strict/skipLibCheck:false valid0、invalid仅十个消费语义错误、root import0。

裸失败保留于主控 `isolated-consumer-validation-bare.json` 和本包 bare 日志；证据/归属在 `controller-validation.json`。这不是 public declarations 自包含通过，也不谎报为本包泛型失效。主控上游统一定责/去重，不在本对象改依赖或另建 RV。

## 本包边界

- 四 wrapper 仅 method/default/type 委托，无 flat fallback，不读 provider。
- 10/10 新 lifecycle + 6/6 原例由主控实测通过；C4/C5 原最低场景有证据，C1-C3 真实 tree/同 fixture 三端仍 partial。
- 注册期缺插件与 effect 缺静态方法不同，mock 不能替代前者。
- RV-069/070 不属本包；已清理 RV-066/067/068 不重登。
- 不新增测试模式，不等所有 big 包，只交文档/closure。
