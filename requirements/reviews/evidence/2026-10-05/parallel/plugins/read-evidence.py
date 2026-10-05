"""输出实际阅读的行区间，同时记录当前文件指纹；不执行工程任务。"""
import datetime
import fcntl
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
LOG = ROOT / 'requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json'
lock = open(str(LOG) + '.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX)
data = json.loads(LOG.read_text()) if LOG.exists() else {'date': '2026-10-05', 'reviewer': 'plugins', 'files': []}
args = sys.argv[1:]
code_only = '--code' in args
match_arg = next((arg[8:] for arg in args if arg.startswith('--match=')), None)
pattern = re.compile(match_arg) if match_arg else None
args = [arg for arg in args if arg != '--code' and not arg.startswith('--match=')]
for spec in args:
    name, _, interval = spec.partition('#')
    path = pathlib.Path(name)
    path = path if path.is_absolute() else ROOT / path
    raw = path.read_bytes()
    lines = raw.decode().splitlines()
    first, last = (map(int, interval.split(':')) if interval else (1, len(lines)))
    last = min(last, len(lines))
    relative = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
    digest = hashlib.sha256(raw).hexdigest()
    entry = next((e for e in data['files'] if e['path'] == relative and e['sha256'] == digest), None)
    if entry is None:
        entry = {'path': relative, 'sha256': digest, 'lineCount': len(lines), 'readRanges': []}
        data['files'].append(entry)
    entry['readRanges'].append({'start': first, 'end': last, 'mode': 'regex-matches:' + match_arg if pattern else ('code-without-comment-lines' if code_only else 'full-lines')})
    entry['readAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print(f'\n--- {relative} sha256={digest} lines={first}-{last}/{len(lines)} ---')
    in_block = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        omitted = in_block or stripped.startswith(('/*', '//'))
        if stripped.startswith('/*') and '*/' not in stripped:
            in_block = True
        if '*/' in stripped:
            in_block = False
        if i < first - 1 or i >= last:
            continue
        if pattern and not pattern.search(line):
            continue
        if code_only and (omitted or not stripped):
            continue
        print(f'{i + 1:4}: {line}')
LOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
