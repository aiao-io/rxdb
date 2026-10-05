import json, hashlib, sys
from pathlib import Path
root=Path('/Users/jimmy/Documents/aiao/rxdb')
path=root/sys.argv[1]
app=next(x for x in ['dev-rxdb-miniprogram-alipay-probe','dev-rxdb-miniprogram-douyin-spike'] if '/'+x+'/' in str(path))
e=root/'requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum'/app
lines=path.read_text().splitlines();start=int(sys.argv[3]) if len(sys.argv)>3 else 1;end=min(int(sys.argv[4]) if len(sys.argv)>4 else len(lines),len(lines))
j=json.loads((e/'file-inspection.json').read_text());j['files'].append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'readRange':[start,end],'totalLines':len(lines),'focus':sys.argv[2],'wholeFileRead':start==1 and end==len(lines),'dynamicallyExecuted':False});(e/'file-inspection.json').write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
print('\n--- '+str(path)+' ---')
for i in range(start,end+1):
 if lines[i-1].strip():print(f'{i}: {lines[i-1]}')
