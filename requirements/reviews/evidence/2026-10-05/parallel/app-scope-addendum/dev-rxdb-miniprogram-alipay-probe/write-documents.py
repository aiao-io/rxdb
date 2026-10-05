from pathlib import Path
import json,re
root=Path('/Users/jimmy/Documents/aiao/rxdb')
base=root/'requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum'
apps=['dev-rxdb-miniprogram-alipay-probe','dev-rxdb-miniprogram-douyin-spike']

def anchor(app,p,n):return f'`{root / "apps" / app / p}:{n}`'
def item(c,title,anchors,conclusion,gap):return {'C':c,'title':title,'anchors':anchors,'conclusion':conclusion,'status':'部分实审；未完整核销','necessaryUnverified':gap}

for app in apps:
 e=base/app;ins=json.loads((e/'file-inspection.json').read_text());a=lambda p,n:anchor(app,p,n)
 alipay='alipay' in app
 if alipay:
  rows=[
   item('C1','真实应用身份、入口与SDK边界',a('static/app.json','2–6')+'；'+a('src/page.ts','47–80')+'；'+a('src/run-probe.ts','54–75,185–207,223–259')+'；'+a('src/core.ts','79–85'), '这是已存在的支付宝逻辑层原生应用，页面启动即编排实验；核心包是字面量懒require。正式host走SDK公开入口，内部指纹/帧头经official-host源码桥接。core实际调用createWaSqliteMiniProgramClient和SQL，不是完整RxDB仓库/历史/加密业务验证。私有、实验性不构成免审理由。', '未核对全部API接口/环境采集/所有fixture；当前源码资源版本与DevTools/iOS/Android的整应用启动、重复运行和卸载取消未本轮实测。'),
   item('C2','构建、代码包资源及版本闭合',a('scripts/build.mjs','23,131–195')+'；'+a('src/official-host.ts','7–26')+'；'+a('src/experiments/wasm.ts','43–66')+'；'+a('static/mini.project.json','2–7'), '构建用@aiao/source、ES2018，复制同一依赖的WASM及base64文本副本，随机Worker从SDK公共子入口原样复制，app声明Worker且IDE忽略其转译。旧SDK指纹问题已由外部修复、主控复验通过，只作历史说明，不另编号、不挂已删除RV链接。读取时及收束存在性核对均未找到所import的根subframe-realm.mjs；这是静态构建输入缺口，尚未动态执行build。', '主控当前lint/typecheck=0不能代替Node构建/产物闭合；缺helper需确认/补证，修复后核对binary与文本副本、worker脚本、banner/错误包装、干净构建与VM smoke。未复跑真实代码包/设备，不使用旧dist补绿。'),
   item('C3','realm、引导与安全随机',a('scripts/build.mjs','61–115')+'；'+a('src/run-probe.ts','157–165,210–235,295–303')+'；'+a('src/experiments/random.ts','52–70'), 'banner用候选realm检查、临时Object.prototype getter在finally删除；正式host自行找全局。Runner先完成引导探测的结算，再加载core，不能把probe失败说成成功引导。Worker探测失败保留skip/error，最终terminate；随机只观察64KiB/1MiB结果，未发现Math.random降级。随机统计不构成设备熵来源证明。', '环境采集/repair快照完整实现尚未读完；原生随机API与限额、无真实realm/缺BigInt/回调超时/耗尽、页面卸载和Worker在途资源需宿主/完整现有测试补证。'),
   item('C4','文件、持久化与配额失败',a('src/core.ts','88–147,151–216')+'；'+a('src/run-probe.ts','127–137,237–263')+'；'+a('src/experiments/quota-accounting.ts','95–175')+'；'+a('src/alipay-fs.ts','43–69'), '辅助FS不分帧，只用于原始实验、清理和列文件；adapter用正式host帧头FS。持久化参数绑定，写-关-重开比较行和integrity；配额用zeroblob，不消耗安全随机池，撞满后不先删库而直接重开。目录限制在固定实验子目录，cleanup结果入报告；unexpected异常下不能把正常路径rmdir夸成总在finally清理。', 'raw/fs-errors、全部失败/残留/内存压力分支与接口尚未全读；默认60MiB写计划和裸文件72MiB上限未执行，不能声称实机配额或crash-safe。真实设备关库、失败恢复及清理副作用待证。'),
   item('C5','报告可证性、错误与UI语义',a('src/findings.ts','108–128,144–181,231–272,280–303')+'；'+a('src/probe.ts','22–39')+'；'+a('src/page.ts','38–41,60–92'), 'compile/选源成功不代替adapter实例化；skip不作pass。配额通过要求SQLITE_FULL+平台原文+重开行数+integrity+连续块；未撞满至少30MiB才pass且带quota-unobserved，否则unknown。UI“完成”代表实验结束，不代表全绿；逐行finding保留fail/unknown，复制由用户按钮触发。', '错误描述/报告字段及现有判定fixture未全部核查；当轮JSON可序列化、cause链异常、报告版本/设备/资产指纹对应、重复运行与实际UI显示未验证。旧设备报告不能自动迁移至已修新SDK。'),
   item('C6','测试、门禁与证据分层',a('vitest.config.mts','10–25')+'；'+a('src/__tests__/fake-alipay.ts','15–46')+'；'+a('src/run-probe.spec.ts','1–39')+'；'+a('src/dist-smoke.spec.ts','1–19')+'；'+a('tsconfig.spec.json','5–10'), '现有源测试用Node/fake my，WASM字节从依赖实际读取，Worker用Node vm/WebCrypto；产物smoke也是VM，不是支付宝DevTools/真机。主控已补跑3应用strict lint=0、最新typecheck=0；初版MJS跨rootDir/并发project变动失败只属历史。新配置与读取起点差异单列，不继承旧69对象门禁。', '本应用当轮test/build/coverage及其skip/测量面未取得；多数测试主体未读，当前target范围需据日志区分MJS/fixture而非由typecheck=0推断。DevTools、iOS预览、Android预览证据分别补，不运行GUI、不等待全矩阵。')]
 else:
  rows=[
   item('C1','真实应用身份、入口与SDK边界',a('static/app.json','2–4')+'；'+a('static/project.config.json','2–9')+'；'+a('src/page.ts','48–75')+'；'+a('src/run-spike.ts','34–49,153–179')+'；'+a('src/core.ts','78–84'), '这是已存在的抖音原生逻辑层应用，页面启动即编排实验；正式createDouyinMiniProgramHost接真实平台API。页面/核心拆两个CJS包，core调用公开SQLite client和SQL，不是完整RxDB仓库/加密/分支用户链路。实验性和testAppId不等于无需审查。', '全部接口/环境采集及fixture未核完；正式host当前版本的DevTools/iOS/Android整应用启动、重复运行/卸载取消未本轮实测。'),
   item('C2','构建、代码包资源及版本闭合',a('scripts/build.mjs','17,107–154')+'；'+a('src/experiments/wasm-path.ts','11–38')+'；'+a('src/run-spike.ts','129–148'), '构建用@aiao/source和ES2020，WASM由adapter依赖同源复制，页面字面量require保持外部核心包，原始顶层错误挂initError再抛。compile相对/绝对路径只作诊断，不替代正式host默认路径。抖音不走支付宝旧指纹读取器，历史SDK问题已修，不外推为当前抖音故障。import根subframe-realm.mjs的静态输入缺口尚未由build补证。', '主控lint/typecheck绿不代表缺helper/当前bundle可运行；需要构建输入、源码条件、产物路径/banner/顶层包装及VM smoke补证，实际绝对路径部署与正式host真机启动另证。'),
   item('C3','realm、引导与安全随机',a('scripts/build.mjs','51–90')+'；'+a('src/realm-probe.ts','39–50')+'；'+a('src/run-spike.ts','156–161')+'；'+a('src/experiments/random.ts','9–60'), 'banner检查真实realm并通过host.runtimeGlobal注入，不把空global对象当真全局。原始tt随机调用按64KiB/1MiB/上限+1分列、有10s超时，无Math.random降级；prepare结果是独立probe。摘要非零不证明密码学熵，Node提供的随机源不能代表TT平台能力。', '环境/residue检测与宿主异常路径未全部阅读；无编码器/无realm/缺随机/回调永不到或晚到、重复引导污染与设备原生限额尚待完整测试/宿主验证。'),
   item('C4','文件、持久化与配额失败',a('src/core.ts','88–148,152–217')+'；'+a('src/run-spike.ts','93–104,163–182')+'；'+a('src/experiments/quota-accounting.ts','75–129')+'；'+a('src/core-contract.ts','20–24'), '实际SQL写-关-重开和integrity判定与支付宝共享基本逻辑；quota写zeroblob，失败保留cause并直接重开未删库。裸FS覆盖写单独统计旧大小计费；临时文件只在固定aiao-douyin-spike子目录操作。默认30MiB计划是测量上限，不是已证平台容量。', 'fs-errors/环境/接口及全部quota失败分支未读完；真实旧大小计费、空块残留、内存压力、失败后原库、清理失败/异常退出及平台fsync/锁限制未本轮动态验证。'),
   item('C5','报告可证性、错误与UI语义',a('src/findings.ts','74–117,160–215')+'；'+a('src/probe.ts','22–39')+'；'+a('src/page.ts','39–42,61–87'), 'WASM compile成功但未实际持久化时只unknown；quota通过要求FULL/平台原文/行数/integrity/连续块，未观察到quota仍需30MiB且带caveat。UI完成不代表finding全绿，未运行/失败字段分开，JSON日志和剪贴板供人工回填，不把本次单设备证据泛化。', 'describe-error与全部报告fixture/渲染主体尚未完整读完；当前版本JSON/cause链、设备/资源来源一致性、重复运行/实际界面与报告搬迁仍需验证。'),
   item('C6','测试、门禁与证据分层',a('vitest.config.mts','10–25')+'；'+a('src/__tests__/fake-douyin.ts','24–54')+'；'+a('src/run-spike.spec.ts','1–45')+'；'+a('src/dist-smoke.spec.ts','7–37')+'；'+a('tsconfig.spec.json','5–10'), '源测试是Node fake tt/文件系统/WASM组合；dist-smoke是node:vm模拟不同realm，不是真抖音。主控最新3应用strict lint=0/typecheck=0已记录；初版跨rootDir/外部project变化失败保留历史，不借旧69对象通过，不把新target绿折算所有fixture/产物。', '本应用当轮test/build/coverage四指标与skip未取得；大部分spec主体未读，最新typecheck测量面与旧起点变化要分列。历史v9设备报告不能替代当前v10/正式host各设备重跑；不运行GUI。')]
 scope=json.loads((e/'scope.json').read_text());finger=json.loads((e/'closeout-source-fingerprints.json').read_text());plan=root/f'requirements/reviews/apps/{app}.md';record=root/f'requirements/reviews/results/apps/{app}.md';plan.parent.mkdir(parents=True,exist_ok=True);record.parent.mkdir(parents=True,exist_ok=True)
 table='| C | 专项 | 实际源码锚点 | 当前结论 | 状态 | 必要未验 |\n| --- | --- | --- | --- | --- | --- |\n'
 for r in rows:table+='| '+' | '.join([r['C'],r['title'],r['anchors'],r['conclusion'],r['status'],r['necessaryUnverified']])+' |\n'
 facts=f'''- 日期：**2026-10-05（Asia/Shanghai）**；只读既有应用，无新业务改动、无新probe、无GUI/测试/构建执行。
- 纳入原因：resolved Nx已经有此node，旧应用计划漏列，不是本次创建的新工程；主控负责第三个alipay-probe-e2e，本记录不改它。
- 受控来源：**{len(scope['trackedFiles'])}文件**；实际阅读 **{ins['readFileCount']}个文件、{ins['readSegmentCount']}段**，其余 **{len(ins['notReadFiles'])}个文件未读**。盘点不是阅读完成，完整测试主体和若干API/实验文件仍未穷举。
- 初始内容指纹与resolved node：`{e/'scope.json'}`；逐文件关注点/未读列表：`{e/'file-inspection.json'}`；外部改动差异：`{e/'closeout-source-fingerprints.json'}`。收束发现{len(finger['changedSinceReadStart'])}个受控配置/源码指纹与读起点不同，未扩读重审，不用旧锚点伪装最新修改已审。
- 最新主控结算：**3应用 strict lint=0、当前 typecheck=0**。当前日志 `{root/'requirements/reviews/evidence/2026-10-05/parallel/validation/added-apps-typecheck-current.txt'}`；来源和初版失败区分在 `{e/'validation-observed.json'}`。初版MJS跨rootDir与并发外部project修改失败保留历史，不能报告当前typecheck仍红。
- SDK旧资源指纹/base factory/oo1问题已由外部修复，主控2+27案例通过；本轮只引用**历史修复事实**，不挂已删除RV文件，不另编号、不作为当前应用bug。SDK聚焦绿也不是本应用全套/设备绿。
'''
 header=f'''---
kind: review-plan
object: {app}
source_root: apps/{app}
created: 2026-10-05
baseline: {ins['head']}
execution: partial
---

# {app}：遗漏范围补审与实际核查

**部分实审，0/6完整C核销，整对象未closed。** 这是本轮实际阅读回填，不是泛计划；私有/实验性应用不豁免审查。六个C各有源码结论和明确未验，不把lint/typecheck绿提升为整对象通过。

## 1. 范围与本轮事实

{facts}
## 2. 六个C：实际证据、结论及必要未验

{table}
## 3. 完成条件与交接

- [ ] 全部受控来源、配置、测试/fixture和关键构建输入完成实审。
- [ ] 六个C完整边界都有结论，动态主张来自当轮执行，不继承历史或mock设备结论。
- [ ] 当前build/test/coverage及测量面、skip、资源来源闭合，真实宿主证据明确分列。
- [ ] 外部变更后涉及的源码锚点按新指纹复核，不以旧读证明修复。

当前strict lint/typecheck已由主控补证；其它条件未满足，**保留partial**。不新增probe、不等待全矩阵。实际记录 `{record}`；构建输入静态缺口 `{e/'critical-build-inputs.json'}`；已承接验证请求 `{e/'validation-requests.json'}`。
'''
 plan.write_text(header)
 rheader=f'''---
kind: review-execution
object: {app}
created: 2026-10-05
baseline: {ins['head']}
execution: partial
---

# {app}：遗漏范围实际评审记录

**部分实审，未closed；0/6完整C核销。** 已补上真实应用对象，不因其私有或实验性跳过。只按实际阅读和主控结算取证，不新增业务代码、测试probe或GUI动作。

## 1. 实际阅读与当轮验证

{facts}
## 2. 六个C的具体结论

{table}
## 3. 尚未完成与结论

🟡 **部分执行，不能给整对象通过评级。** 当前strict lint/typecheck为绿；本应用build/test/coverage与DevTools/iOS/Android未取得当轮证明。SDK既有问题已修，不重报旧红。

- **构建闭合**：读取时构建脚本引用的根helper不存在，收束只做存在性核对，未运行build。该静态缺口和外部修复后当前状态分列，不能以lint/typecheck通过自动销掉，也不在这里新增RV编号。详见 `{e/'critical-build-inputs.json'}`。
- **阅读缺口**：未读文件精确列在 `{e/'file-inspection.json'}`；已读的spec也有仅入口/局部读取，不因文件出现就宣称全部覆盖。旧README设备报告与已修新SDK不能无指纹对照直接合并。
- **真实用户链路**：SQLite client实验不是全RxDB业务特性证明；Node替身、VM、真实WASM、模拟器、各真机档位必须分列。禁止伪称crash-safe/平台原生安全随机已证。
- 主控后续验证统一追加。当前文档没有等待全矩阵、没有预判后续成功。关联计划 `{plan}`。
'''
 record.write_text(rheader)
 summary={'date':'2026-10-05','object':app,'execution':'partial','objectClosed':False,'completeCCount':0,'C':rows,'trackedFiles':len(scope['trackedFiles']),'readFiles':ins['readFileCount'],'readSegments':ins['readSegmentCount'],'notReadFiles':ins['notReadFiles'],'strictLint':0,'currentTypecheck':0,'testBuildCoverageDevices':'not executed/verified for this app','deletedRVLinksUsed':False,'noNewProbes':True,'noBusinessChanges':True,'documents':[str(plan),str(record)]}
 (e/'closeout.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 manifest=[str(plan),str(record)]+[str(p) for p in sorted(e.iterdir()) if p.is_file() and p.name!='changed-files.json']+[str(e/'changed-files.json')]
 (e/'changed-files.json').write_text(json.dumps({'date':'2026-10-05','filesWrittenByThisAddendum':manifest,'noGitIndexOrCommitOperation':True,'otherObjectsModified':False},ensure_ascii=False,indent=2)+'\n')
 print(app,'documents written','6C','partial',ins['readFileCount'],'/',len(scope['trackedFiles']))
