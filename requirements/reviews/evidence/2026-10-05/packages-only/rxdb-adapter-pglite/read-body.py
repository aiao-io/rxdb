from pathlib import Path
import argparse,hashlib,json,datetime
ROOT=Path('/Users/jimmy/Documents/aiao/rxdb')
D=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('action',choices=['read','accept','status']);p.add_argument('paths',nargs='*');p.add_argument('--notes');p.add_argument('--c',default='');p.add_argument('--start',type=int);p.add_argument('--end',type=int);a=p.parse_args()
def load(n,default):
 q=D/n
 return json.loads(q.read_text()) if q.exists() else default
def save(n,v):
 q=D/n;t=q.with_suffix(q.suffix+'.tmp');t.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');t.replace(q)
ins=load('file-inspection.json',{});rs={x['path']:x for x in ins['files']};pending=load('pending-read.json',{})
if a.action=='accept':
 assert pending.get('chunks'),'no pending body output'
 for x in pending['chunks']:
  path=x['path'];assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==x['sha256'],'source drift before accept'
  v=rs.setdefault(path,{'path':path,'sha256':x['sha256'],'lineCount':x['lineCount'],'fullTextRead':False,'readRanges':[],'notes':'','C':[]})
  assert v['sha256']==x['sha256'],'read hash drift: retain old checkpoint first'
  ranges=sorted(v['readRanges']+[x['range']]);merged=[]
  for lo,hi in ranges:
   if merged and lo<=merged[-1][1]+1:merged[-1][1]=max(merged[-1][1],hi)
   else:merged.append([lo,hi])
  v['readRanges']=merged;v['fullTextRead']=merged==[[1,x['lineCount']]] or x['lineCount']==0
  if a.notes:v['notes']=a.notes
  v['C']=sorted(set(v['C']+a.c.split(','))-{''});v['lastReviewedAt']=datetime.datetime.now().astimezone().isoformat()
 ins['files']=list(rs.values());save('file-inspection.json',ins);save('pending-read.json',{});print('accepted',[(x['path'],x['range']) for x in pending['chunks']])
elif a.action=='read':
 assert not pending.get('chunks'),'accept prior actual output first'
 assert len(a.paths)==1,'one file per body output'
 path=a.paths[0]
 if not path.startswith('packages/rxdb-adapter-pglite/'):path='packages/rxdb-adapter-pglite/'+path
 assert path in {x['path'] for x in load('scope.json',{})['files']},'outside original scope'
 raw=(ROOT/path).read_bytes();lines=raw.decode().splitlines();lo=a.start or (rs.get(path,{}).get('readRanges',[[1,0]])[-1][1]+1);hi=a.end or len(lines)
 assert 1<=lo<=hi<=len(lines)
 output=[];size=0
 for i in range(lo-1,min(hi,lo+179)):
  t=f'{i+1}: {lines[i]}\n'
  if output and size+len(t)>7600:break
  output.append(t);size+=len(t)
 stop=lo+len(output)-1;sha=hashlib.sha256(raw).hexdigest();print(f'BODY {path} SHA256={sha} RANGE=[{lo},{stop}] N={len(lines)}');print(''.join(output),end='')
 save('pending-read.json',{'chunks':[{'path':path,'sha256':sha,'lineCount':len(lines),'range':[lo,stop]}]})
else:
 print(json.dumps({'filesComplete':sum(x['fullTextRead'] and bool(x['notes']) for x in rs.values()),'filesTouched':len(rs),'readLines':sum(sum(b-a+1 for a,b in x['readRanges']) for x in rs.values()),'pending':pending},ensure_ascii=False,indent=2))
