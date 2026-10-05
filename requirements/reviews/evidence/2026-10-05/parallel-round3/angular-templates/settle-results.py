import collections,hashlib,json,os,pathlib,shutil
root=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
b=root/'requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates'
read=lambda name:json.loads((b/name).read_text())
sha=lambda data:hashlib.sha256(data).hexdigest()
measurements=[]
for file in sorted(b.glob('[0-9][0-9]-*/*.status.json')):
 data=json.loads(file.read_text());data['measurement']=file.parent.name;data['statusFile']=str(file.relative_to(root));measurements.append(data)
assert len(measurements)==31
matrix=[]
for name in ['consumer','tree-missing','tree-input','tree-event','search-missing','search-input','search-event']:
 d=read(f'compiler-{name}-ngc-final.json');matrix.append({'fixture':name,'file':str(b/'fixtures'/f'{name}.ts'),'exitCode':d['exitCode'],'errorCount':d['errorCount'],'diagnostics':[{'code':x['code'],'message':x['message']} for x in d['diagnostics']]})
runtimes={mode:read(f'runtime-{mode}-ts-final.json') for mode in ['tree-aot','tree-jit-unbound','search-field-source-aot','search-field-options-aot','search-lifecycle-aot']}
controller_risk={'candidate':'RV079','reportedBy':'用户转述主控最新测量','registrationObserved':False,'controllerReport':'真实PGlite同fixture锚点删除后count=-1，已定位SQL count(*)-1；SQLite对应clamp0。主控准备确认RV079。','evidenceOwner':'主控；consumer/framework-tests/round3-tree-real，不归本任务','effectOnThisSettlement':'tree C1/C2不能宣称真实仓储全绿；本任务的受控backend count=0只验证绑定/参数/信号/清理，不验证SQL count。'}
recommendations={
 'rxdb-plugin-tree-angular':[
  {'C':'C4','verifiedSubfaces':['真正 input.required<number> 父模板绑定零值','父 signal 1→2换代与旧请求隔离','四资源销毁订阅归零'],'suggestion':'仅将这些局部输入/生命周期子面记为已有动态证据，整体C由主控联审。'},
  {'C':'C5','verifiedSubfaces':['严格ngc正例','required缺输入与输入/事件错误反例','绑定组件loading/empty/error渲染'],'suggestion':'可补模板/实际Angular组件子面；真实route/native browser仍未由本任务验证，不建议全C核销。'},
  {'C':'C1/C2','verifiedSubfaces':[],'suggestion':'不核销真实仓储正确性。引用主控报告的PGlite删除锚点count=-1风险（候选RV079，确认与证据归主控）。'},
  {'C':'C3','verifiedSubfaces':['Angular公开tar声明实际消费'],'suggestion':'三端同fixture数据/统计语义由主控裁定；本任务不声称三端全绿。'}],
 'rxdb-plugin-search-angular':[
  {'C':'C3/C4','verifiedSubfaces':['AOT正确父绑定下required source/options字段初始化均NG0950','ngOnInit+runInInjectionContext消费对照10断言'],'suggestion':'只补RV-077既有根因/时机证据，不新增编号，不以生命周期绿对照冲销正常字段调用红。'},
  {'C':'C5','verifiedSubfaces':['实际UseSearchReturn/SearchOptions/SearchSourceLike声明模板','严格ngc正例、缺输入/错误输入/错误事件反例','受控真实SearchHandle结果/错误/clear渲染'],'suggestion':'补模板和Angular组件子面；route、真实搜索backend、branch+分页全矩阵未由本任务验证，整体C由主控裁定。'}]
}
settlement={'task':'R3-01 Angular tree/search required-input与ngc模板补证','clientDate':'2026-10-05','boundedTaskDelivered':True,'progressAxes':{'sourceFullReview':'继承R2全文审阅与逐C意见交付，不能因剩余运行场景未核销而称未评审；本任务不修改主控全仓统计。','topicEvidence':'本任务最小正反对照已交付，以下仅局部子面建议。','releaseDeviceValidation':'与源码审阅/专题核销分开，未由本任务宣称完成。'},'originalCStatesChanged':False,'fullCClosureClaimed':False,'finalArbitrationOwner':'主控','existingFindingReferences':['RV-077'],'newFindingsRegistered':[],'controllerReportedTreeRisk':controller_risk,'environment':read('environment.json'),'externalVersions':read('external-versions.json'),'templateMatrix':matrix,'runtimeSummary':{k:{'exitCode':v['exitCode'],'assertionCount':v['assertionCount'],'assertions':v['assertions'],'failure':v.get('failure'),'inputMetadata':v['inputMetadata'],'resultFile':str(b/f'runtime-{k}-ts-final.json')} for k,v in runtimes.items()},'distinctPassingRuntimeAssertions':24,'finalInvalidTemplateGroups':6,'finalInvalidTemplateDiagnosticCount':8,'artifactVerification':read('artifact-verification.json'),'allLockedMeasurements':measurements,'exitCodeHistogram':dict(collections.Counter(str(x['exitCode']) for x in measurements)),'headsObserved':sorted(set(x['headAtStart'] for x in measurements)),'unexpectedMtsAcceptances':{name:read(f'compiler-{name}-esm-ngc.json')['exitCode'] for name in ['tree-input','tree-event','search-input','search-event']},'CRecommendationsOnly':recommendations,'notVerified':['ngc CLI独立配置发现（本轮用真实官方performCompilation引擎与fixture-only虚拟CompilerHost）','Angular真实router/native browser/发布应用挂卸','本任务内实际PGlite/SQLite move/delete/count，与全量树查询/三端数据对照','搜索真实SQL/backend、branch切换与分页并发','包级lint/full test/build/coverage四指标与设备验证；没有从24个定向运行断言外推全包绿'],'optionalWorkspaceSpecCreated':False}
(b/'settlement.json').write_text(json.dumps(settlement,ensure_ascii=False,indent=2)+'\n')
rows=[]
for data in measurements:
 cmd=' '.join(data['command'][1:]) if data['command'][0]=='node' else 'Nx resolved配置（三条show project）'
 if data['measurement'].startswith('31-'):cmd='verify-settlement.mjs（24个产物一致性断言，不计为产品运行断言）'
 cmd=cmd.replace('requirements/reviews/evidence/2026-10-05/parallel-round3/angular-templates/','')
 rows.append(f"| {data['measurement']} | `{cmd}` | {data['exitCode']} | [原日志]({root/data['rawLog']}) · [状态]({root/data['statusFile']}) |")
report=f'''# R3-01 Angular required-input / ngc 模板补证结算

日期：2026-10-05（Asia/Shanghai）。**本有界任务交付完成；只补专题证据，不修改原C核销、全对象评级、全仓审阅进度或发布状态。**

## 一、消费与边界

- 现场manifest与真实tar逐文件对照：core、tree/search核心及两个Angular wrapper均0.0.26；`@aiao/rxdb-angular`为0.0.27。Angular core/compiler/compiler-cli/platform-browser 22.2.1，TS 6.0.3，RxJS 7.8.2，Happy DOM 20.14.5。详情见 [环境]({b/'environment.json'})、[现场依赖/peer/入口声明]({b/'onsite-package-declarations.json'})、[外部版本]({b/'external-versions.json'})。
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
| tree TS-only/JIT原式createComponent+setInput | 1 | 0 | `ɵcmp.inputs={{}}`；先NG0303无法设置rootId，后NG0950。原式未绑定夹具，不是正确父模板产品失败证据 |
| search AOT正确required source父绑定、字段useSearch | 1 | 0 | genuine input metadata存在，父实例source合法；子构造阶段NG0950，source.search调用数0 |
| search AOT正确required options父绑定、字段useSearch | 1 | 0 | genuine input metadata存在，父options有值；首次readOptions阶段NG0950，source.search调用数0 |
| search AOT生命周期调用对照 | 0 | 10 | 两required在ngOnInit可读，runInInjectionContext调用真实helper；真实createSearchHandle种子/DOM输入；options重建保留query；旧订阅释放；错误、clear、销毁 |

24个**不同**成功运行断言，三条红运行命令独立退出1，不把捕获/验证错误转换为产品绿。24个产物一致性核对另列，不重复计入运行断言。

`TreeChild.ɵcmp.inputs.rootId=["rootId",1,null]`（AOT），JIT为`{{}}`。AOT与JIT使用同源消费者与相同真实tar。仅能建议将初版tree NG0303→NG0950归为该JIT编译/未绑定夹具边界；正确编译父绑定的本次路径未复现产品失败，**不等于tree所有路径正确**。

search两条字段初始化红与既有 [RV-077]({root/'requirements/reviews/RV-077-round2-angular-required-search.md'})同根因，不新增RV。生命周期绿是合法调用时机/注入上下文对照，不是修改业务或README，不冲销RV-077。

## 四、原日志与夹具陷阱保留

1. 初版`.ts`运行有Node MODULE_TYPELESS_PACKAGE_JSON警告，原日志与源/产物快照保留；最终只镜像原JS字节为`.mjs`，最终运行无该警告，未改manifest或压制warning。
2. `.mts`变体在该实际harness下strictTemplates=true仍接收错输入/错事件（四条真实退出0），缺required仍拒绝。意外绿**不能**作为模板类型通过证据；全部日志保留，仅使用最终`.ts`正反闭合。不展开Angular自身原因，不给两个业务包新增这条RV。
3. 预注册期望与实测诊断不同处明确：search缺source/options合并成一条NG8008，options弱结构类型诊断是TS2559，不伪记两条NG8008或全部TS2322。
4. R2原探针、原红、setter+signal对照都未改动；新绿色不替换它们。[初版required探针]({root/'requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt'})仍为原失败的来源。

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
{chr(10).join(rows)}

[机器结算/全部argv]({b/'settlement.json'}) · [24项产物核对]({b/'artifact-verification.json'}) · [官方规范核对]({b/'official-docs-summary.md'})
'''
(b/'report.md').write_text(report)
common=f'''\n\n## R3-01 Angular 模板补证结算（2026-10-05；仅建议，主控裁定）

本有界任务的最小正反对照已交付；**不修改原C状态/全对象评级/发布结论**。源码全文审阅与逐C意见交付沿用R2记录，专题证据核销、发布/设备验证分开；不把剩余运行场景未核销写成“未评审”。[补证总账]({b/'report.md'})、[全部真实命令/退出/诊断/断言]({b/'settlement.json'})、[现场manifest与声明]({b/'onsite-package-declarations.json'})。

消费版本现场逐项读取：core、tree/search核心与两Angular wrapper 0.0.26，`@aiao/rxdb-angular` **0.0.27**；Angular/compiler-cli 22.2.1、TS6.0.3、RxJS7.8.2。六个已安装包逐文件匹配R2真实tar。真实公开入口，无workspace业务alias、fake input、deps改动。官方规范另存；只用真实compiler-cli.performCompilation与fixture-only虚拟CompilerHost，不冒称CLI入口或v21例子是Nx根。

严格`.ts` ngc正例0诊断，6反例组退出1合计8诊断，strict/strictTemplates=true、skipLibCheck=false。`.mts`尝试意外接收错输入/错事件的四条退出0日志保留，不用于模板核销；最终`.ts`产物字节镜像为`.mjs`，不改manifest/压制warning。31项命令全经指定共享锁串行；71个scope文件无漂移，最终6662个安装文件无漂移。没有Nx heavy task/cache绿、全量build/test、GUI/容器，未新建packages测试文件。
'''
tree=common+f'''
### tree：正确父模板与JIT红严格分开

- [同源父/子消费者]({b/'fixtures/consumer.ts'}) 中是真正`input.required<number>()`，Angular AOT元数据rootId flag=1；父`[rootId]="rootId()"`直接绑定，**不用setInput/setter**。
- [AOT运行]({b/'runtime-tree-aot-ts-final.json'})：退出0、14断言。root=0/level=1到四helper；父signal快切1→2；旧promise不覆盖；numeric输出；loading/empty/error渲染；销毁四primary$订阅归零。
- [同源TS-only/JIT原式运行]({b/'runtime-tree-jit-unbound-ts-final.json'})：退出1、成功断言0；input元数据为空，先NG0303拒绝setInput，后NG0950。结合绿对照，建议原R2这条红归该JIT未绑定夹具边界，**不是正确父模板产品失败证据，更不是tree全产品无缺陷证明**。R2原探针/原红及setter对照均保留未改。
- ngc tree三反例分别退出1：缺rootId→NG8008；string输入→TS2322；number输出传string处理器→TS2345（各1诊断）。[编译正例]({b/'compiler-consumer-ngc-final.json'})及`compiler-tree-*-ngc-final.json`保存声明路径/原诊断。

### 原C建议与未证边界

仅建议将C4的正确父绑定/输入换代/清理、C5的模板正反与上述组件渲染子面补入动态证据；不改原C核销。真实route/native browser、真实SQL及同fixture三端结论归主控。

**主控最新报告的真实PGlite风险必须保留**：另行三端同fixture在锚点删除后count=-1，已定位PGlite `count(*)-1`，SQLite对应clamp0，候选RV079准备由主控确认；本次结算时尚未观察到该RV文件。证据/编号归主控，不在本任务登记。这里backend count=0是受控协议接缝，不能证明仓储count正确，**tree C1/C2不能宣称真实仓储全绿**，C3数据/count三端语义也由主控裁定。没有覆盖率/发布就绪外推。
'''
search=common+f'''
### search：正确AOT父绑定不能冲销RV-077

- [同源父/子消费者]({b/'fixtures/consumer.ts'}) 的source/options都是真实required signal，父模板绑定与AOT signal元数据正确。
- [required source字段初始化]({b/'runtime-search-field-source-aot-ts-final.json'})、[required options字段初始化]({b/'runtime-search-field-options-aot-ts-final.json'})均退出1、成功断言0：分别在`useSearch`的readSource/readOptions同步读取时NG0950；source.search调用数均0。正确父绑定不把输入供应提前到构造期。只补既有 **RV-077** 的AOT与同根因options证据，不重新登记。
- [ngOnInit+runInInjectionContext消费对照]({b/'runtime-search-lifecycle-aot-ts-final.json'})退出0、10断言：两required绑定后可读，真实useSearch/createSearchHandle种子及DOM InputEvent→string query、options重建保留query、旧订阅/handle释放、受控executor错误、clear、销毁清理。是调用时机与注入上下文的消费者对照，**不是业务修复，不冲销字段初始化红**；不声称真实搜索SQL/backend。
- ngc search三反例均退出1：缺source/options→一条NG8008同时列两输入；错source/options→TS2322+TS2559；InputEvent/number写string query→TS2345×2。共有5条诊断，正例0诊断；不是仅tsc或JIT模板猜测。`compiler-search-*-ngc-final.json`保存真实诊断。

### 原C建议与未证边界

建议C3/C4引用既有RV-077及正确父模板下可达的同根因证据，生命周期绿仅补合法调用/销毁子面；C5补严格模板正反与受控真实handle组件渲染。原C结算仍由主控，真实route/native browser、SQL/backend、branch+分页并发、包级门禁/coverage、发布/设备未由本任务证明。源码已全文审阅/逐C意见交付不能因这些未验运行场景被抹成未评审。
'''
append_audit={}
for name,section in [('rxdb-plugin-tree-angular',tree),('rxdb-plugin-search-angular',search)]:
 target=root/'requirements/reviews/results/packages'/f'{name}.md';before=target.read_bytes();marker='## R3-01 Angular 模板补证结算（2026-10-05；仅建议，主控裁定）'
 assert marker.encode() not in before
 appendix=section.encode();(b/f'{name}-r3-append.md').write_bytes(appendix)
 descriptor=os.open(target,os.O_WRONLY|os.O_APPEND)
 try:os.write(descriptor,appendix)
 finally:os.close(descriptor)
 after=target.read_bytes();assert after[:len(before)]==before;assert after[len(before):]==appendix
 old=settlement['environment']['resultsBeforeAppend'][str(target.relative_to(root))]
 append_audit[str(target)]={'bytesBefore':len(before),'bytesAfter':len(after),'sha256Before':sha(before),'sha256After':sha(after),'appendixSha256':sha(appendix),'allCurrentPreexistingBytesPreserved':True,'initialReadPrefixStillMatches':sha(before[:old['bytes']])==old['sha256']}
for cache in ['nx-data','nx-cache']:
 target=b/cache
 if target.exists():shutil.rmtree(target)
(b/'write-scope-audit.json').write_text(json.dumps({'date':'2026-10-05','writeRoots':[str(b)],'onlyExistingFilesAppended':append_audit,'businessOriginalTestsR2ProbesManifestLockDepsIndexNotEditedByThisAgent':True,'optionalTreeSpecCreated':False,'noGitWriteCommands':True,'readOnlyConsumerVirtualDirectoryNotCreated':True,'generatedNxDiscoveryCachesRemovedOnlyWithinOwnEvidence':True},ensure_ascii=False,indent=2)+'\n')
inventory={str(f.relative_to(root)):{'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in b.rglob('*') if f.is_file() and f.name!='file-inventory.json'}
(b/'file-inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')
print('R3-01 evidence delivered: locked measurements=',len(measurements),'exit histogram=',settlement['exitCodeHistogram'],'runtime distinct assertions=24; ngc 6 negative groups / 8 diagnostics; artifact checks=24')
print('Existing result files: append only')
for path,entry in append_audit.items():print(path,'preserved=',entry['allCurrentPreexistingBytesPreserved'],'initialPrefixMatch=',entry['initialReadPrefixStillMatches'])
print('Evidence inventory files=',len(inventory)+1,'root=',b)
