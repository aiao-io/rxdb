# R3-01 Angular required-input / ngc 模板补证结算

日期：2026-10-05（Asia/Shanghai）。**本有界任务交付完成；只补专题证据，不修改原C核销、全对象评级、全仓审阅进度或发布状态。**

## 一、消费与边界

- 现场manifest与真实tar逐文件对照：core、tree/search核心及两个Angular wrapper均0.0.26；`@aiao/rxdb-angular`为0.0.27。Angular core/compiler/compiler-cli/platform-browser 22.2.1，TS 6.0.3，RxJS 7.8.2，Happy DOM 20.14.5。详情见 [环境](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/environment.json)、[现场依赖/peer/入口声明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/onsite-package-declarations.json)、[外部版本](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/external-versions.json)。
- 六个被测tar的SHA等于R2 setup，已安装文件全部匹配原tar；最终冻结6662个安装文件，每个编译/运行前后无漂移。公开裸导入按真实consumer普通NodeNext/ESM入口解析；没有workspace源alias、手工软链、deps改动或假input。
- 真实consumer只读：CompilerHost只将本证据的TS fixture映射到consumer内的**虚拟**文件位置，让普通包解析找到真实tar；该虚拟目录物理不存在。源码及所有输出落在本证据目录。
- 用consumer安装的官方 `@angular/compiler-cli.performCompilation`，不是假编译器；但**未运行独立ngc CLI入口**。strict=true / strictTemplates=true / skipLibCheck=false；同一个 `consumer.ts` 分别Angular AOT与TS-only emit。JS产物逐字节镜像成 `.mjs`仅声明Node模块格式，SHA/byteIdentical均核对，无业务transform。
- 已先读取三个Nx resolved targets；test包含`^build`，故不启动会扩scope的Nx全套构建/测试。全部31项实际编译/运行/产物校验按指定共享锁串行单Node进程运行，没有Nx heavy task/cache命中，无GUI/容器。
- 源码全文审阅与逐C意见交付继承R2记录；专题证据核销、发布/设备验证分别结算。不能将未完成的运行/发布场景当成未审阅源码。本任务不修改主控153文件或11/403等全仓统计。

## 二、最终严格`.ts`模板正反矩阵

| 模板 | 真实退出 | 诊断数 | 具体诊断 |
| --- | --- | --- | --- |
| consumer.ts：tree父rootId signal、typed输出；search正确source/options父绑定与生命周期组件 | 0 | 0 | 严格ngc正例；真实公开包类型 |
| tree-missing.ts | 1 | 1 | NG8008：缺rootId |
| tree-input.ts | 1 | 1 | TS2322：string不能赋给number |
| tree-event.ts | 1 | 1 | TS2345：number输出不能传给string处理器 |
| search-missing.ts | 1 | 1 | NG8008一条同时列source/options两项缺失 |
| search-input.ts | 1 | 2 | TS2322：number不是SearchSourceLike；TS2559：字符串与SearchOptions没有共同属性 |
| search-event.ts | 1 | 2 | TS2345×2：InputEvent/number不能写入string query |

**1正例、6反例组、8条真实模板诊断。** ngc出错组均无emit；不通过降低strict或skipLibCheck制造绿。全部诊断原文/代码、来源行、类型声明路径见 `compiler-*-ngc-final.json` 与逐命令日志。

## 三、真实运行对照

| 模式 | 退出 | 成功断言 | 已证内容 |
| --- | --- | --- | --- |
| tree AOT正确父模板 | 0 | 14 | numeric零值真正绑定；四helper相同root/level；loading；父signal快切到2；旧promise不覆盖；typed输出；empty/error；销毁四订阅归零 |
| tree TS-only/JIT原式createComponent+setInput | 1 | 0 | `ɵcmp.inputs={}`；先NG0303无法设置rootId，后NG0950。原式未绑定夹具，不是正确父模板产品失败证据 |
| search AOT正确required source父绑定、字段useSearch | 1 | 0 | genuine input metadata存在，父实例source合法；子构造阶段NG0950，source.search调用数0 |
| search AOT正确required options父绑定、字段useSearch | 1 | 0 | genuine input metadata存在，父options有值；首次readOptions阶段NG0950，source.search调用数0 |
| search AOT生命周期调用对照 | 0 | 10 | 两required在ngOnInit可读，runInInjectionContext调用真实helper；真实createSearchHandle种子/DOM输入；options重建保留query；旧订阅释放；错误、clear、销毁 |

24个**不同**成功运行断言，三条红运行命令独立退出1，不把捕获/验证错误转换为产品绿。24个产物一致性核对另列，不重复计入运行断言。

`TreeChild.ɵcmp.inputs.rootId=["rootId",1,null]`（AOT），JIT为`{}`。AOT与JIT使用同源消费者与相同真实tar。仅能建议将初版tree NG0303→NG0950归为该JIT编译/未绑定夹具边界；正确编译父绑定的本次路径未复现产品失败，**不等于tree所有路径正确**。

search两条字段初始化红与既有 [RV-077](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/RV-077-round2-angular-required-search.md)同根因，不新增RV。生命周期绿是合法调用时机/注入上下文对照，不是修改业务或README，不冲销RV-077。

## 四、原日志与夹具陷阱保留

1. 初版`.ts`运行有Node MODULE_TYPELESS_PACKAGE_JSON警告，原日志与源/产物快照保留；最终只镜像原JS字节为`.mjs`，最终运行无该警告，未改manifest或压制warning。
2. `.mts`变体在该实际harness下strictTemplates=true仍接收错输入/错事件（四条真实退出0），缺required仍拒绝。意外绿**不能**作为模板类型通过证据；全部日志保留，仅使用最终`.ts`正反闭合。不展开Angular自身原因，不给两个业务包新增这条RV。
3. 预注册期望与实测诊断不同处明确：search缺source/options合并成一条NG8008，options弱结构类型诊断是TS2559，不伪记两条NG8008或全部TS2322。
4. R2原探针、原红、setter+signal对照都未改动；新绿色不替换它们。[初版required探针](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt)仍为原失败的来源。

## 五、仓储风险/原C仅建议

**主控最新报告**：在另一个真实PGlite三端同fixture中，删除锚点后count=-1，已定位PGlite SQL count(*)-1；SQLite对应clamp0，准备确认候选RV079。当前尚未看到RV079报告文件；登记/真实性全日志/修复归主控。本任务明确引用这条风险，不擅自确认编号。

本tree受控backend中的count=0只验证参数/绑定/订阅，不验证SQL聚合，**不能宣称C1/C2真实仓储全绿**。也不将源码全文审阅/逐C意见交付与剩余动态核销混为一谈。

- tree C4：建议增加父required绑定、输入换代、四资源清理子面证据；完整C归主控。
- tree C5：建议增加typed模板正反与loading/empty/error真实Angular组件子面；真实route/native browser未由本任务证实，不能全C核销。
- tree C1/C2/C3：真实仓储、三端数据/count语义留主控；候选RV079需纳入裁定，不能全绿。
- search C3/C4：正确父绑定下字段required仍是RV-077；生命周期对照不能消除这条风险。
- search C5：模板正反及受控真实handle组件子面可补证；真实SQL/branch+并发分页/route仍不在本任务核销范围。

**不声称**真实SQL、完整同fixture三端、native浏览器router、包级lint/full test/build/coverage四指标、发布/设备通过。未新建可选workspace spec，因为独立真实tar AOT/JIT对照已满足本有界任务，不需要改packages目录。

## 六、真实命令及退出完整账

共31项共享锁测量：退出0为16项，退出1为15项（包含预期模板拒绝/真实运行红）。18次编译、11次运行、1项Nx配置发现（内含3条show project）、1项产物校验。tree三次14断言、search两次10断言均保留实际日志，但最终只记24个不同成功运行断言，不把复跑虚增为62。

所有动作由以下前缀执行（实际完整argv/cwd/elapsed/SHA/HEAD在status JSON）：

```bash
python3 /tmp/rxdb-review-round3-locked.py --name angular-templates/<表中测量名> --scope packages/rxdb-plugin-tree-angular --scope packages/rxdb-plugin-search-angular --scope packages/rxdb-angular -- <表中真实node命令>
```

每命令内HEAD未变；测量跨主控的两个HEAD，不能假称全程同一HEAD。71个scope受控文件与首测SHA一致；所有measurement.changedInputsDuringMeasurement为空。

| 测量名 | 命令摘要（省略node与证据目录前缀；真实完整argv/cwd见状态JSON） | 退出 | 原证据 |
| --- | --- | --- | --- |
| 01-resolved-projects | `Nx resolved配置（三条show project）` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/01-resolved-projects/20261005T150739798193.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/01-resolved-projects/20261005T150739798193.status.json) |
| 02-ngc-valid-initial | `ngc-templates.mjs consumer` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/02-ngc-valid-initial/20261005T151542792056.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/02-ngc-valid-initial/20261005T151542792056.status.json) |
| 03-tree-aot-initial | `runtime-parent-binding.mjs tree-aot` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/03-tree-aot-initial/20261005T151906536076.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/03-tree-aot-initial/20261005T151906536076.status.json) |
| 04-ngc-valid-esm | `ngc-templates.mjs consumer-esm` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/04-ngc-valid-esm/20261005T152101955835.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/04-ngc-valid-esm/20261005T152101955835.status.json) |
| 05-tsc-jit-emission | `ngc-templates.mjs consumer-esm tsc` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/05-tsc-jit-emission/20261005T152108913036.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/05-tsc-jit-emission/20261005T152108913036.status.json) |
| 06-tree-aot-final | `runtime-parent-binding.mjs tree-aot final` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/06-tree-aot-final/20261005T152209863857.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/06-tree-aot-final/20261005T152209863857.status.json) |
| 07-tree-jit-unbound-red | `runtime-parent-binding.mjs tree-jit-unbound final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/07-tree-jit-unbound-red/20261005T152221056149.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/07-tree-jit-unbound-red/20261005T152221056149.status.json) |
| 08-search-field-source-red | `runtime-parent-binding.mjs search-field-source-aot final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/08-search-field-source-red/20261005T152233915209.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/08-search-field-source-red/20261005T152233915209.status.json) |
| 09-search-field-options-red | `runtime-parent-binding.mjs search-field-options-aot final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/09-search-field-options-red/20261005T152236232064.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/09-search-field-options-red/20261005T152236232064.status.json) |
| 10-search-lifecycle-initial | `runtime-parent-binding.mjs search-lifecycle-aot initial` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/10-search-lifecycle-initial/20261005T152237692497.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/10-search-lifecycle-initial/20261005T152237692497.status.json) |
| 11-ngc-tree-missing-red | `ngc-templates.mjs tree-missing-esm` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/11-ngc-tree-missing-red/20261005T152344757638.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/11-ngc-tree-missing-red/20261005T152344757638.status.json) |
| 12-ngc-tree-input-red | `ngc-templates.mjs tree-input-esm` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/12-ngc-tree-input-red/20261005T152350597447.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/12-ngc-tree-input-red/20261005T152350597447.status.json) |
| 13-ngc-tree-event-red | `ngc-templates.mjs tree-event-esm` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/13-ngc-tree-event-red/20261005T152355383381.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/13-ngc-tree-event-red/20261005T152355383381.status.json) |
| 14-ngc-search-missing-red | `ngc-templates.mjs search-missing-esm` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/14-ngc-search-missing-red/20261005T152401024151.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/14-ngc-search-missing-red/20261005T152401024151.status.json) |
| 15-ngc-search-input-red | `ngc-templates.mjs search-input-esm` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/15-ngc-search-input-red/20261005T152405263741.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/15-ngc-search-input-red/20261005T152405263741.status.json) |
| 16-ngc-search-event-red | `ngc-templates.mjs search-event-esm` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/16-ngc-search-event-red/20261005T152409602913.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/16-ngc-search-event-red/20261005T152409602913.status.json) |
| 17-ngc-tree-input-ts-control | `ngc-templates.mjs tree-input` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/17-ngc-tree-input-ts-control/20261005T152552115378.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/17-ngc-tree-input-ts-control/20261005T152552115378.status.json) |
| 18-ngc-valid-ts-final | `ngc-templates.mjs consumer ngc final` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/18-ngc-valid-ts-final/20261005T152755180237.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/18-ngc-valid-ts-final/20261005T152755180237.status.json) |
| 19-tsc-jit-ts-final | `ngc-templates.mjs consumer tsc final` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/19-tsc-jit-ts-final/20261005T152803291098.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/19-tsc-jit-ts-final/20261005T152803291098.status.json) |
| 20-ngc-tree-missing-ts-final | `ngc-templates.mjs tree-missing ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/20-ngc-tree-missing-ts-final/20261005T152810585562.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/20-ngc-tree-missing-ts-final/20261005T152810585562.status.json) |
| 21-ngc-tree-input-ts-final | `ngc-templates.mjs tree-input ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/21-ngc-tree-input-ts-final/20261005T152817996888.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/21-ngc-tree-input-ts-final/20261005T152817996888.status.json) |
| 22-ngc-tree-event-ts-final | `ngc-templates.mjs tree-event ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/22-ngc-tree-event-ts-final/20261005T152836416261.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/22-ngc-tree-event-ts-final/20261005T152836416261.status.json) |
| 23-ngc-search-missing-ts-final | `ngc-templates.mjs search-missing ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/23-ngc-search-missing-ts-final/20261005T152845065821.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/23-ngc-search-missing-ts-final/20261005T152845065821.status.json) |
| 24-ngc-search-input-ts-final | `ngc-templates.mjs search-input ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/24-ngc-search-input-ts-final/20261005T152854286610.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/24-ngc-search-input-ts-final/20261005T152854286610.status.json) |
| 25-ngc-search-event-ts-final | `ngc-templates.mjs search-event ngc final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/25-ngc-search-event-ts-final/20261005T152906995689.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/25-ngc-search-event-ts-final/20261005T152906995689.status.json) |
| 26-tree-aot-ts-final | `runtime-parent-binding.mjs tree-aot ts-final` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/26-tree-aot-ts-final/20261005T153130677866.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/26-tree-aot-ts-final/20261005T153130677866.status.json) |
| 27-tree-jit-unbound-ts-final | `runtime-parent-binding.mjs tree-jit-unbound ts-final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/27-tree-jit-unbound-ts-final/20261005T153133990263.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/27-tree-jit-unbound-ts-final/20261005T153133990263.status.json) |
| 28-search-field-source-aot-ts-final | `runtime-parent-binding.mjs search-field-source-aot ts-final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/28-search-field-source-aot-ts-final/20261005T153149749624.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/28-search-field-source-aot-ts-final/20261005T153149749624.status.json) |
| 29-search-field-options-aot-ts-final | `runtime-parent-binding.mjs search-field-options-aot ts-final` | 1 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/29-search-field-options-aot-ts-final/20261005T153209687202.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/29-search-field-options-aot-ts-final/20261005T153209687202.status.json) |
| 30-search-lifecycle-aot-ts-final | `runtime-parent-binding.mjs search-lifecycle-aot ts-final` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/30-search-lifecycle-aot-ts-final/20261005T153212365700.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/30-search-lifecycle-aot-ts-final/20261005T153212365700.status.json) |
| 31-artifact-verification | `verify-settlement.mjs（24个产物一致性断言，不计为产品运行断言）` | 0 | [原日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/31-artifact-verification/20261005T153440774200.txt) · [状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/31-artifact-verification/20261005T153440774200.status.json) |

[机器结算/全部argv](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/settlement.json) · [24项产物核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/artifact-verification.json) · [官方规范核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/official-docs-summary.md)
