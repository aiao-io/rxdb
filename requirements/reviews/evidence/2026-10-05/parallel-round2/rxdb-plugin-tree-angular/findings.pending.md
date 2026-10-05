# R2-02 有界问题登记

当前没有新增 `rxdb-plugin-tree-angular` 确认缺陷或待编号业务候选。16文件实读不能替代新探针执行。

## 证据限制，非新增 RV

1. 第一轮 coverage 100/100/100/100仅覆盖8个语句/4函数/0分支；四个原mock测试断言的是派发参数，不是真实SQL树、默认计数断言或资源cleanup。
2. 历史unit日志有 analog「decorators不在TS program」warning（包括本包setup）；不当成业务缺陷，也不隐藏。主控须确认新增组件probe实际收集/执行8例，警告单独登记。
3. 现有dist产物peer与当前源manifest有时代差异；ng-packagr产物有exports/types/module、旧实际tar root resolve成功，不重登记“源包缺exports”误报。独立typed/runtime consumer、新build待主控。
4. 全量树更新、模板错误与真实route场景尚未验证。它们是原C补证动作，不是已确认缺陷，未测也不改“不适用”。

去重已读取 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/findings-registry.json`，无本包命中。RV-066/067/068为resolved-removed，不重开；其他已分流问题不计成本包新发现。不写旧RV/全仓台账/实现/原tests。

## 主控本轮回写与归属（最新）

- 独立tar root runtime import exit0，四导出齐全。
- bare strict valid和invalid均被utils的NodeJS(TS2503)与ms声明(TS7016)阻断；归属上游公开声明环境，不能称裸typed消费通过。原日志留在isolated-consumer-validation-bare.json。
- 主控显式node并安装@types/ms 2.1.0后，strict + skipLibCheck=false、无paths的valid0、invalid仅两处consumer TS2322；这是明确环境条件下的tree类型contract通过，不是utils声明自包含通过，不等待上游修复。
- R2 unit初次15例13过2失败，新增component input authoring在JIT缺metadata；setInput的NG0303→NG0950，不登记tree业务缺陷。仅新增spec修成Input required setter驱动signal，必须focused复跑；初始失败/告警/100%coverage均保留，不能假绿。

### 原required-input场景不得由替代夹具核销（最终补充）

初版**已证**的是TestBed/JIT未识别输入（NG0303）导致绑定失败，随后读空required signal（NG0950）；**未证**的是正确ngc编译并正确父模板绑定后生产是否仍可达、最终根因归属。此前倾向fixture编译边界的判断仅是证据解释，不是生产不可达结论。setter+signal(0)只恢复其他生命周期测量，不核销原input.required场景。

原夹具快照 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt`，SHA `2859c2fb42ac2232b003b8b05302fa441686139a73a8d7da13e7e820c8838c21`，与主控实际测量SHA匹配=True；原日志保留不删除。独立 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-required-input.mts` 保持 `input.required<number>()` 和tree hook options getter，父组件 `RequiredInputHost` 用模板显式 `[rootId]="rootId()"` 绑定。需主控ngc编译与运行0→7、无NG0303/NG0950对照，R2-02-V6，尚未执行。它不替typed tsc、SQL、route，也不把C4/全对象绿化。
