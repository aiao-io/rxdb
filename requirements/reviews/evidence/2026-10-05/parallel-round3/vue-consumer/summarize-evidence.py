import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path('/Users/jimmy/Documents/aiao/rxdb')
evidence = root / 'requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer'
provenance = json.loads((evidence / 'provenance.json').read_text())
expectations = json.loads((evidence / 'case-expectations.json').read_text())
exits = json.loads((evidence / 'matrix-exits.json').read_text())
baseline = json.loads((evidence / 'baseline.json').read_text())
sha = lambda content: hashlib.sha256(content).hexdigest()
matrices = []
for row in exits:
    name = row['name']
    directory = row['lockCommand'][row['lockCommand'].index('--name') + 1].removeprefix('vue-consumer/')
    status_path = next((evidence / directory).glob('*.status.json'))
    status = json.loads(status_path.read_text())
    text = (root / status['rawLog']).read_text()
    diagnostics = []
    for line in text.splitlines()[2:]:
        match = re.match(r'^(.*)\((\d+),(\d+)\): error TS(\d+): (.*)$', line)
        if match:
            source = (Path(status['cwd']) / match[1]).resolve()
            diagnostics.append({'path': str(source), 'file': source.name, 'line': int(match[2]), 'column': int(match[3]), 'code': int(match[4]), 'message': match[5], 'continuation': []})
        elif diagnostics and line.strip():
            diagnostics[-1]['continuation'].append(line)
    expected = expectations[name]
    unmatched = list(range(len(diagnostics)))
    targets = []
    for target in expected['expectedTargetDiagnostics']:
        matches = [index for index in unmatched if diagnostics[index]['file'] == target['file'] and diagnostics[index]['line'] == target['line'] and diagnostics[index]['code'] in target['codeIn']]
        index = matches[0] if matches else None
        targets.append({**target, 'matched': index is not None, 'diagnosticIndex': index})
        if index is not None:
            unmatched.remove(index)
    passed = status['exitCode'] == expected['expectedExitCode'] and all(target['matched'] for target in targets)
    if expected['exactTargetCount'] is not None:
        passed = passed and len(diagnostics) == expected['exactTargetCount']
    matrices.append({'name': name, 'statusPath': str(status_path), 'rawLog': str(root / status['rawLog']), 'status': status, 'diagnosticCount': len(diagnostics), 'codeCounts': {str(code): sum(diag['code'] == code for diag in diagnostics) for code in sorted({diag['code'] for diag in diagnostics})}, 'diagnostics': diagnostics, 'targetMatches': targets, 'unmatchedDiagnosticIndices': unmatched, 'expectationMet': passed})
(evidence / 'diagnostic-matrix.json').write_text(json.dumps(matrices, ensure_ascii=False, indent=2) + '\n')
resolution_status_path = next((evidence / 'resolved-files-9e7a67dd79c3').glob('*.status.json'))
resolution_status = json.loads(resolution_status_path.read_text())
loaded = [Path(line) for line in (root / resolution_status['rawLog']).read_text().splitlines()[2:] if line.startswith('/') and Path(line).is_file()]
resolved_packages = []
for package in provenance['packages']:
    package_root = Path(package['installedRealRoot']).resolve()
    declarations = []
    for path in loaded:
        real = path.resolve()
        if real.is_relative_to(package_root):
            relative = str(real.relative_to(package_root))
            published = next((entry for entry in package['files'] if entry['path'] == relative), None)
            declarations.append({'loadedPath': str(path), 'realPath': str(real), 'packageRelativePath': relative, 'sha256': sha(real.read_bytes()), 'matchedPublishedTarHash': published is not None and published['sha256'] == sha(real.read_bytes())})
    resolved_packages.append({'name': package['name'], 'version': package['version'], 'loadedDeclarationCount': len(declarations), 'loadedDeclarations': declarations})
(evidence / 'resolved-declarations.json').write_text(json.dumps({'statusPath': str(resolution_status_path), 'rawLog': str(root / resolution_status['rawLog']), 'exitCode': resolution_status['exitCode'], 'loadedFileCount': len(loaded), 'sfcs': [str(path) for path in loaded if path.suffix == '.vue'], 'workspaceSourcePaths': [str(path) for path in loaded if path.resolve().is_relative_to(root / 'packages')], 'packages': resolved_packages}, ensure_ascii=False, indent=2) + '\n')
current_scope = {name: sha((root / name).read_bytes()) for name in baseline['trackedScopeHashes'] if (root / name).is_file()}
statuses = [json.loads(path.read_text()) for path in evidence.glob('*/*.status.json')]
quality = []
for path in sorted((evidence / 'consumer').glob('*')):
    if path.suffix in ['.ts', '.vue', '.mjs']:
        text = path.read_text()
        quality.append({'file': path.name, 'explicitAnyTokens': len(re.findall(r'\bany\b', text)), 'suppressionDirectives': re.findall(r'@ts-(?:ignore|expect-error|nocheck)', text)})
(evidence / 'measurement-summary.json').write_text(json.dumps({
    'clientDate': '2026-10-05',
    'recordedAt': datetime.datetime.now().astimezone().isoformat(),
    'matrixCaseCount': len(matrices),
    'matrixExpectationsMet': all(row['expectationMet'] for row in matrices),
    'matchedNegativeTargetCount': sum(target['matched'] for row in matrices for target in row['targetMatches']),
    'negativeTargetCount': sum(len(row['targetMatches']) for row in matrices),
    'serialLockInvocationCount': len(statuses),
    'allMeasurementsSerialLocked': all(status['serialHeavyTaskLock'] for status in statuses),
    'changedInputsDuringMeasurements': [status for status in statuses if status['changedInputsDuringMeasurement']],
    'sourceScopeHashChangesSinceStart': [name for name, digest in baseline['trackedScopeHashes'].items() if current_scope.get(name) != digest],
    'stagedDiffSha256Before': baseline['stagedDiffSha256'],
    'stagedDiffSha256After': sha(subprocess.check_output(['git', 'diff', '--cached', '--binary'], cwd=root)),
    'measurementHeadRevisions': sorted({revision for status in statuses for revision in [status['headAtStart'], status['headAtFinish']]}),
    'headAtFinalInspection': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'gitMutationCommandsExecutedByThisAgent': [],
    'globalGitStateIsNotClaimedUnchangedAtFinalization': True,
    'gitStateNote': '16 次测量 HEAD 均为原基线，编译后首个审计暂存快照不变；收尾观察到外部并行提交/暂存变化，不撤回外部状态。本代理没有执行暂存、提交或修改全局评审 index。',
    'sourceFixtureChecks': quality,
    'fixtureCopiesMatchFinalHashes': all(sha(Path(entry['temporaryPath']).read_bytes()) == entry['sha256'] == sha(Path(entry['evidencePath']).read_bytes()) for entry in provenance['fixtures'].values()),
    'allLoadedDeclarationsMatchRealTar': all(package['loadedDeclarations'] and all(item['matchedPublishedTarHash'] for item in package['loadedDeclarations']) for package in resolved_packages),
    'workspaceSourcePathsLoaded': [str(path) for path in loaded if path.resolve().is_relative_to(root / 'packages')],
    'fullOriginalCClosedCount': 0,
    'noNewNumberedReport': True
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'matrixCases': len(matrices), 'expectationsMet': all(row['expectationMet'] for row in matrices), 'targetsMatched': sum(target['matched'] for row in matrices for target in row['targetMatches']), 'lockInvocations': len(statuses), 'sfcs': [path.name for path in loaded if path.suffix == '.vue'], 'loadedTarDeclarations': {package['name']: package['loadedDeclarationCount'] for package in resolved_packages}, 'scopedSourceHashChanges': [name for name, digest in baseline['trackedScopeHashes'].items() if current_scope.get(name) != digest], 'stagedDiffUnchanged': baseline['stagedDiffSha256'] == sha(subprocess.check_output(['git', 'diff', '--cached', '--binary'], cwd=root))}, ensure_ascii=False, indent=2))
