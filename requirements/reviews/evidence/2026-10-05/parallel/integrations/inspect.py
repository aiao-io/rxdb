from pathlib import Path
import hashlib
import json
import sys
import fcntl

root = Path('/Users/jimmy/Documents/aiao/rxdb')
ledger = root / 'requirements/reviews/evidence/2026-10-05/parallel/integrations/file-inspection.json'
handle = ledger.open("r+")
fcntl.flock(handle, fcntl.LOCK_EX)
data = json.load(handle)
code_only = "--code" in sys.argv
for spec in [a for a in sys.argv[1:] if a != "--code"]:
    parts = spec.rsplit(':', 1)
    relative = parts[0]
    path = root / relative
    text = path.read_text()
    lines = text.splitlines()
    start, end = (1, len(lines))
    if len(parts) == 2:
        pair = parts[1].split('-')
        start = int(pair[0])
        end = int(pair[-1])
    end = min(end, len(lines))
    selected = range(start, end+1)
    if code_only:
        selected = [i for i in selected if lines[i-1].strip() and not lines[i-1].strip().startswith(('//', '/*', '* ', '*/'))]
    output = '\n'.join(f'{i}: {lines[i-1]}' for i in selected)
    if len(output) > 10500:
        print('READ SMALLER RANGE:', relative, start, end, len(output))
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    entry = next((f for f in data['files'] if f['path'] == relative and f['sha256'] == digest), None)
    if entry is None:
        entry = dict(path=relative, sha256=digest, totalLines=len(lines), ranges=[])
        data['files'].append(entry)
    entry['ranges'].append([start, end])
    if code_only:
        entry.setdefault('projections', []).append({'range': [start, end], 'kind': 'code-only', 'commentOnlyLinesOmitted': True})
    print('\n--- '+relative+' ---\n'+output)
handle.seek(0)
handle.truncate()
handle.write(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
handle.close()
