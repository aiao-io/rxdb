from pathlib import Path
import datetime,hashlib,json,re,xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo
root=Path('/Users/jimmy/Documents/aiao/rxdb')
b=root/'requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue'
now=datetime.datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
base=str(b)
pkg=str(root/'packages/rxdb-plugin-replay-vue')
core=str(root/'packages/rxdb-plugin-replay')
scope=json.loads((b/'scope.json').read_text())
notes={
'LICENSE':('MIT正文21行；版权/授权/免责完整，manifest声明MIT一致。许可不是运行时安全或发布验收的证明。',['C5']),
'README.md':('示例用显式ReplayerRef模板ref，props/emits与公开实现一致；52行要求先use再connect；63行卸载仅释放播放器。61行加载前seek承诺与首次函数ref初始化的实测红存在缺口；未承诺任意正文/URL自动脱敏。',['C1','C2','C3','C4','C5']),
'eslint.config.mjs':('继承根规则及Vue recommended，SFC使用TS parser；只关闭组件多词名称规则以保留Replayer公开名称，不等于本轮零警告lint已执行。',['C3','C5']),
'package.json':('根ESM导出/types指向dist/index；发布src与dist且排除原测试/tsbuildinfo；peer为core *、Vue ^3.5.43，core工作区dev依赖存在，sideEffects=false与此层无顶层挂载一致。真实独立Vue consumer仍待发布owner补证。',['C1','C5']),
'project.json':('显式lint为eslint . --max-warnings=0；typecheck依赖build及上游typecheck；已对照当前resolved，test还依赖^build。重要疑点仅跑隔离Nx test，不以部分project.json当完整target。',['C5']),
'src/__tests__/replayer.spec.ts':('7条共享parity+3条Vue补充构成10个原用例：输入delta合并、toRaw同源代理身份、宿主为根元素。mountReplayer为spy，事件手动触发，无法证明真实rrweb/数据库/CAS；命令用例均在mount/nextTick后调用，遗漏首次函数ref时序。未改原测试。',['C1','C2','C3','C4','C5']),
'src/index.ts':('只透传核心恢复提示及事件类型，并导出Replayer/ReplayerRef；已与React/Angular根入口实际导出及原合同对照。Vue无ReplayerProps命名导出不构成能力缺失，不扩导出其他core成员。',['C3','C5']),
'src/replayer.ts':('setup局部handle/applied隔离实例，onMounted一次mount，watch按原门面/标量delta update，onBeforeUnmount destroy并清引用；toRaw保持门面身份。仅转发事件/命令，不操作HEAD/录制/DB release。86–91行先expose，61–70行才建立handle；首次函数ref seek(500)已复验未传到core，父onMounted正向转发正常，交主控P2候选。',['C1','C2','C3','C4','C5']),
'src/vue-shims.d.ts':('通用*.vue声明没有新增any；但ReturnType<typeof defineComponent>不是本组件props/emits负例消费证明，且本包实际组件为TS渲染函数而非SFC/composable。',['C5']),
'tsconfig.json':('以root references连接lib/spec，继承公共strict；ignoreDeprecations仅针对6.0配置弃用。根既有skipLibCheck=true，未更改；历史typecheck不能冒充关闭该跳过后的声明消费者验收。',['C5']),
'tsconfig.lib.json':('rootDir=src、声明输出dist，Vue JSX/bundler解析；排除测试/生成目录并引用core。没有本包strict降级；src/**/*.vue include与shim不证明SFC消费负例通过。',['C5']),
'tsconfig.spec.json':('包含原spec/d.ts与Vite配置，引用lib，Vue JSX与Vitest/Node类型明确；普通test不是严格编译，review evidence探针不在原spec include内，不继承旧typecheck。',['C5']),
'vite.config.mts':('库入口src/index.ts、ES单格式，Vue/@aiao外置，dts保留包名、不转内部alias；测试happy-dom、10条原用例来自include，coverage v8启用且include src/**/*。Codecov仅CI+token，pluginTimings=false仅性能诊断设置；本轮不重测全包coverage/build。',['C1','C3','C5'])
}
records=[]
for i in range(1,5):
 for entry in json.loads((b/f'source-read-{i:02d}.json').read_text()):
  rel=entry['path'].removeprefix('packages/rxdb-plugin-replay-vue/')
  note,cids=notes[rel]
  current=hashlib.sha256((root/entry['path']).read_bytes()).hexdigest()
  assert current==entry['sha256'],entry['path']
  records.append({**entry,'fullTextRead':True,'notes':note,'C':cids,'readMode':'fresh-full-text-displayed-and-inspected'})
assert len(records)==13 and sum(x['lineCount'] for x in records)==572
assert {x['path'] for x in records}=={x['path'] for x in scope['files']}
records.sort(key=lambda x:x['path'])
(b/'file-inspection.json').write_text(json.dumps({'object':'rxdb-plugin-replay-vue','worker':'PKG-replay-vue','inspectedAt':now,'sourceReviewComplete':True,'controlledFileCount':13,'lineCount':572,'oldInventoryIsNotReadingProof':True,'sourceReadingReuseCount':0,'files':records},ensure_ascii=False,indent=2)+'\n')
old=json.loads((root/'requirements/reviews/evidence/2026-10-05/parallel/frameworks/file-inspection.json').read_text())
old_entries=[x for x in old['files'] if x.get('object')=='rxdb-plugin-replay-vue']
assert len(old_entries)==13
assert all(hashlib.sha256((root/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in old_entries)
reuse={'object':'rxdb-plugin-replay-vue','policy':'旧实读且同SHA的真实行区间可以复用；清单、requestedReadRanges或截断输出不升级为全文。','oldSameShaFiles':13,'oldPartialVisibleFiles':sum(x['reviewLevel']=='partial-visible-content' for x in old_entries),'oldNotManuallyInspectedFiles':sum(x['reviewLevel']=='not-manually-inspected' for x in old_entries),'newFreshFullTextFiles':13,'sourceReadingReuseCount':0,'historicalDynamicPolicy':'已测量的11个本包源码/config/test及核心mount/parity SHA相同；README/LICENSE未纳入旧动态输入清单，不叫漂移。旧宿主/根配置/产物并非全部复核，旧门禁仅继承历史测量面，非本轮新执行。'}
(b/'read-reuse.json').write_text(json.dumps(reuse,ensure_ascii=False,indent=2)+'\n')
obs=json.loads((b/'validation-observations.json').read_text());unique=[]
for x in obs['observations']:
 if x not in unique: unique.append(x)
obs['observations']=unique
obs['rawReporterDuplication']='mergeConfig拼接default/junit reporter，原日志有重复呈现；只执行一个Nx target、一个spec、两个用例，不把重复输出加倍计数。'
junit=ET.parse(b/'init-ref-probe/junit.xml').getroot();cases=junit.findall('.//testcase')
assert len(cases)==2 and sum(c.find('failure') is not None for c in cases)==1
obs['junitUniqueCaseCount']=2
(b/'validation-observations.json').write_text(json.dumps(obs,ensure_ascii=False,indent=2)+'\n')
candidate={'localKey':'PKG-replay-vue-init-seek','formalId':None,'status':'reproduced-awaiting-controller-dedup-and-number','proposedSeverity':'P2','owner':'Vue Replay维护者；正式编号/与RV-070去重由主控','title':'首次函数ref回调的seek意图在core handle初始化前丢失','reproductionConfirmed':True,'confirmationBoundary':'真实Vue 3.5.43 + happy-dom，组件到core边界spy；非真实rrweb/存储/发布运行','sourceAnchors':[f'{pkg}/src/replayer.ts:9-10',f'{pkg}/src/replayer.ts:61-70',f'{pkg}/src/replayer.ts:86-91',f'{pkg}/README.md:61'],'freshEvidence':str((b/'validation-observations.json').relative_to(root)),'relatedExistingIssue':'RV-070仅确认React layout effect；本次Vue函数ref是独立复验场景，不直接移植编号','minimalFix':'只保留无handle期最后一次seek，建立handle后交给core；销毁时清意图，play/pause仍空操作。先留失败回归，不改用户API。'}
remaining=[
 {'id':'V1','C':['C1','C3','C4'],'kind':'fix-and-regression','owner':'主控编号/去重；Vue Replay维护者修复','reason':'首次函数ref seek已有红/绿对照，尚未修复和正式编号。','scenarios':['首次函数ref seek(500)保持意图','多个初始化seek仅最后值生效','父onMounted调用保持正向行为','卸载后旧句柄不留下可重放意图'],'evidence':candidate['freshEvidence']},
 {'id':'V2','C':['C1','C4'],'kind':'scenario','owner':'Vue Replay与Replay core维护者','reason':'原包10用例为mount spy；核心浏览器用例正文已读，但本轮未运行真实Vue到rrweb完整链路。','scenarios':['空recording/加载失败/切recording','双播放器独立宿主与卸载','ref/computed/readonly父子输入替换','加载中卸载和晚到结果、多root'],'notRequired':['新增iframe支持','真设备矩阵','把深改门面内部状态当自动reload契约']},
 {'id':'V3','C':['C2'],'kind':'scenario','owner':'Replay core与WorkingTree维护者；Vue层负责结果转发','reason':'源码已对照generation、当前凭据与restore委托；R3-06只核销合法真实PGlite恢复子面，未代验完整点击/并发矩阵。卸载不等于取消已开始的数据库restore。','scenarios':['Vue实际marker点击的dirty/unreachable/并发恢复序列','恢复中卸载不向旧UI回写；底层CAS/操作结果按原core合同','拒绝与reason=error提示正确转发']},
 {'id':'V4','C':['C3'],'kind':'scenario','owner':'Vue Replay可访问性/组件维护者，核心控件维护者协同','reason':'公共API与共同DOM合同已源码对照；parity与本轮初始化spy不是真实键盘/尺寸/三端recording输出验收。','scenarios':['同recording/marker序列三端同语义结果','原生按钮/时间轴键盘操作及错误提示','宿主尺寸变化下控件与回放显示'],'boundary':'只检原支持能力；Vue ref/expose、React ref与Angular实例不要求字面相同。'},
 {'id':'V5','C':['C5'],'kind':'release','owner':'本包发布/公开类型维护者','reason':'源manifest/Vite/dts/exports已读；旧真pack/root resolve不等于typed/runtime消费。原共享tsconfig已skipLibCheck=true，旧绿也不能覆盖探针或独立SFC负例。','scenarios':['最小独立Vue SFC consumer：ReplayerRef、props/emits正例与错误输入负例','readonly/computed模板来源消费','当前产物根ESM运行import与声明编译、peer实际版本对照'],'boundary':'不扩为全框架/真设备/发布大矩阵；本轮不跑全量build/test/coverage，不改strict/依赖。'}
]
items=[
 ('C1','播放器挂载与按需依赖','核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。','空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。','单组件handle在onMounted创建，props只走delta update，host是组件根div；rrweb在core加载时动态import，不由Vue组件调用start。加载中seek在core已有handle时记最后位置，但首次函数ref调用发生在handle创建前，本次已复现丢失意图。',[f'{pkg}/src/replayer.ts:15-20',f'{pkg}/src/replayer.ts:61-89',f'{core}/src/replayer/mount-replayer.ts:108-120',f'{core}/src/replayer/mount-replayer.ts:143-194'],['V1','V2']),
 ('C2','恢复交互与状态','跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。','不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。','Vue只emit核心事件，不触碰HEAD/工作树；core点marker先pause/seek、显示Restoring，再调用restoreToCommit，拒绝/抛错归一为事件结果。restore凭据现取，依赖WorkingTree CAS。generation防旧UI晚回写，不提供数据库restore取消；不能要求卸载撤销已开始的数据操作。R3-06旧投影title候选已被对照排除，不重新报Replay bug。',[f'{pkg}/src/replayer.ts:46-49',f'{pkg}/src/replayer.ts:65-69',f'{core}/src/replayer/mount-replayer.ts:232-267',f'{core}/src/restore.ts:41-56',f'{core}/src/testing/replayer-parity.ts:174-184'],['V3']),
 ('C3','三端可访问性与类型','对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。','同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。','三端共享replay/sessionId/initialTime、时刻与恢复结果、play/pause/seek和同核心DOM。共同透传ReplayerCommitRestoreEvent/replayRestoreHint，Vue expose/ReplayerRef与React ref、Angular实例是框架原生容器，不要求同名Props导出或同生命周期。可访问控件由core负责，parity仅7条边界委托，不是完整UI验收；初始化时序风险按Vue新证据登记。',[f'{pkg}/src/index.ts:10-12',f'{pkg}/src/replayer.ts:38-49',f'{root}/packages/rxdb-plugin-replay-react/src/index.ts:10-12',f'{root}/packages/rxdb-plugin-replay-angular/src/index.ts:10-12',f'{core}/src/replayer/mount-replayer.ts:203-228',f'{root}/specs/005-us-909-session-replay/contracts/replayer-component.md:52-77'],['V1','V4']),
 ('C4','Vue 生命周期与响应式来源','核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。','替换与深改输入、scope 销毁、卸载后晚到结果、多实例；旧订阅释放，新输入生效。','readInputs持续读props而非首次快照，toRaw保持门面身份，按门面引用与两个标量比较；同原对象代理变化不触发reload。父模板ref/computed解包是Vue表达，本包不声明MaybeRef/getter composable；不把门面内部深变动当换会话。setup局部handle/applied，卸载destroy并清引用。core load/destroy推进UI generation、停自有RAF/rrweb；Vue provider的owned DB destroy与播放视图destroy不同所有权。',[f'{pkg}/src/replayer.ts:50-91',f'{pkg}/src/__tests__/replayer.spec.ts:64-87',f'{core}/src/replayer/mount-replayer.ts:156-194',f'{core}/src/replayer/mount-replayer.ts:249-288',f'{root}/packages/rxdb-vue/src/rxdb-vue.ts:86-143'],['V1','V2']),
 ('C5','Vue 类型与 SFC 消费','核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。','vue-tsc consumer、模板输入错误、readonly/computed 来源、独立 pack 消费；没有宽化 any 或丢失 emits 契约。','本包实际是defineComponent TS渲染函数，无泛型composable或自有SFC；props引用core ReplayerOptions，emits与Pick命令类型明确，模板ref用显式ReplayerRef，不拿组件vm类型同React逐字对齐。ESM/declarations/Vue外置与根exports静态一致；vue-shims通用类型不能证明SFC负例。原根strict=true同时skipLibCheck=true，未改变；旧typecheck与实际pack/root解析不等于独立声明/模板/runtime消费，本轮只做运行时边界probe，不伪造strict绿。',[f'{pkg}/src/replayer.ts:9-12',f'{pkg}/src/replayer.ts:36-49',f'{pkg}/src/vue-shims.d.ts:1-5',f'{pkg}/package.json:23-58',f'{pkg}/tsconfig.lib.json:34-39',f'{pkg}/vite.config.mts:23-28',f'{pkg}/vite.config.mts:52-80',f'{root}/tsconfig.base.json:117-123'],['V5'])
]
cs=[]
for cid,title,action,scenarios,conclusion,anchors,rv in items:
 cs.append({'id':cid,'title':title,'originalAction':action,'originalMinimumScenarios':scenarios,'sourceReviewStatus':'complete-original-scope','assessmentDeliveryStatus':'complete-original-scope','sourceConclusion':conclusion,'sourceAnchors':anchors,'scenarioValidationStatus':'partial-original-scope','remainingValidationIds':rv})
(b/'c-evidence.json').write_text(json.dumps({'object':'rxdb-plugin-replay-vue','reviewedAt':now,'originalPlanSnapshot':'baseline/plan.original.md','originalCIds':['C1','C2','C3','C4','C5'],'conclusions':cs},ensure_ascii=False,indent=2)+'\n')
findings=f'''# rxdb-plugin-replay-vue：风险候选交主控

- worker：`PKG-replay-vue`；日期：2026-10-05（Asia/Shanghai）。
- **正式新 RV 编号：未自行分配；新候选 1 个。正式编号和与 RV-070 的去重由主控完成。**
- 下列行为已有最小红/绿复验；编号待决不是“失败未复现”。不把其它框架历史问题直接算作本包确认问题。

## [P2 候选，已复现] 首次函数 ref 的 seek 意图在 handle 建立前丢失

本地定位键：`{candidate['localKey']}`（不是正式问题编号）。owner：{candidate['owner']}。

### 影响与原承诺

`{pkg}/README.md:61` 与 `{pkg}/src/replayer.ts:9-10` 说明加载完成前 `seek` 会记住目标时刻。组件在 setup 暴露命令，但到 `onMounted` 才建立 handle；消费者在首次函数 ref 回调经公开 `ReplayerRef.seek(500)` 初始化时，调用被可选链丢掉，随后 core 未收到该目标。

### 真实复验与边界

- 只执行一个锁内 Nx test target，一个 spec，2 个用例：**1 failed / 1 passed / 0 skipped**；exitCode=1。
- 红：`function-ref:seek → mountReplayer`，mounts=1，实际 seeks=`[]`，期望 `[500]`。
- 绿对照：`mountReplayer → parent-onMounted:seek → handle.seek:500`，mounts=1，seeks=`[500]`。
- `{base}/init-ref-probe/init-ref.spec.ts:40-72`；汇总 `{base}/validation-observations.json`；原日志 `{root/obs['rawLog']}:24-41`。JUnit 确认只有两个 case；重复 stdout/summary 来自 source/merge reporter 拼接，不双算用例。
- 实际 Vue 3.5.43、happy-dom；组件使用当前源码，core 是生命周期边界 spy。证明**Vue 组件未转发初始化 seek**，不冒充真实 rrweb、DOM落位、数据库恢复或发布验证。
- CI=true / NX_DAEMON=false / 单 worker / fileParallelism=false / skipRemoteCache / skipNxCache；共享锁 `/tmp/rxdb-review-heavy-task.lock`，包内13项输入SHA与实读相同，测量中零漂移。排除依赖任务/自动同步以免扩成build或修改原配置，没有skip用例。

### 根因与对照

- `{pkg}/src/replayer.ts:61-70`：handle直到onMounted建立。
- `{pkg}/src/replayer.ts:86-91`：seek直接可选调用，expose早于handle，未保存意图。
- 安装的Vue runtime源码：`{root}/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:1823-1824` 函数ref同步调用，`6224-6225` mounted hook排入post-render；实测顺序吻合，不靠React时序推断Vue。
- RV-070确认的是React首次layout effect。主控可按共同“命令先暴露、handle后安装”根因去重/扩展既有编号，不能仅凭容器字面相同或不同裁定。

### 最小改进与回归

先保留失败回归，只缓存未有handle期间**最后一次seek**，handle建立后传给core；销毁清意图。play/pause仍保留非就绪空操作，不给全部命令加队列，不新增fallback/API。回归首次函数ref、多次初始化seek、父onMounted正向和卸载后旧句柄。**本评审未修业务/原tests。**

## 非本包新增产品问题

- R3-06旧Replay restore标题投影候选已被合法PGlite正/反对照排除；不能复活成Vue bug。数据库投影/CAS其它边界归core/WorkingTree各自原专题。
- R3-03剩余RAF及同轮loader证据仍是fixture/host归属pending；不把全局调度帧算作Vue视图泄漏。
- C5独立SFC/声明/运行消费与其余原场景尚缺验证，按owner单独记账；不能因没有其它新bug或薄wrapper覆盖率高给🟢。
'''
(b/'findings.md').write_text(findings)
closure={'object':'rxdb-plugin-replay-vue','worker':'PKG-replay-vue','date':'2026-10-05','completedAt':now,'sourceReviewComplete':True,'opinionDeliveryComplete':True,'sourceReviewStatus':'complete-original-scope','assessmentDeliveryStatus':'complete-original-scope','CConclusionIds':['C1','C2','C3','C4','C5'],'controlledFileCount':13,'lineCount':572,'rating':'🟡 凑合','ratingReason':'委托、清理和所有权边界清楚；首次函数ref seek存在已复现P2风险候选，且原场景/发布消费证据未全部核销。评审完成不等于修复/发布就绪。','scenarioValidationStatus':'partial-original-scope','releaseValidationStatus':'not-revalidated','remainingValidation':remaining,'confirmedIssues':[],'confirmedIssuesDefinition':'仅列已经由主控正式去重编号的本包问题；本次复现事实见candidates。','candidates':[candidate],'findingsFile':str((b/'findings.md').relative_to(root)),'fileInspection':str((b/'file-inspection.json').relative_to(root)),'CConclusionsFile':str((b/'c-evidence.json').relative_to(root)),'validationEvidence':str((b/'validation-observations.json').relative_to(root)),'freshExecutions':{'nxTests':1,'uniqueCases':2,'passed':1,'failed':1,'skipped':0,'freshFullBuildTestCoverage':False,'freshStrictTypecheck':False,'freshReleaseValidation':False},'sourceUnchanged':True,'originalTestsUnchanged':True,'dependenciesOrIndexEdited':False,'manualGitCommandsExecuted':False,'gitWriteOperations':False,'prescribedHelperGitInventory':'指定锁/进度脚本内建的只读SHA/受控清单检查；未手动执行Git或更改index/commit。','delegationUsed':False,'nextPackageStarted':False,'stopAfterCompletion':False,'nextAuthorizedPackage':'code-editor-vue','singlePackageBoundaryEnforced':True,'outputRoutingNote':'共享锁runner的绝对name末段为packages-only-replay-vue/init-ref-20261005-01，确保日志也只写本包evidence。'}
(b/'closure.json').write_text(json.dumps(closure,ensure_ascii=False,indent=2)+'\n')
header=f'''---
kind: review-plan
object: rxdb-plugin-replay-vue
source_root: packages/rxdb-plugin-replay-vue
created: 2026-10-03
updated: 2026-10-05
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial-original-scope
release-validation: not-revalidated
rating: yellow
worker: PKG-replay-vue
---
'''
plan=header+f'''
# rxdb-plugin-replay-vue：原范围全文评审已交付

**源码全文审阅与原 C 意见交付完成；🟡 凑合。** 不把剩余真实场景、修复或发布门禁混作“源码评审没做”，也不把它们假装通过。

## 1. 范围与冻结

- 仅 `{pkg}`：13 个受控文件、572 行；源码、配置、原测试、README、LICENSE全部正文重读。
- 范围 `{base}/scope.json`；当前重新解析且与旧resolved相同的Nx配置 `{base}/resolved-project.json`；冻结/写入白名单 `{base}/freeze.json`。
- 原计划与结果未丢失：`{base}/baseline/plan.original.md`、`{base}/baseline/results.original.md`。旧计划基线2026-10-03 `2e820521187cbfcd1fe76fb705659fea0a548f0e`；冻结scope引用head `{scope['headAtScope']}`。真正阅读身份以逐文件当前SHA为准，不把共享HEAD推进当本包改动。
- 旧实读且同SHA的真实行区间可复用；旧requestedReadRanges/截断/指纹不算全文。本包旧5片段、8未读，本轮13文件全部fresh全文读取，复用阅读计数0。详见 `{base}/read-reuse.json`。
- 只写本包plan/results及本包evidence；无业务/原tests/依赖/index修改，无Git写操作、无agent、无第二包。

## 2. 原 C（保留动作与最低场景，不缩 scope）

'''
for cid,title,action,scenarios,conclusion,anchors,rv in items:
 plan+=f'''### {cid} {title}

- 原动作：{action}
- 原最低场景：{scenarios}
- **source-review / assessment-delivery：complete-original-scope。** {conclusion}
- 具体源码/测试锚点、已证/未证与owner见本包结果同名{cid}及 `{base}/c-evidence.json`。
- scenario/release未核销项：{', '.join(rv)}；不从源码意见完成推导为原全部场景已通过。

'''
plan+=f'''## 3. 运行与发布证据口径

当前resolved test依赖`^build`、typecheck依赖`build/^typecheck`，不能盲跑扩范围。仅初始化新疑点执行共享锁内最小Nx test（2 case，1红1绿0skip），探针/config/日志只放本包evidence；未跑全量build/test/coverage/lint/typecheck。命令与输入SHA在 `{base}/validation-observations.json`。

旧unit 10 passed与95.23 / 87.5 / 100 / 100四指标仅保留原happy-dom测量面；已测11个包文件与core mount/parity同SHA允许引用历史证据，不宣称当前环境fresh全门禁。旧实际pack/root resolve不是独立typed/runtime消费。共享根strict=true且既有skipLibCheck=true；本轮不改变任何严格性，也不以旧typecheck代替独立声明验收。

## 4. 完成条件分账

- [x] 原13文件全文阅读，当前SHA、行数、完整区间及具体审阅结论登记。
- [x] 原C1、C2、C3、C4、C5逐条实质意见和必要未证owner交付。
- [x] core Replay、Vue provider release所有权、三端公共语义和原测试测量面实际对照。
- [x] 新风险写入本包findings、保留红/绿证据，正式编号交主控。
- [x] source-review / assessment-delivery按原范围结算。
- [ ] 原最低场景全部运行核销：仍partial，见owner表。
- [ ] 缺陷修复与发布消费/严格声明验收：另列，不由此包评审自动执行。

不增加iframe、真设备、发布大矩阵；Vue ref/expose与React/Angular不用字面对齐。单包交付后先更新50包进度/ETA，再按用户新授权的排他队列进入下一包，不成组局部扫读。

结果：`{root}/requirements/reviews/results/packages/rxdb-plugin-replay-vue.md`；机器结算：`{base}/closure.json`。
'''
result_header=header.replace('kind: review-plan','kind: review-execution')
result=result_header+f'''
# rxdb-plugin-replay-vue：全文审阅与逐 C 结算

**source-review / assessment-delivery：complete-original-scope；13/13 文件、572/572 行、原 C1–C5 意见齐全。评级：🟡 凑合。**

本轮发现1个**已复现P2风险候选**：首次函数ref回调的seek意图丢失，正式编号/与RV-070去重交主控。无其它本包新增正式编号。评审交付完成不等于缺陷已修、原全部场景已跑或发布就绪。

## 1. 实读范围、历史对照与执行

四份不截断的正文转录覆盖13文件全行：`{base}/source-read-01.txt` 至 `source-read-04.txt`。`{base}/file-inspection.json`逐文件记录实际阅读SHA、lineCount、fullTextRead、完整readRanges、具体notes和关联C。旧报告只登记5个片段/8个未读；同SHA只允许复用真实旧阅读，不把指纹升格。本轮全部重新实读，旧plan/results已完整存档。

范围/当前Nx配置：`{base}/scope.json`、`{base}/resolved-project.json`。本包受控文件在最小测试锁内13项全部与阅读SHA一致、无漂移；忽略的dist/out-tsc/node_modules不冒充当前源码或fresh产物。

### 唯一 fresh Nx 复验

- 命令、共享锁、环境、当前输入、原日志：`{base}/validation-observations.json`。
- CI=true、NX_DAEMON=false、maxWorkers=1、fileParallelism=false、skipRemoteCache/skipNxCache；排除依赖任务/同步，**只执行一个本包test target、一个evidence spec**，没有build/上游任务/全量test。
- 真实Vue 3.5.43/happy-dom＋core边界spy：**1 failed / 1 passed / 0 skipped**；首次函数ref seek实际`[]`，父onMounted对照`[500]`。不是rrweb时间轴/数据库/严格类型/发布运行。
- `mergeConfig`使原日志default/junit重复呈现，JUnit实际只有两个case；不重复计数。红断言保留，不skip、不改原测试或业务迁就它。
- 为遵守只写本包evidence，指定锁脚本`--name`采用绝对输出路径、末段保留`packages-only-replay-vue/init-ref-20261005-01`；锁和脚本本体不改。

### 历史证据明确限定

旧unit日志 `{root}/requirements/reviews/evidence/2026-10-05/parallel/validation/framework-editor-coverage.txt:9222-9252`为10 passed，四指标95.23 / 87.5 / 100 / 100（原阈值各项80%）。11个实际纳入旧输入的本包源码/config/test与core mount/parity SHA仍相同；README/LICENSE未列旧动态输入，不误报漂移。旧根配置/传递依赖/宿主/发布产物不是全部fresh复验，不能由此宣布当前全门禁绿。原日志节选与输入对照分别为 `{base}/inherited-unit-coverage.txt`、`{base}/inherited-dynamic-input-comparison.json`。

旧pack记录在旧结果存档中，明确只证tarball目标文件/root解析，没有typed consumer或runtime import；不读忽略产物给新发布背书。最小probe没测coverage、lint、strict；类型/发布另交owner。

## 2. 逐原 C 实质结论

'''
for cid,title,action,scenarios,conclusion,anchors,rv in items:
 result+=f'''### {cid} {title}

**源码审阅/意见：已完成原范围；原场景验证：partial。**

- 原动作：{action}
- 原最低场景：{scenarios}

{conclusion}

锚点：
'''
 for anchor in anchors: result+=f'- `{anchor}`。\n'
 if cid=='C1': result+=f'- 原Vue测试 `{pkg}/src/__tests__/replayer.spec.ts:21-60,89-94`；core browser定义 `{core}/src/__tests__/replayer.browser.spec.ts:104-139,254-302`已读，**定义已读不等于本轮运行**。\n'
 if cid=='C2': result+=f'- 核心marker/dirty/error browser定义 `{core}/src/__tests__/replayer.browser.spec.ts:305-371`使用fake ReplayManager，不能证明真实CAS。R3-06源码/归属意见见 `{root}/requirements/reviews/results/packages/rxdb-plugin-replay.md:97-115`。\n'
 if cid=='C3': result+=f'- React `{root}/packages/rxdb-plugin-replay-react/src/replayer.tsx:9-24,50-101`；Angular `{root}/packages/rxdb-plugin-replay-angular/src/replayer.component.ts:45-117`；共同core键盘定义 `{core}/src/__tests__/replayer.browser.spec.ts:236-251`，不借Angular夹具运行宣布Vue全UI通过。\n'
 if cid=='C4': result+=f'- provider当前接口 `{root}/packages/rxdb-vue/src/rxdb-vue.ts:86-143`实际调用`database.destroy()`（不是旧记录笼统“断开”）；工厂/Promise owned，现成实例/Ref caller-owned。Replayer不接管provider或DB生命周期。\n'
 if cid=='C5': result+=f'- 原TS配置 `{pkg}/tsconfig.json:5-14`、`{pkg}/tsconfig.spec.json:11-31`；通用shim并非公开类型消费证明。empty replay/as never只在原spy测试与隔离probe作边界输入，不修改生产类型，不添加any/降strict/skipLibCheck。\n'
 result+=f'\n必要未证与owner：{", ".join(rv)}，详见第4节。\n\n'
result+=f'''## 3. 清理 / 初始化 / 代际 / 隐私的归属边界

1. **视图清理**：Vue只销毁自己的core handle；core destroy幂等、推进generation、停自己的RAF并销毁rrweb。不是录制stop/删除会话/DB release。R3-03全局RAF余帧仍pending，不能冒充本包泄漏。
2. **控制初始化**：公开ref已交给首次函数ref回调时handle尚未建立；seek被丢失。已有handle但core仍loading时的pending seek由core正常保存；不能把两个阶段混为一谈。父onMounted正常，不泛化成Vue所有ref都失效。
3. **两层代际**：core view generation隔离旧load/restore的UI完成；Replay连接纪元由plugin/runtime所有。插件门面在use时建立且跨纪元保持，`not_installed`拒绝未连接调用，状态流按纪元替换（`{core}/src/plugin.ts:48-90`）。组件不自行init/connect/install/自动重连；输入引用与连接纪元不是同一个token。
4. **provider release**：Vue provider销毁自造/等来的DB；外部实例/Ref由调用方拥有。Replayer卸载不会顺手destroy外部DB或停止其它组件使用的录制。
5. **记录隐私**：播放器只调用readEvents/listCommitMarkers/restoreToCommit，不调用start，也不把挂组件当授权。core显式start、已有合法stash续录、epoch释放stop/flush/store destroy见 `{core}/src/manager.ts:101-110,118-147,197-244,281-295`；默认maskAllInputs=true、强制blockSelector见 `{core}/src/options.ts:79-88`。Vue不扩record options，不承诺任意正文/URL自动脱敏；页面授权/同意UI归应用，非本包新增能力，也不要求本包添加iframe/真设备支持。

## 4. 必要未证、修复与发布分账

'''
for v in remaining:
 result+=f'''### {v['id']} · {', '.join(v['C'])} · {v['kind']}

- owner：{v['owner']}。
- 原因：{v['reason']}
- 场景：{'；'.join(v['scenarios'])}。
'''
 if v.get('boundary'): result+=f'- 边界：{v["boundary"]}\n'
 if v.get('notRequired'): result+=f'- 不扩要求：{"；".join(v["notRequired"])}。\n'
 result+='\n'
result+=f'''## 5. 评级与结算

**🟡 凑合 → 初始化seek已有真实边界红；薄wrapper旧覆盖率与其它包绿不能抹掉它 → 先留回归、只缓存最后seek意图，主控去重编号后由本包维护者最小修复。** 其它接口/委托/资源所有权源码清楚，但未测的真实场景/声明消费不装作全绿。

- `{base}/findings.md`：唯一新候选与红/绿证据；正式编号由主控。
- `{base}/c-evidence.json`：原全部C动作、场景、实质结论与锚点。
- `{base}/closure.json`：sourceReviewComplete=true、opinionDeliveryComplete=true、CConclusionIds全5项、评级、未证owner、候选。
- `{base}/file-inspection.json`：13文件572行全文证明；`read-reuse.json`：旧实读/SHA复用口径。

本轮不修改业务、原tests、依赖、index，无手动Git/提交/暂存/重置、无agent。本包交付后仅运行指定`--complete rxdb-plugin-replay-vue`校验/原子更新50包进度与ETA，结算后方可进入用户新授权的下一包；不私自启动队列外包。
'''
for path,text in [(root/'requirements/reviews/packages/rxdb-plugin-replay-vue.md',plan),(root/'requirements/reviews/results/packages/rxdb-plugin-replay-vue.md',result)]:
 tmp=path.with_suffix('.md.tmp');tmp.write_text(text);tmp.replace(path)
for f in scope['files']: assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['sha256']
assert set(re.findall(r'\bC[1-9][0-9]*\b',plan))<=set(closure['CConclusionIds'])
print(json.dumps({'object':'rxdb-plugin-replay-vue','sourceFiles':13,'sourceLines':572,'allSourceReadAndUnchanged':True,'CConclusionIds':closure['CConclusionIds'],'rating':closure['rating'],'freshNxTargets':1,'freshCases':obs['tests'],'formalNumberAssignment':'主控待去重编号','candidateCount':1,'planLines':len(plan.splitlines()),'resultsLines':len(result.splitlines()),'evidence':str(b)},ensure_ascii=False,indent=2))
