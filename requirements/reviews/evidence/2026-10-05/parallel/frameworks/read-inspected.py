import argparse, hashlib, json, pathlib, re
ROOT=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
BASE=ROOT/'requirements/reviews/evidence/2026-10-05/parallel/frameworks'
p=argparse.ArgumentParser(); p.add_argument('paths',nargs='+'); p.add_argument('--mode',choices=['full','outline','configuration','implementation'],default='full'); p.add_argument('--start',type=int,default=1); p.add_argument('--end',type=int); a=p.parse_args()
data=json.loads((BASE/'file-inspection.json').read_text()); scope=json.loads((BASE/'scope.json').read_text()); controlled={f:(x['object'],v) for x in scope for f,v in x['sourceSha256'].items()}
for name in a.paths:
 path=ROOT/name; raw=path.read_bytes(); lines=raw.decode().splitlines(); end=min(a.end or len(lines),len(lines)); digest=hashlib.sha256(raw).hexdigest()
 print('\n### '+name+' ('+str(len(lines))+' lines)')
 if a.mode=='configuration':
  print(raw.decode())
 elif a.mode=='implementation':
  block=False
  for i,l in enumerate(lines,1):
   t=l.strip()
   if t.startswith('/*'): block=True
   if a.start <= i <= end and not block and t and not t.startswith('//'): print(f'{i}: {t}')
   if '*/' in t: block=False
 elif a.mode=='outline':
  for i,l in enumerate(lines,1):
   if re.search(r'(describe|\bit|test)(\.(skip|todo|each))?\(|^import|vi\.mock|StrictMode|createRoot|renderHook|createApp|TestBed|runInInjectionContext|effectScope',l): print(f'{i}: {l}')
 else:
  for i in range(a.start-1,end):
   if lines[i].strip(): print(f'{i+1}: {lines[i]}')
 rec={'path':name,'object':controlled.get(name,(None,None))[0],'sha256':digest,'scopeSha256':controlled.get(name,(None,None))[1],'scopeMatches':digest==controlled.get(name,(None,None))[1] if name in controlled else None,'mode':a.mode,'range':[a.start,end] if a.mode in ('full','implementation') else None,'lineCount':len(lines),'functionsReviewed':[],'C':[],'testCoverageOfC':'未登记；outline 不能充当完整测试阅读或完整 C 场景覆盖。' if a.mode=='outline' else '待逐 C 场景映射，不以文件存在或读取直接核销。'}
 data['reads'].append(rec)
(BASE/'file-inspection.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
