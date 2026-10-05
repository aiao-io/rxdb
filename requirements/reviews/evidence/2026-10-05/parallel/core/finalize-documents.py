import json,re,pathlib,hashlib
ROOT=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
B=ROOT/'requirements/reviews/evidence/2026-10-05/parallel/core'
V=B.parent/'validation'
scope=json.loads((B/'scope.json').read_text())
inspection=json.loads((B/'file-inspection.json').read_text())
gate=json.loads((V/'coverage-gate.json').read_text())
measurements={x['project']:x for x in gate['measurements']}
logpath=V/'core-plugins-small-adapters-coverage.txt'
log=logpath.read_text(); loglines=log.splitlines()
status=json.loads((V/'core-plugins-small-adapters-coverage-status.json').read_text())
segments={}
starts=list(re.finditer(r'^> nx run ([\w-]+):test[^\n]*',log,re.M))
for n,m in enumerate(starts):
 text=log[m.start():starts[n+1].start() if n+1<len(starts) else len(log)]
 summaries=re.findall(r'^\s*(?:Test Files|Tests)\s+[^\n]+',text,re.M)
 segments[m.group(1)]=[re.sub(r'\s+',' ',x).strip() for x in summaries]
validation={
 'reviewDate':'2026-10-05','head':status['headAtFinish'],'coverageRun':str(logpath.relative_to(ROOT)),
 'cacheDisabled':status['cacheDisabled'],'heavyTaskConcurrency':status['heavyTaskConcurrency'],
 'startedAt':status['startedAt'],'elapsedSeconds':status['elapsedSeconds'],'runExitCode':status['exitCode'],
 'ownProjectResults':{o['object']:{'testSummary':segments.get(o['object'],[]),'coverage':measurements.get(o['object'])} for o in scope},
 'lateSpecsNotCoveredByInitialLintTypecheck':[
  'packages/utils/src/__tests__/lifecycle/review-parallel-acquire-close.spec.ts',
  'packages/utils/src/__tests__/object/review-parallel-clone-array-shape.spec.ts',
  'packages/rxdb-client-generator/src/__tests__/cli/review-parallel-glob-patterns.spec.ts',
  'packages/rxdb-test/src/__tests__/transaction/review-parallel-teardown-rejection.spec.ts'],
 'logExcerpts':[]
}
for i,line in enumerate(loglines,1):
 if any(x in line for x in ['review-parallel-acquire-close.spec.ts','review-parallel-glob-patterns.spec.ts','Public contract OK: 97 exports']):
  validation['logExcerpts'].append({'line':i,'text':line})
rxscope=next(o for o in scope if o['object']=='rxdb-test')
expected={str((ROOT/p).resolve()) for p in rxscope['sourceSha256'] if p.endswith('.ts') and p.startswith(('packages/rxdb-test/src/','packages/rxdb-test/entities/','packages/rxdb-test/shop/')) and not re.search(r'\.(spec|test|suite)\.ts$',p)}
rxsummary=json.loads((V/'core-plugins-small-adapters-coverage/rxdb-test/coverage-summary.json').read_text())
actual=set(rxsummary)-{'total'}
missing=sorted(expected-actual)
validation['rxdbTestDenominator']={'ordinaryCoverageKeys':len(actual),'acceptanceExpectedControlledProductionKeys':len(expected),'missingFromOrdinary':missing,'ordinaryCoverageIsAcceptance':False}
(B/'validation-reconciliation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')

def link(path,label=None):
 return f'[{label or path}]({ROOT/path})'
def src(path,lines=''):
 return f'`{path}{":"+lines if lines else ""}`'
rows={
'utils':[
 ('C1',src('packages/utils/src/index.ts','17-206')+'、'+src('packages/utils/src/@browser/index.ts','10-52')+'：逐个根 barrel 已辨识；polyfill 在函数调用内才写 window，pool 构造仅建 Map，不在导入时开 channel。','已读公开根及浏览器 barrel；统一 lint/typecheck 已执行。','部分核销：入口惰性子面。','其它 barrel/全部叶子未读完；无打包后的 Node/浏览器/tree-shaking consumer 复验。'),
 ('C2',src('packages/utils/src/async/AsyncQueueExecutor.ts','65-90,125-146,178-191')+'：拒绝只结算本任务，finally 推进队列；取消只清等待任务。'+src('packages/utils/src/lifecycle/lifecycle-scope.ts','172-213')+' 逆序全收尾、单错原样、多错聚合、重复释放复用任务；setup 内关闭仍漏资源（候选1）。','本轮 lifecycle 新 spec 1 failed/1 passed；旧队列/生命周期套件本轮运行，但未全篇审读。','部分核销：队列结算/幂等规则、候选1动态确认。','完整 C 还需关闭中排队、任务内再入队与取消后完成的逐场景对照；部分定时器/完整测试正文未审完。'),
 ('C3',src('packages/utils/src/@browser/broadcast-channel-pool.ts','53-83,123-132')+'：每 topic 独立 channel，关闭幂等，不添加自回声。'+src('packages/utils/src/@browser/opfs-route-sync.ts','32-64')+'：init 成功后置位、finally 解锁，并发仅保最后目标。','上述实现全文已读，当前普通 suite 的通过不能充当两个真实 tab/页面卸载证据。','部分核销：明确所有权和路由失败重试子面。','leader-election、persisted-state 正文未读；存储拒绝/乱序/leader 退出真实浏览器面待证。'),
 ('C4',src('packages/utils/src/object/createStableKey.ts','1-54')+' 显式编码 BigInt、Date、hole/undefined/长度，拒绝循环/不识别宿主；'+src('packages/utils/src/object/createQueryOptionsKey.ts','92-105')+' 仅按游标排序字段投影。'+src('packages/utils/src/object/set.ts','1-19,25-47')+' 写前拒危险路径、拒不可写属性。cloneDeep 稀疏数组被 forEach+push 压缩（候选4）。','稳定键、路径写入和 cloneDeep 实现全文已读；候选4新 spec 尚待 supplement，不能声称失败已复现。','部分核销：稳定键/路径防护；候选4静态确定。','clone/相等判断/路径转换全功能域和全部测试未审完；共享内建对象/完整跨框架 key 链未核销。'),
 ('C5',src('packages/utils/src/number/tryToNumber.ts','26-40')+' 保留不能转成有限数的原值；'+src('packages/utils/src/date/msTimeToMilliseconds.ts','29-45')+' 数字不反向格式化、非法毫秒显式拒绝；parseTime 反向区间抛 RangeError，月/年明确近似，未误报成日历算法错误。','对应正文已读；本轮整包其它测试通过不自动证明超安全整数/时区/Unicode/分数索引全部边界。','部分核销：有限数转换与日期工具实际契约。','fractional-indexing、cron、中文/Unicode、完整排序与时区专题未审完，不能完整 C5。'),
 ('C6',src('packages/utils/src/random/randomString.ts','12-17,27-50')+' 使用 getRandomValues + rejection sampling，缺安全源即抛；'+src('packages/utils/src/crypto/getWebCrypto.ts','1-7')+' 不回退；base64Encode 分块避免全量重复复制。OPFS rename 校验后显式 NotSupportedError，不伪装成功。','上述正文已读；普通字符串/二进制工具不能等同加密算法审计。','部分核销：能力拒绝、随机来源和 Base64 分块。','file、RSA/AES 全链及全部编码/巨型输入测试未读完；本轮失败未产出可验收的 utils coverage summary。')],
'rxdb-client-generator':[
 ('C1',src('packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts','82-83,111-178,276-306,403-415,445-475')+'：元数据键是 JSON 元组；标识符、同名实体、barrel 碰撞、getter 冲突在发布 project 前校验；many-to-many 对端必须指回本端。','本轮 374 passed/2 failed；glob 两红来自新 spec，不否定其它已通过场景；元数据→AST 主类全文审读。','部分核销：输入拒绝和项目替换边界。','analyze-file、完整 AST renderer、关系/规则/继承/泛型生成叶子及对应测试未全读；未完整核销所有 C1 最低场景。'),
 ('C2',src('packages/rxdb-client-generator/src/generators/entity-properties.ts','94-119')+'：计算属性不进 InitData；readonly 传到声明；split augmentation 使用 typeof import，sibling import 为 type-only；不会仅靠字符串 export 声称类型等价。','统一69对象 typecheck包含消费者/依赖构建；已读生成属性和主类，不把整个 typecheck 当作生成类型所有负例的证明。','部分核销：已读的字段和 split 类型出口。','规则/关系/Repository 公开方法及 TS 负例未逐一审；三框架真实消费/现有 API 对照未完整核销。'),
 ('C3',src('packages/rxdb-client-generator/src/cli/build-client-lib.ts','44-53,80-185,258-305')+'：输出词法 containment、manifest 去重、stale 软链拒绝、先校验/后 staging/manifest 最后提交；RV-049 最近存在祖先 realpath 的修法已读。单文件 rename 原子不等于整套提交事务，源码已承认提交中途 I/O 风险。','实现全文已读；当前对应旧 spec 被执行，未把 2026-10-04 38 files/371 passed 当本轮。','部分核销：已追 RV-049 修法与写入安全边界。','新 alias 回归全文/两次生成+删实体+I/O 拒绝全验证面未读全；跨进程/提交段半套风险不能以队列或 staging 绿抹掉。'),
 ('C4',src('packages/rxdb-client-generator/src/cli/cli.ts','28-109')+' CLI 按配置目录归一；'+src('packages/rxdb-client-generator/src/plugins/vite.ts','74-85,102-140')+' 明确保留宿主 cwd 锚点，串行重建并报告错误。find-files 只判断 * / ?，字符类/花括号失败（候选2）。','cli.spec.ts 和真实 Vite integration spec 全文已读；本轮 glob 2 failed/1 passed；星号正常，不能把所有 glob 判坏。','部分核销：两种路径基准和 glob 失败面已确认。','含空格/从不同 cwd 的全部最小复验与 repository-generators 测试正文未核完；因此不擅自勾完整 C4。'),
 ('C5',src('packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts','1-32,403-425')+'：内存生成器不写盘；Node fs 在 CLI/Vite 写盘端，不能因为根入口提到 CLI 就猜浏览器必静态引 fs。','构建/typecheck本轮有证据；当前 tests environment=node，真实 Vite integration 是 Node 调构建/服务器，不是浏览器页面生成。','部分核销：内存/文件系统职责边界。','ts-morph-browser 全文、根导出递归闭合、离线真实页面、打包 CLI/bin/子路径 consumer 未完整核销。'),
 ('C6',src('packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts','725-747')+'：split barrel 仅 re-export，避免 TS2459；'+src('packages/rxdb-client-generator/src/plugins/vite.ts','93-98')+' 首次解析前生成。','本轮真实 Vite build/import 和连续改字段测试通过；这是工作区集成，不是实际 pack 的全部子路径承诺。','部分核销：首次生成消费和 split 出口。','README、API baseline、pack 文件和插件 generator 导出全集未逐条对照；失败轮没有本轮完整四指标报告。')],
'rxdb-test':[
 ('C1',src('packages/rxdb-test/src/transaction/bootstrap.suite.ts','56-90')+'：查物理 migration 水位而非内存VFS重连假绿；回滚负例故意提供未建表实体，断言业务表和迁移表都不存在。三套事务 afterEach 吞 dispose 拒绝（候选3），不是持久化后端问题的动态证明。','bootstrap/readiness及 isolation 前段已读；新增故障替身测试捕获实际注册 hook，3边界+3正常，待 supplement。','部分核销：引导判别器、关闭失败判别缺口。','encrypted/sortable/tree/query-cache 全部套件和错误替身未读完；不能仅用正确实现 pass 核销完整 C1。'),
 ('C2',src('packages/rxdb-test/src/testing/sqlite.ts','120-169,179-238')+'：精确影子表后缀、identifier 转义、删除前检查 main 分支恢复前提；事务关闭日志，初始能力行在触发器恢复前补回，finally 再清缓存。seed-lock 对同 key 串行且前次拒绝不拖死后续。','清库/seed-lock/事务factory协议全文已读；本轮主套使用替身，不能声称真实SQLite两轮隔离已证。','部分核销：清库顺序与前置拒绝；候选3待复验。','多连接、失败 teardown、清库两轮和真实动态触发器回收还缺对应宿主证据；已开的 probe.dispose 正常 finally 不与吞错混淆。'),
 ('C3',src('packages/rxdb-test/src/transaction/types.ts','23-102')+'：executor 身份/终态与队列外 query 的协议明确；无具体 adapter import，factory 为结构类型。','类型/构建本轮通过；没有将协议声明本身当所有后端执行通过。','部分核销：共享事务接口与依赖方向。','所有 adapter/Tauri 调用入口和删 rowsAffectedConformanceSuite 后引用未在本子任务逐一核查；真实后端重跑归主控，未核销。'),
 ('C4',src('packages/rxdb-test/src/index.ts','19-26')+' 根重导出同一 cross-framework-fixtures；当前普通覆盖报告列出了 descriptor/live-cursor/search/sync-override 文件，证明其属于当前测量面，不证明三端真实行为一致。','普通 test本轮通过；统一typecheck含三端，但本轮未人工逐行审四个fixture/三端调用测试。','部分：仅入口/测量面核对，语义未核销。','四个fixture和实际Angular/React/Vue同数据失败序列仍待逐行联审；不能据共享导出或框架整包绿打勾。'),
 ('C5',src('packages/rxdb-test/scripts/run-coverage-acceptance.mjs','14-23,54-95,150-166')+'：临时根代次隔离、失败清最终输出、canonical source去重、expected/actual双向相等、四指标≥80；merge分母为src+entities+shop，suite排除。','runner/merge/unit配置已读；本轮普通覆盖'+str(len(actual))+'键/验收预期'+str(len(expected))+'受控生产键，缺'+str(len(missing))+'键，详见 validation-reconciliation.json。','部分核销：合并/分母/失败清理静态边界；普通覆盖面达标。','coverage-acceptance 当前未执行，缺真实合并与故障段/陈旧blob/重复计入负例；普通91.12/91.92/83.22/92.27不能替代验收。runner快照检查需避开并行新增/删除文件。'),
 ('C6',src('packages/rxdb-test/scripts/verify-public-contract.mjs','24-89')+'：8入口与package exports集合精确对应、增删/改种类均报错，root版本/实体数量一致；root导出工具与fixture，suite在独立子路径。package把vitest声明为直接依赖，不能宣称安装无宿主负担。','本轮build日志明确 Public contract OK: 97 exports across 8 entries；NodeNext consumer由build/typecheck执行，但其正文未全审。','部分核销：8子入口运行时形状与现有构建契约。','发布pack清单、无vitest业务安装/消费、全部generated entity/consumer正文未完整审；不得拿同仓dist导入冒充隔离安装。')],
'rxdb-plugin-history':[
 ('C1',src('packages/rxdb-plugin-history/src/redo-stack.ts','47-70')+'：按fingerprint移除已应用项，不按数量错误截栈顶；1000项上限避免无界增长。undo-redo-apply仅读导入，不声称完整撤销会话已审。','本轮31 files/349 passed，redo/scopes普通测试实际执行；正文判别力未全读。','部分核销：作用域redo栈身份子面。','HistoryManager/undo-redo-apply完整状态机、嵌套scope/异常后新写事件-数据对应尚未审完。'),
 ('C2',src('packages/rxdb-plugin-history/src/create-branch.ts')+'、'+src('packages/rxdb-plugin-history/src/remove-branch.ts')+'、'+src('packages/rxdb-plugin-history/src/merge-branch.ts')+'：本轮仅清点，正文未审，不写成已读。','现有branch-topology-atomicity等本轮通过，只提供当前配置下回归结果。','partial：未核销分支拓扑专题。','CAS/requireClean/ABA拒绝位置及拒绝不改拓扑尚未人工追到实现；下一批从拓扑原子性spec与对应函数成对核查。'),
 ('C3',src('packages/rxdb-plugin-history/src/restore-entity.ts','45-76,98-124')+'：先拒非DELETE/无逆补丁/错实体namespace/错分支，再把TrustedWriteIntent绑定独立事务executor；恢复后必须查到行否则显式报错。不是switchBranch关触发器路径。','restore实现全文已读；本轮restore-entity/trusted-write-concurrency等已执行，真实加密+FK级联链未补证。','部分核销：恢复身份、写意图作用域和非空返回边界。','批操作回滚、加密字段不泄露和外键/派生实体真实恢复仍缺；不能以restore mock全部绿完整核销 C3。'),
 ('C4',src('packages/rxdb-plugin-history/src/plugin.ts','25-35,62-64')+'：pushableCount绑定属于连接scope，pullable刷新明确归sync插件；没有同步时不制造假计数fallback。','已审插件所有权；sync-history-bridge/push-inflight仅清点，正文与detached/capture事件未人工追完。','部分：同步计数资源归属已核对。','远端应用不成为本地undo项、跨分支/working-tree真实协作、inflight竞态尚待审，349绿不覆盖全部宿主协议。'),
 ('C5',src('packages/rxdb-plugin-history/src/plugin.ts','41-77')+'：slot最先登记最后撤；manager destroy登记早于init，pushableCount解绑先于manager销毁；scoped插件没有inject而是在首条change前初始化。公开槽位不提供空壳fallback。','插件实现全文已读，统一typecheck与本轮349普通测试通过；声明与实际可选安装的差别明确。','部分核销：插件slot/监听所有权与公开形状。','VersionManager/HistoryManager完整destroy、安装失败/断开重连测试正文和旧consumer实际消费未逐条审；不勾完整 C5。')],
'rxdb':[
 ('C1',src('packages/rxdb/src/RxDB.ts','584-610')+'：构造持有options副本，syncOverrides校验/快照早于实体绑定和写入；管理器、syncState生命周期不同。RV-039旧修复记录保留原日期，本轮尚未人工追完整shutdown。','本轮core:test整包通过，历史2026-10-03生命周期52passed仍仅历史证据。','部分：构造/配置边界已审，完整C1未核销。','connect epoch/依赖调度/插件销毁/异常释放全状态机未逐条读完；不能用当前核心大套代替资源归属检查。'),
 ('C2',src('packages/rxdb/src/RxDB.ts','594-603')+'：覆盖配置在manager创建前快照，解析器与冻结数组共享同一次快照；未把实体数组复用同一原options当已安全绑定证明。','配置入口已读；实体模型本轮编译/测试绿仅证明已有测量面。','部分：配置身份入口已审，mutation链未核销。','entity-manager/identity cache/权限/级联/实例与批量到adapter正文尚未本轮全审；留下一批从保存失败无部分写的真实路径核查。'),
 ('C3',src('packages/rxdb/src/repository/QueryManager.ts')+' 是后续正文锚点（本轮未读）；已核查当前核心普通suite与coverage，不能将历史isEntityMatchWhere查询复验移为当前Repository增量证据。','当前test通过，含skip按原日志登记；当前108源文件的coverage不是全部场景等价证明。','partial：只有当前门禁/測量面；查询语义未核销。','snapshot与增量merge/计数/关系失效/游标真实SQL对照尚未人工深追，正常测试绿不作无漂移反证。'),
 ('C4',src('packages/rxdb/src/rxdb.transaction.ts')+'、'+src('packages/rxdb/src/trusted-write/trusted-write-scope.ts')+'、'+src('packages/rxdb/src/capture/raw-write-gate.ts')+' 是待审正文锚点；已实审history restore将intent绑executor，以及rxdb-test executor结构合同，两者不能替代核心实现。','当前核心套件通过；跨对象真实事务/可信写实现正文未审。','部分：调用端与协议边界审查；核心C4未核销。','核心提交排空/回滚/嵌套并发/raw-write拒绝与捕获安装顺序待成对精审，不以接口文档证明权限隔离。'),
 ('C5',src('packages/rxdb/src/RxDB.ts','70-74')+' 已读迁移/水位入口依赖；'+src('packages/rxdb-test/src/transaction/bootstrap.suite.ts','56-90')+' 的水位/失败回滚判别器已读。imports不是实际拒绝旧客户端的证明。','核心测试通过，bootstrap共享套件最低协议已核对；系统升级实现未全读。','部分：迁移入口及共享判别器已审。','system/migration-runner、capability-watermark正文及整连接链旧schema/插件缺失拒绝尚待补证。'),
 ('C6',src('packages/rxdb/src/backup/backup-queue.ts')+'、'+src('packages/rxdb/src/backup/backup-archive.ts')+' 是本轮未进入正文的锚点；RV-038旧修复+2026-10-03 queue红/绿证据保持原基线，不称本轮修复复验。','核心当前test/coverage通过；原backup队列报告不能替代archive/restore故障边界。','partial：保留历史事实，完整备份专题未核销。','queue/lock/schema/manifest/restore全链及部分写入/取消/文件边界未深追，本轮无“完整备份无丢数据”结论。'),
 ('C7',src('packages/rxdb/src/RxDB.ts','1-74,584-610')+' 与生成器的split augmentation/恢复事务调用端已读；公开consumer类型链本轮实际运行。根index、adapter/plugin出口全集仍未逐条比对。','统一typecheck包含69对象及51依赖任务；核心/生成器/rxdb-test本轮build有执行证据。','部分：当前消费者编译和已读调用边界。','根API全集、内部symbol/testing出口、可选插件缺失连接和真实公开安装尚未完整核销，不能把baseline更新等同兼容证明。')]
}
# 只写本范围的计划/执行记录；已有历史内容及日期/基线保留。
for o in scope:
 name=o['object']; own={p:v for p,v in inspection['files'].items() if p in o['sourceSha256']}
 complete=sum(v.get('fullTextRead',False) for v in own.values()); partial=len(own)-complete
 matrix='| C | 本轮实际审查所得 / 源码锚点 | 验证面 | 核销结论 | 必要待证 / 下一批动作 |\n| --- | --- | --- | --- | --- |\n'
 matrix+='\n'.join('| '+' | '.join(x)+' |' for x in rows[name])+'\n'
 report='\n## 2026-10-05：parallel/core 实审交付\n\n'
 report+='**execution: partial。原计划完整 C 核销为 0；下表“部分核销”只核销已实审子面，不勾原 C，也不等于业务修复/发布就绪。** 未读/必要未测明确保留，覆盖率和当前门禁通过不覆盖未审正文。\n\n'
 report+=f'本轮基线 `{status["headAtFinish"]}` + 当前工作区，2026-10-05（Asia/Shanghai）。scope 受控 {o["trackedFileCount"]} 文件；有正文审读记录 {len(own)} 文件（全文 {complete}、分段 {partial}），不是整对象全文清单。新生成spec另记，不计作已审生产代码。逐区间/版本见 '+link('requirements/reviews/evidence/2026-10-05/parallel/core/file-inspection.json','实际文件审读登记')+'。\n\n'
 report+='### 当前验证（只限其日期、输入与测量面）\n\n'
 report+='- 2026-10-05 统一 strict lint、typecheck 均通过，缓存禁用、主控串行；typecheck包含51依赖任务。输入清单**不含本子任务晚加的4个spec**，不外推这些新文件门禁已绿。'+link('requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json','lint状态')+'；'+link('requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json','typecheck状态')+'。\n'
 report+='- 本轮主控普通test：'+('；'.join(segments.get(name,[])) or '日志中未取得独立摘要，不虚报通过数')+'。'+link('requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt','原始执行日志')+'。整批退出1不等于本对象全部失败，也不把失败测试算通过。\n'
 m=measurements.get(name)
 if m:
  metric=m['metrics'];values='/'.join(str(metric[k]) for k in ['statements','branches','functions','lines'])
  report+=f'- 当前原配置四指标 **{values}%**（S/B/F/L），阈值 {m["threshold"]}% 达标；'+('这是普通src测量面，不是本包coverage-acceptance。' if name=='rxdb-test' else '只证明当前include/exclude分母，不证明完整真实链路。')+link(m['source'],'保留的summary')+'。\n'
 else:
  report+='- 本轮测试失败，未取得可用于本包验收的四指标summary；覆盖率保持未完成，不能沿用旧产物。\n'
 report+='- 2026-10-03/04 原日志、原SHA、原pass/skip继续保留为历史；不称作本轮。晚加 clone-array/teardown spec 的最终结果由主控 supplement 追加，本次写作未取得，不等队列空转。\n\n'
 report+='### C 证据 / 结论表\n\n'+matrix
 report+='\n### 已闭环子面与仍未完成\n\n'
 report+='下表不是再排一次计划：它记录已读实现、正常路径/反证、当前测试结果与确切缺口。**已闭环的是对应子面和门禁事实，不是未读的整 C。** 全对象收尾数仍为0；未完成条件主要是受控正文未全审、必要动态/真实消费或本包验收缺口。\n\n'
 report+='候选问题及最小修法/回归见 '+link('requirements/reviews/evidence/2026-10-05/parallel/core/findings.pending.md','4个待主控去重编号候选')+'；不自分RV、不改现有报告。请求与已完成/待补测边界见 '+link('requirements/reviews/evidence/2026-10-05/parallel/core/validation-requests.json','原验证请求')+'、'+link('requirements/reviews/evidence/2026-10-05/parallel/core/validation-reconciliation.json','当前验证核对')+'。\n'
 record=ROOT/o['record'];text=record.read_text();marker='\n## 2026-10-05：parallel/core 实审交付'
 text=text.split(marker)[0]+report
 record.write_text(text)
 plan=ROOT/o['plan'];text=plan.read_text();marker='\n## 2026-10-05：parallel/core 核销对照'
 text=text.split(marker)[0]
 # 保留原最低复验场景；只更新状态列。
 lines=[]
 for line in text.splitlines():
  if re.match(r'^\| C\d+\s*\|',line):
   cells=line.split('|');cells[-2]=' 部分核销；见2026-10-05证据表 ';line='|'.join(cells)
  lines.append(line)
 text='\n'.join(lines)+'\n\n## 2026-10-05：parallel/core 核销对照\n\n'
 text+='本轮已实际审查与验证，未改原最低复验标准。**原完整C核销0，原完成条件不勾；execution保持in-progress，执行记录保持partial。** “部分核销”仅表示下表中有证据的子面，不把单测红等同未评审，也不把发现一个问题等同完整C。\n\n'
 text+=matrix+'\n本轮验证的日期/基线、测试红绿、coverage测量面与晚加spec边界见 '+link(o['record'],'本对象实际执行记录')+'。继续动作只限上表的必要缺口；本次不新增探针/发现，不等待主控重队列，supplement最终结果由主控追加。\n'
 plan.write_text(text)
# 更新已动态确认候选；晚加两组仍保持未动态验证。
p=B/'findings.pending.md';text=p.read_text().replace('以下是静态确定的缺口，新增复验均**尚未运行**。','候选1/2已经主控2026-10-05首次批动态复验；候选3/4仅静态确定、晚加spec待supplement。本文件不分配RV，编号由主控复验去重处理。')
text+='\n## 2026-10-05 首批验证状态补记\n\n- 候选1：`review-parallel-acquire-close.spec.ts` **1 failed /1 passed**；断言cleanup执行1次，实际0次。本轮动态确认，不代表完整生命周期C已审完。\n- 候选2：`review-parallel-glob-patterns.spec.ts` **2 failed /1 passed**；字符类/花括号返回字面路径，普通星号正常。本轮动态确认。\n- 候选3/4：晚加，首次批输入/日志不含其执行结果，保持静态结论；主控supplement再补实际红绿。\n- 原始证据：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；已提取行号在 `validation-reconciliation.json`，原日期与SHA保留。\n'
p.write_text(text)
for v in inspection['generatedValidation']:
 if 'acquire-close' in v['path']: v['status']='controller-validated-2026-10-05-1-failed-1-passed'
 if 'glob-patterns' in v['path']: v['status']='controller-validated-2026-10-05-2-failed-1-passed'
 if 'clone-array' in v['path'] or 'teardown-rejection' in v['path']:v['status']='late-generated-await-controller-supplement'
inspection['validationEvidence']={'parsedStatusAndSummaryFiles':['requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json','requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json','requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage-status.json','requirements/reviews/evidence/2026-10-05/parallel/validation/coverage-gate.json'],'logReadMode':'仅摘要/命中片段与行号，不把整2800行日志标全文读','reconciliation':'requirements/reviews/evidence/2026-10-05/parallel/core/validation-reconciliation.json'}
(B/'file-inspection.json').write_text(json.dumps(inspection,ensure_ascii=False,indent=2)+'\n')
summary={'reviewDate':'2026-10-05','completeObjects':[],'fullyClosedOriginalC':[],'allObjectsExecution':'partial','partialCCount':sum(len(x) for x in rows.values()),'findings':[{'candidate':f'CORE-PENDING-{n}','priority':'P2','state':'dynamically-confirmed' if n<=2 else 'static-confirmed-await-supplement'} for n in range(1,5)],'remainingValidation':['rxdb-test:coverage-acceptance（src+entities+shop）','晚加clone-array/teardown聚焦supplement','4个新增spec的lint/typecheck补充门禁','utils/generator整包四指标coverage（首次批红测试未产出验收summary）'],'objects':[],'changedFiles':[x[k] for x in scope for k in ['plan','record']]}
for o in scope:
 own={p:v for p,v in inspection['files'].items() if p in o['sourceSha256']}
 summary['objects'].append({'object':o['object'],'controlledScopeCount':o['trackedFileCount'],'actualBodyReadFiles':len(own),'fullTextFiles':sum(v['fullTextRead'] for v in own.values()),'originalCComplete':[],'execution':'partial'})
summary['changedFiles'] += ['packages/utils/src/__tests__/lifecycle/review-parallel-acquire-close.spec.ts','packages/utils/src/__tests__/object/review-parallel-clone-array-shape.spec.ts','packages/rxdb-client-generator/src/__tests__/cli/review-parallel-glob-patterns.spec.ts','packages/rxdb-test/src/__tests__/transaction/review-parallel-teardown-rejection.spec.ts']
summary['changedFiles'] += [str(p.relative_to(ROOT)) for p in B.iterdir() if p.name!='scope.json' and p.name!='delivery-summary.json']
summary['changedFiles'].append('requirements/reviews/evidence/2026-10-05/parallel/core/delivery-summary.json')
(B/'delivery-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'writtenDocuments':10,'fullOriginalCClosed':0,'partialC':summary['partialCCount'],'objects':summary['objects'],'rxdbTestOrdinaryVsAcceptance':{'actual':len(actual),'expected':len(expected),'missing':len(missing)},'ownChangedFiles':len(summary['changedFiles'])},ensure_ascii=False,indent=2))
