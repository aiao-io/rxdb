from pathlib import Path
import datetime, hashlib, json, subprocess, sys
root = Path('/Users/jimmy/Documents/aiao/rxdb')
ev = root / 'requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input'
scopes = ['packages/rxdb-plugin-working-tree-angular', 'packages/rxdb-plugin-working-tree', 'packages/rxdb-angular']
paths = set()
for flags in [[], ['--others', '--exclude-standard']]:
    output = subprocess.check_output(['git', 'ls-files', '-z', *flags, '--', *scopes], cwd=root)
    paths.update(root / name.decode() for name in output.split(b'\0') if name)
paths.update(ev.glob('fixtures/*.ts'))
paths.update(ev.glob('tsconfig.*.json'))
paths.update(root / name for name in ['package.json', 'pnpm-lock.yaml', 'nx.json', 'tsconfig.base.json', 'tsconfig.json'])
paths.add(Path('/tmp/rxdb-review-round3-locked.py'))
for name in ['rxdb', 'rxdb-plugin-working-tree', 'rxdb-plugin-history', 'utils']:
    paths.update((root / 'packages' / name / 'dist').rglob('*.d.ts'))
for name in ['rxdb-plugin-working-tree-angular', 'rxdb-angular']:
    paths.update((root / 'dist/packages' / name / 'types').rglob('*.d.ts'))
for name in ['core', 'compiler', 'compiler-cli']:
    paths.add(root / 'node_modules/@angular' / name / 'package.json')
paths.add(root / 'node_modules/typescript/package.json')
inputs = {str(p.relative_to(root)) if p.is_relative_to(root) else str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}
compiled = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ev / 'compiled').glob('*') if p.is_file()}
index = subprocess.check_output(['git', 'ls-files', '-s', '--', *scopes], cwd=root, text=True)
data = {'capturedAt': datetime.datetime.now().astimezone().isoformat(), 'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(), 'sourceInputCount': len(inputs), 'sourceInputs': inputs, 'compiledFixtureOutputHashes': compiled, 'indexEntries': index}
(ev / (sys.argv[1] + '.fingerprint.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'measurement': sys.argv[1], 'sourceInputCount': len(inputs), 'sourceInputsAggregateSha256': hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest(), 'compiledFixtureOutputCount': len(compiled)}, ensure_ascii=False))
