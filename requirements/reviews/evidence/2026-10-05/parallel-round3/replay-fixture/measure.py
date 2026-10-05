import datetime, hashlib, json, pathlib, subprocess, sys
root = pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
base = root / 'requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture'
name = sys.argv[1]
command = sys.argv[2:]
paths = [root / p for p in subprocess.check_output(['git', 'ls-files', '--', 'packages/rxdb-plugin-replay-angular', 'packages/rxdb-plugin-replay'], cwd=root, text=True).splitlines()]
paths += [p for p in base.iterdir() if p.suffix in ['.py', '.cjs', '.mts', '.mjs']]
paths += [root / p for p in ['package.json', 'pnpm-lock.yaml', 'nx.json', 'tsconfig.base.json', 'AGENTS.md']]
consumer = json.loads((base / 'consumer-inputs-before.json').read_text())['files']
paths += [pathlib.Path(p) for p in consumer]
paths += [(root / 'packages/rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js').resolve(), (root / 'packages/rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.d.ts').resolve()]
def snapshot():
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
before = snapshot()
dest = base / name
dest.mkdir(parents=True, exist_ok=True)
stamp = datetime.datetime.now().astimezone().strftime('%Y%m%dT%H%M%S%f')
proof = dest / (stamp + '.expanded-inputs.json')
proof.write_text(json.dumps({'command': command, 'filesBefore': before}, ensure_ascii=False, indent=2) + '\n')
result = subprocess.run(['python3', '/tmp/rxdb-review-round3-locked.py', '--name', 'replay-fixture/' + name, '--scope', 'packages/rxdb-plugin-replay-angular', '--scope', 'packages/rxdb-plugin-replay', '--', *command], cwd=root)
after = snapshot()
proof.write_text(json.dumps({'command': command, 'filesBefore': before, 'changedExpandedInputs': [p for p,h in before.items() if after.get(p) != h], 'exitCode': result.returncode}, ensure_ascii=False, indent=2) + '\n')
raise SystemExit(result.returncode)
