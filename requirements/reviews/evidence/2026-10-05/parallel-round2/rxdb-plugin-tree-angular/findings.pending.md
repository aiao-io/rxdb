# R2-02 有界问题登记

当前没有新增 `rxdb-plugin-tree-angular` 确认缺陷或待编号业务候选。16文件实读不能替代新探针执行。

## 证据限制，非新增 RV

1. 第一轮 coverage 100/100/100/100仅覆盖8个语句/4函数/0分支；四个原mock测试断言的是派发参数，不是真实SQL树、默认计数断言或资源cleanup。
2. 历史unit日志有 analog「decorators不在TS program」warning（包括本包setup）；不当成业务缺陷，也不隐藏。主控须确认新增组件probe实际收集/执行8例，警告单独登记。
3. 现有dist产物peer与当前源manifest有时代差异；ng-packagr产物有exports/types/module、旧实际tar root resolve成功，不重登记“源包缺exports”误报。独立typed/runtime consumer、新build待主控。
4. 全量树更新、模板错误与真实route场景尚未验证。它们是原C补证动作，不是已确认缺陷，未测也不改“不适用”。

去重已读取 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/findings-registry.json`，无本包命中。RV-066/067/068为resolved-removed，不重开；其他已分流问题不计成本包新发现。不写旧RV/全仓台账/实现/原tests。
