import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('--mode', choices=['shared', 'direct', 'probe'])
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
root = Path('/Users/jimmy/Documents/aiao/rxdb')
dest = root/'requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict'
spec = root/'packages/rxdb-test/src/__tests__/review-round3-cleanup-verdict.spec.ts'
command = args.command[1:] if args.command[:1] == ['--'] else args.command
assert command[:3] == ['pnpm', 'nx', 'run']
assert '--excludeTaskDependencies' in command
assert '--skipRemoteCache' in command and '--skipNxCache' in command
measurement = dest/args.name
assert not measurement.exists(), 'measurement name must be unique'
measurement.mkdir(parents=True)
before = hashlib.sha256(spec.read_bytes()).hexdigest()
(measurement/'spec-before.ts.txt').write_bytes(spec.read_bytes())
env = {**os.environ, 'CI':'true', 'NX_DAEMON':'false', 'FORCE_COLOR':'0', 'CODECOV_TOKEN':''}
if args.mode:
    env['RXDB_REVIEW_R3_CLEANUP_MODE'] = args.mode
start = datetime.datetime.now().astimezone().isoformat()
locked = ['python3', '/tmp/rxdb-review-round3-locked.py', '--name', f'cleanup-verdict/{args.name}', '--scope', 'packages/rxdb-test', '--', *command]
result = subprocess.run(locked, cwd=root, env=env)
after = hashlib.sha256(spec.read_bytes()).hexdigest()
metadata = {
    'startedAt':start, 'lockedCommand':locked,
    'env':{k:env[k] for k in ['CI','NX_DAEMON','FORCE_COLOR','CODECOV_TOKEN',*(['RXDB_REVIEW_R3_CLEANUP_MODE'] if args.mode else [])]},
    'spec':str(spec.relative_to(root)), 'specSha256Before':before,
    'specSha256After':after, 'specChangedDuringMeasurement':before != after,
    'exitCode':result.returncode
}
(measurement/'measurement.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(metadata,ensure_ascii=False,indent=2))
raise SystemExit(result.returncode)
