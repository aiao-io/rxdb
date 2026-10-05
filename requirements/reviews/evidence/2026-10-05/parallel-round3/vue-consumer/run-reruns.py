import json
from pathlib import Path
import subprocess
import sys

root = Path('/Users/jimmy/Documents/aiao/rxdb')
evidence = root / 'requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer'
provenance = json.loads((evidence / 'provenance.json').read_text())
toolchain = json.loads((evidence / 'toolchain.json').read_text())
results = json.loads((evidence / 'matrix-exits.initial.json').read_text())
reruns = []
for name in ['valid-bundler', 'invalid-parent-bundler', 'readonly-rules-bundler', 'valid-nodenext']:
    case = next(row for row in provenance['cases'] if row['name'] == name)
    command = [
        'python3', '/tmp/rxdb-review-round3-locked.py',
        '--name', 'vue-consumer/' + name + '-attempt2-9e7a67dd79c3',
        '--scope', 'packages/rxdb-plugin-tree-vue',
        '--scope', 'packages/rxdb-vue',
        '--scope', 'packages/rxdb',
        '--cwd', provenance['fixtureDirectory'],
        '--', toolchain['nodeExecutable'], provenance['compilerBin'],
        '--project', case['tsconfig'], '--noEmit', '--pretty', 'false'
    ]
    outcome = subprocess.run(command, cwd=root, text=True, capture_output=True)
    log = evidence / (name + '.locked-runner-output.attempt2.txt')
    log.write_text(outcome.stdout + outcome.stderr)
    result = {
        'name': name,
        'exitCode': outcome.returncode,
        'expectedExitCode': case['expectedExitCode'],
        'exitMatchesExpectation': outcome.returncode == case['expectedExitCode'],
        'lockCommand': command,
        'runnerOutput': str(log),
        'attempt': 2
    }
    results = [result if row['name'] == name else row for row in results]
    reruns.append(result)
    print(json.dumps({key: result[key] for key in ['name', 'exitCode', 'expectedExitCode', 'exitMatchesExpectation']}, ensure_ascii=False), flush=True)
(evidence / 'matrix-exits.reruns.json').write_text(json.dumps(reruns, ensure_ascii=False, indent=2) + '\n')
(evidence / 'matrix-exits.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
sys.exit(0 if all(row['exitMatchesExpectation'] for row in results) else 1)
