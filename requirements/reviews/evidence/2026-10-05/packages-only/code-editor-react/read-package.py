import json
import sys
from pathlib import Path

base = Path(__file__).resolve().parent
scope = json.loads((base / 'continuation-scope.json').read_text())
parts = []
current = []
size = 0
for item in scope['files']:
    for number, text in enumerate(Path(item['path']).read_text().splitlines(), 1):
        rendered = f"{number}: {text}"
        if current and size + len(rendered) > 5500:
            parts.append(current)
            current = []
            size = 0
        current.append({'path': item['path'], 'line': number, 'text': rendered})
        size += len(rendered) + 1
if current:
    parts.append(current)
manifest = []
for index, part in enumerate(parts, 1):
    ranges = {}
    for row in part:
        ranges.setdefault(row['path'], []).append(row['line'])
    manifest.append({'part': index, 'ranges': {name: [min(lines), max(lines)] for name, lines in ranges.items()}})
(base / 'read-parts.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
if len(sys.argv) == 1:
    print(f"{len(parts)} bounded body parts; each <=5500 characters; original scope={len(scope['files'])} files")
else:
    index = int(sys.argv[1])
    print(f"BEGIN BODY PART {index}/{len(parts)}")
    previous = None
    for row in parts[index - 1]:
        if previous != row['path']:
            print('===== ' + row['path'] + ' =====')
            previous = row['path']
        print(row['text'])
    print(f"END BODY PART {index}/{len(parts)}")
