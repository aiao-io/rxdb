import datetime
import hashlib
import json
from pathlib import Path
import subprocess

root = Path('/Users/jimmy/Documents/aiao/rxdb')
dest = root/'requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict'
spec = root/'packages/rxdb-test/src/__tests__/review-round3-cleanup-verdict.spec.ts'
current_spec_hash = hashlib.sha256(spec.read_bytes()).hexdigest()
phases = []
for label, mode, expected_pass, expected_fail, expected_rejections in [
    ('runner-direct-01','direct',1,1,1),
    ('runner-shared-01','shared',22,0,10),
    ('runner-probe-01','probe',2,1,1),
]:
    folder = dest/label
    statuses = list(folder.glob('*.status.json'))
    assert len(statuses) == 1, label
    status = json.loads(statuses[0].read_text())
    measurement = json.loads((folder/'measurement.json').read_text())
    report = json.loads((folder/'vitest.json').read_text())
    raw = root/status['rawLog']
    lines = raw.read_text().splitlines()
    marked = [(i, line) for i, line in enumerate(lines, 1) if 'R3_CLEANUP_VERDICT ' in line]
    assert len(marked) == 1
    trace_line, text = marked[0]
    trace = json.JSONDecoder().raw_decode(text.split('R3_CLEANUP_VERDICT ', 1)[1])[0]
    assert trace['mode'] == mode
    cases = [a for result in report['testResults'] for a in result['assertionResults']]
    assert len(cases) == expected_pass + expected_fail
    assert report['numPassedTests'] == expected_pass
    assert report['numFailedTests'] == expected_fail
    assert report['numPendingTests'] == 0 and report['numTodoTests'] == 0
    assert status['exitCode'] == measurement['exitCode'] == (1 if expected_fail else 0)
    assert status['changedInputsDuringMeasurement'] == []
    assert measurement['specSha256Before'] == measurement['specSha256After'] == current_spec_hash
    rejected = [t for t in trace['traces'] if t['outcome'] == 'rejected']
    assert len(rejected) == expected_rejections
    assert all(t['disconnectCalls'] == t['disposeCalls'] == 1 and t['outcome'] == t['expected'] for t in trace['traces'])
    for entry in trace['traces']:
        events = entry['events']
        if entry['kind'] == 'database':
            assert events.index('connect:fulfilled') < events.index(f"adapter.disconnect:{entry['expected']}")
            assert events[-1] == 'model.destroy:fulfilled'
        else:
            assert events[:3] == ['createTables:expected-rejection','tableExists:false','tableExists:false']
    failures = [c for c in cases if c['status'] == 'failed']
    assert all(c['failureMessages'] and all(message.startswith('Error: R3_CLOSE_REJECT:') for message in c['failureMessages']) for c in failures)
    (folder/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
    (folder/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
    phases.append({
        'label':label,'mode':mode,'exitCode':status['exitCode'],'success':report['success'],
        'passed':expected_pass,'failed':expected_fail,'pending':report['numPendingTests'],'todo':report['numTodoTests'],
        'databaseResources':sum(t['kind']=='database' for t in trace['traces']),
        'probeResources':sum(t['kind']=='probe' for t in trace['traces']),
        'explicitlyRejectedDisposes':len(rejected),
        'rejectedDisposeFactories':[t['factory'] for t in rejected],
        'failureNames':[c['fullName'] for c in failures],
        'bodyOperationEvents':{event:sum(t['events'].count(event) for t in trace['traces']) for event in ['connect:fulfilled','query:fulfilled','save:fulfilled','createTables:expected-rejection','tableExists:false']},
        'specSha256':current_spec_hash,'headAtStart':status['headAtStart'],'headAtFinish':status['headAtFinish'],
        'changedInputsDuringMeasurement':status['changedInputsDuringMeasurement'],'serialHeavyTaskLock':status['serialHeavyTaskLock'],
        'rawLog':status['rawLog'],'traceLogLine':trace_line,
        'vitestReport':str((folder/'vitest.json').relative_to(root)),
        'status':str(statuses[0].relative_to(root))
    })

production_drift = []
for manifest_file in ['sourcehash.json','external-sourcehash.json']:
    baseline = json.loads((dest/'baseline'/manifest_file).read_text())
    production_drift.extend(p for p, sha in baseline.items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest() != sha)
assert production_drift == [], production_drift
inherited = json.loads((dest/'baseline/inherited-evidence.json').read_text())['inherited']
inherited_check = [{'path':p['path'],'snapshotIntact':hashlib.sha256((root/p['snapshot']).read_bytes()).hexdigest()==p['sha256'],'originalUnchangedBeforeSettlement':hashlib.sha256((root/p['path']).read_bytes()).hexdigest()==p['sha256']} for p in inherited]
assert all(p['snapshotIntact'] for p in inherited_check)
quality = []
for label in ['spec-strict-01','spec-strict-02','spec-lint-01']:
    status_path = next((dest/label).glob('*.status.json'))
    status = json.loads(status_path.read_text())
    quality.append({'label':label,'exitCode':status['exitCode'],'rawLog':status['rawLog'],'changedInputsDuringMeasurement':status['changedInputsDuringMeasurement']})
assert quality[1]['exitCode'] == quality[2]['exitCode'] == 0
summary = {
    'task':'R3-05 cleanup-verdict','clientDate':'2026-10-05','collectedAt':datetime.datetime.now().astimezone().isoformat(),
    'spec':str(spec.relative_to(root)),'specSha256':current_spec_hash,
    'baselineHead':(dest/'baseline/git-head.txt').read_text().strip(),
    'headAtCollection':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
    'originalRxdbTestFileCount':len(json.loads((dest/'baseline/sourcehash.json').read_text())),
    'originalSourceDrift':production_drift,'inheritedEvidence':inherited_check,
    'measurements':phases,'quality':quality,
    'verdict':{
        'successfulBodyAndDisposeRejectionCanYieldGreen':True,
        'realUnmockedVitestRegistrations':True,
        'filteredOrSkippedCases':False,
        'existingCandidate':'CORE-PENDING-3','newIndependentCandidates':0,'mainRvAssigned':False,
        'candidateScope':'三个原事务共享 suite 的 opened 数据库 afterEach 对明确拒绝的 Promise 清理错误不可观测；不含 bootstrap probe finally、不证明具体后端关闭失败或物理泄漏。',
        'contractDecision':'C1/C2/C3 业务契约与 cleanup 完整性不等价；现有 factory 自己也 best-effort。主控决定关闭失败是否必须使合规 runner 红，不能仅由 catch 推断业务事务实现错误。',
        'newCoverageCredit':'成功业务 body + 明确 adapter.disconnect/factory.dispose 拒绝 + 真实 runner exit 的缺口已闭合；不核销完整 C1/C2、覆盖率或全适配器合规。'
    }
}
(dest/'comparison.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'specSha256':current_spec_hash,'originalSourceDrift':production_drift,'measurements':[{k:p[k] for k in ['mode','exitCode','passed','failed','pending','explicitlyRejectedDisposes']} for p in phases],'quality':quality},ensure_ascii=False,indent=2))
