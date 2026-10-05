

## R3-01 Angular 模板补证结算（2026-10-05；仅建议，主控裁定）

本有界任务的最小正反对照已交付；**不修改原C状态/全对象评级/发布结论**。源码全文审阅与逐C意见交付沿用R2记录，专题证据核销、发布/设备验证分开；不把剩余运行场景未核销写成“未评审”。[补证总账](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/report.md)、[全部真实命令/退出/诊断/断言](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/settlement.json)、[现场manifest与声明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/onsite-package-declarations.json)。

消费版本现场逐项读取：core、tree/search核心与两Angular wrapper 0.0.26，`@aiao/rxdb-angular` **0.0.27**；Angular/compiler-cli 22.2.1、TS6.0.3、RxJS7.8.2。六个已安装包逐文件匹配R2真实tar。真实公开入口，无workspace业务alias、fake input、deps改动。官方规范另存；只用真实compiler-cli.performCompilation与fixture-only虚拟CompilerHost，不冒称CLI入口或v21例子是Nx根。

严格`.ts` ngc正例0诊断，6反例组退出1合计8诊断，strict/strictTemplates=true、skipLibCheck=false。`.mts`尝试意外接收错输入/错事件的四条退出0日志保留，不用于模板核销；最终`.ts`产物字节镜像为`.mjs`，不改manifest/压制warning。31项命令全经指定共享锁串行；71个scope文件无漂移，最终6662个安装文件无漂移。没有Nx heavy task/cache绿、全量build/test、GUI/容器，未新建packages测试文件。

### search：正确AOT父绑定不能冲销RV-077

- [同源父/子消费者](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/fixtures/consumer.ts) 的source/options都是真实required signal，父模板绑定与AOT signal元数据正确。
- [required source字段初始化](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-search-field-source-aot-ts-final.json)、[required options字段初始化](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-search-field-options-aot-ts-final.json)均退出1、成功断言0：分别在`useSearch`的readSource/readOptions同步读取时NG0950；source.search调用数均0。正确父绑定不把输入供应提前到构造期。只补既有 **RV-077** 的AOT与同根因options证据，不重新登记。
- [ngOnInit+runInInjectionContext消费对照](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-search-lifecycle-aot-ts-final.json)退出0、10断言：两required绑定后可读，真实useSearch/createSearchHandle种子及DOM InputEvent→string query、options重建保留query、旧订阅/handle释放、受控executor错误、clear、销毁清理。是调用时机与注入上下文的消费者对照，**不是业务修复，不冲销字段初始化红**；不声称真实搜索SQL/backend。
- ngc search三反例均退出1：缺source/options→一条NG8008同时列两输入；错source/options→TS2322+TS2559；InputEvent/number写string query→TS2345×2。共有5条诊断，正例0诊断；不是仅tsc或JIT模板猜测。`compiler-search-*-ngc-final.json`保存真实诊断。

### 原C建议与未证边界

建议C3/C4引用既有RV-077及正确父模板下可达的同根因证据，生命周期绿仅补合法调用/销毁子面；C5补严格模板正反与受控真实handle组件渲染。原C结算仍由主控，真实route/native browser、SQL/backend、branch+分页并发、包级门禁/coverage、发布/设备未由本任务证明。源码已全文审阅/逐C意见交付不能因这些未验运行场景被抹成未评审。
