

## R3-01 Angular 模板补证结算（2026-10-05；仅建议，主控裁定）

本有界任务的最小正反对照已交付；**不修改原C状态/全对象评级/发布结论**。源码全文审阅与逐C意见交付沿用R2记录，专题证据核销、发布/设备验证分开；不把剩余运行场景未核销写成“未评审”。[补证总账](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/report.md)、[全部真实命令/退出/诊断/断言](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/settlement.json)、[现场manifest与声明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/onsite-package-declarations.json)。

消费版本现场逐项读取：core、tree/search核心与两Angular wrapper 0.0.26，`@aiao/rxdb-angular` **0.0.27**；Angular/compiler-cli 22.2.1、TS6.0.3、RxJS7.8.2。六个已安装包逐文件匹配R2真实tar。真实公开入口，无workspace业务alias、fake input、deps改动。官方规范另存；只用真实compiler-cli.performCompilation与fixture-only虚拟CompilerHost，不冒称CLI入口或v21例子是Nx根。

严格`.ts` ngc正例0诊断，6反例组退出1合计8诊断，strict/strictTemplates=true、skipLibCheck=false。`.mts`尝试意外接收错输入/错事件的四条退出0日志保留，不用于模板核销；最终`.ts`产物字节镜像为`.mjs`，不改manifest/压制warning。31项命令全经指定共享锁串行；71个scope文件无漂移，最终6662个安装文件无漂移。没有Nx heavy task/cache绿、全量build/test、GUI/容器，未新建packages测试文件。

### tree：正确父模板与JIT红严格分开

- [同源父/子消费者](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/fixtures/consumer.ts) 中是真正`input.required<number>()`，Angular AOT元数据rootId flag=1；父`[rootId]="rootId()"`直接绑定，**不用setInput/setter**。
- [AOT运行](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-tree-aot-ts-final.json)：退出0、14断言。root=0/level=1到四helper；父signal快切1→2；旧promise不覆盖；numeric输出；loading/empty/error渲染；销毁四primary$订阅归零。
- [同源TS-only/JIT原式运行](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/runtime-tree-jit-unbound-ts-final.json)：退出1、成功断言0；input元数据为空，先NG0303拒绝setInput，后NG0950。结合绿对照，建议原R2这条红归该JIT未绑定夹具边界，**不是正确父模板产品失败证据，更不是tree全产品无缺陷证明**。R2原探针/原红及setter对照均保留未改。
- ngc tree三反例分别退出1：缺rootId→NG8008；string输入→TS2322；number输出传string处理器→TS2345（各1诊断）。[编译正例](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/compiler-consumer-ngc-final.json)及`compiler-tree-*-ngc-final.json`保存声明路径/原诊断。

### 原C建议与未证边界

仅建议将C4的正确父绑定/输入换代/清理、C5的模板正反与上述组件渲染子面补入动态证据；不改原C核销。真实route/native browser、真实SQL及同fixture三端结论归主控。

**主控最新报告的真实PGlite风险必须保留**：另行三端同fixture在锚点删除后count=-1，已定位PGlite `count(*)-1`，SQLite对应clamp0，候选RV079准备由主控确认；本次结算时尚未观察到该RV文件。证据/编号归主控，不在本任务登记。这里backend count=0是受控协议接缝，不能证明仓储count正确，**tree C1/C2不能宣称真实仓储全绿**，C3数据/count三端语义也由主控裁定。没有覆盖率/发布就绪外推。
