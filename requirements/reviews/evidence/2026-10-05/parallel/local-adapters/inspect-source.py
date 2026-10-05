import sys, json, hashlib
from pathlib import Path
root=Path('/Users/jimmy/Documents/aiao/rxdb')
e=root/'requirements/reviews/evidence/2026-10-05/parallel/local-adapters'
path=root/sys.argv[1];focus=sys.argv[2];text=path.read_text();lines=text.splitlines()
start=int(sys.argv[3]) if len(sys.argv)>3 else 1
end=min(int(sys.argv[4]) if len(sys.argv)>4 else len(lines),len(lines))
j=json.loads((e/'file-inspection.json').read_text())
entry={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'readRange':[start,end],'totalLines':len(lines),'focus':focus,'method':'numbered source output / static inspection','dynamicEvidence':False}
j['files'].append(entry)
(e/'file-inspection.json').write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
print('\n--- '+str(path)+' ---')
for n in range(start,end+1):print(f'{n:4}: {lines[n-1]}')
