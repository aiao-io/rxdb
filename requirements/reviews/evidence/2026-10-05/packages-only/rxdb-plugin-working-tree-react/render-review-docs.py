from pathlib import Path
import argparse,json
p=argparse.ArgumentParser();p.add_argument('package');a=p.parse_args();r=Path('/Users/jimmy/Documents/aiao/rxdb');e=r/'requirements/reviews/evidence/2026-10-05/packages-only'/a.package
s=json.loads((e/'scope.json').read_text());i=json.loads((e/'file-inspection.json').read_text());c=json.loads((e/'c-evidence.json').read_text());z=json.loads((e/'closure.json').read_text());assert z['sourceReviewComplete'] and z['opinionDeliveryComplete']
plan=r/'requirements/reviews/packages'/f'{a.package}.md';result=r/'requirements/reviews/results/packages'/f'{a.package}.md';root=r/'packages'/a.package
link=lambda path,label:f'[{label}]({path})'
header=lambda kind:f'''---
kind: {kind}
object: {a.package}
source_root: packages/{a.package}
updated: 2026-10-05
worker: {z['worker']}
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: remaining-owners-listed
release-validation: not-complete
rating: "{z['rating']}"
---
'''
old=[link(e/'baseline/original-plan.md','旧plan'),link(e/'baseline/original-results.md','旧results')]
summary=f"**{z['rating']} {z.get('ratingLabel','')}。源码全文 / 原 C 意见：complete-original-scope；专项运行与发布验收另列。**"
base=[f'- 唯一对象：`{root}`；{s["controlledFileCount"]} 文件 / {s["lineCount"]} 行，源码/config/tests/docs/license 全范围。',f'- 沿用冻结scope标识 `{s.get("headAtScope", "file SHA snapshot")}`；实际阅读以当前文件SHA及真实区间为准，不自行执行Git操作。',f'- {link(e/"scope.json","scope")} / {link(e/"resolved-project.json","resolved")} / {link(e/"scope-freeze.json","冻结核对")}；没有把project.json局部targets当完整配置。',f'- 旧文档先读并保留：{" / ".join(old)}；旧partial不能继续冒充本次源码状态，原场景仍保留。',f'- {link(e/"file-inspection.json","全文台账")}记录实际SHA、N、真实readRanges、具体notes/C；输出trace与hash盘点不自动等于阅读。']
remaining=['| ID / 原 C | owner（责任角色，实名由主控指定） | 场景 | 未验原因 |','| --- | --- | --- | --- |']
for v in z['remainingValidation']:remaining.append(f"| {v['id']} / {', '.join(v['C'])} | {v['owner']} | {v['scenario']} | {v['reason']} |")
orig=['| 原 C / 专项 | 原动作 | 原最低场景（不缩减） | 当前源码意见 |','| --- | --- | --- | --- |']
for v in c['conclusions']:
 o=v['original'];orig.append(f"| **{v['id']} {o['topic']}** | {o['action']} | {o['minimumScenarios']} | {v['conclusion']} |")
q=[header('review-plan'),f'# {a.package}：原范围全文评审收口',summary,'','## 1. 独占范围 / 冻结 / 历史','']+base+['','## 2. 全文阅读与具体关注','','| 文件 | 行数 | 已审具体关注 |','| --- | ---: | --- |']
for f in i['files']:q.append(f"| {link(r/f['path'],f['path'].removeprefix('packages/'+a.package+'/'))} | {f['lineCount']} | {f['notes']} |")
q+=['','## 3. 原 C 全部意见','']+orig+['',f'逐项源码/测试角色及未验归属：{link(result,"results")} / {link(e/"c-evidence.json","c-evidence.json")}。','', '## 4. 完成条件拆账','', '- [x] 原受控全范围正文与所有原 C 意见交付，非目录/摘要检查。','- [x] 确认问题去重、当前指纹/原失败证据与未测边界分离。','- [x] 有证据的评级；源码评审完成不等于修复或发布就绪。','- [x] 全部必要未验场景的owner/场景/原因登记。','- [ ] 专项场景全部运行通过。','- [ ] 修复回归、独立consumer与发布验收。','','## 5. 专项 / 发布剩余验证','']+remaining+['','## 6. 执行纪律 / 交付','',f"本轮新增Nx命令：`{z.get('newNxValidationCommands',[])}`。不业务/原tests/deps/index/Git操作，不派agent，不apps或扩全矩阵。旧明确同SHA证据只按其真实证明面复用。",'重要新动态疑点才经指定locked脚本执行唯一包、单worker、skipRemoteCache/skipNxCache复验；不降strict、不新增skipLibCheck/any/skip，不以全量门禁拖住源码意见收口。',f'机器收口：{link(e/"closure.json","closure.json")}；校验后执行指定--complete原子更新50包总进度/ETA。','']
plan.write_text('\n'.join(q))
q=[header('review-execution'),f'# {a.package}：全文评审与逐 C 意见',summary,'',z['ratingReason'],'',f"- 全文：**{s['controlledFileCount']}/{s['controlledFileCount']} 文件，{s['lineCount']}/{s['lineCount']} 行**；原 C **{len(c['conclusions'])}/{len(c['conclusions'])} 意见交付**，不是原场景全部测试通过。",f"- 确认意见：既有复用 {z.get('reusedConfirmedIssueCount',0)}；新增 {z.get('newConfirmedIssueCount',0)}（新增业务 {z.get('newConfirmedBusinessBugCount',z.get('newConfirmedIssueCount',0))}，局部文档 {z.get('newConfirmedDocumentationIssueCount',0)}）；candidates {len(z['candidates'])}。",'- releaseReady=false；专项/发布未验归属独立登记；不修改原业务/测试/依赖/index，不派agent。','','## 1. 范围与阅读证据','']+base+['',f'支撑依赖只读必要契约，不交付另一个包：{link(e/"dependency-inspection.json","dependency-inspection.json")}。','','## 2. 确认问题 / 去重 / 影响边界','']
for v in z['confirmedIssues']:
 q += [f"### {v['id']} — {v['severity']} / {v['status']}",f"责任角色：{v['owner']}；处置：{v['disposition']}。",v['rootCause'],f"源码：`{r/v['source']}`，实际区间 `{v.get('lines',[])}`。",f"证据：{v.get('actualEvidence',v.get('regression','详见reused-evidence.json'))}",v.get('impactBoundary',''),v.get('minimalCorrection',''),'']
q += [f'历史输入指纹、原日志/测量分母/复用限制：{link(e/"reused-evidence.json","reused-evidence.json")}。旧红探针不删、不skip；不重复创建同根因RV。','','## 3. 每个原 C 的结论 / 锚点 / 未验归属','']
for v in c['conclusions']:
 o=v['original'];q += [f"### {v['id']} {o['topic']} — 原源码意见已交付",f"**原动作**：{o['action']}",f"**原最低场景**：{o['minimumScenarios']}",f"**结论**：{v['conclusion']}",v['detail'],'','源码锚点：']+[f'- `{r/p}`' for p in v['sourceAnchors']]+['','已读测试定义锚点（不自动表示本轮新运行）：']+[f'- `{r/p}`' for p in v['testDefinitionAnchors']]+['',f"未验归属：{', '.join(v['remainingValidationIds'])}，见§5。",'']
q += ['## 4. 动态证据 / 测试桩 / 配置限制','',z.get('validationNarrative','本轮没有新增Nx运行；只复用已明确正文及同hash的历史证据。源码、实际fixture边界、真实数据/UI、独立发布消费分别记账。'),'',f"新增Nx命令：`{z.get('newNxValidationCommands',[])}`。旧coverage、lint/typecheck、pack不能称作本轮fresh通过，也不能代替真实场景。",'','## 5. 必要未验场景与发布owner','']+remaining+['','## 6. 最终收口','',f"{z['rating']}：{z['ratingReason']}",'sourceReviewComplete=true / opinionDeliveryComplete=true；所有原C意见完成，scenario/release不冒充完成。',f'{link(plan,"plan")} / {link(e/"file-inspection.json","file-inspection.json")} / {link(e/"c-evidence.json","c-evidence.json")} / {link(e/"closure.json","closure.json")}。','校验后使用指定进度脚本--complete；在完成事件与总进度/ETA原子更新之前不启动下一包。','']
result.write_text('\n'.join(q));print(json.dumps({'object':a.package,'planLines':len(plan.read_text().splitlines()),'resultLines':len(result.read_text().splitlines()),'rating':z['rating']},ensure_ascii=False))
