from pathlib import Path
import argparse,datetime,hashlib,json
from zoneinfo import ZoneInfo
ROOT=Path('/Users/jimmy/Documents/aiao/rxdb')
BASE=ROOT/'requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core'
STAMP=lambda:datetime.datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
def save(p,x):
 t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');t.replace(p)
p=argparse.ArgumentParser();p.add_argument('--view');p.add_argument('--start',type=int);p.add_argument('--ack');p.add_argument('--notes');p.add_argument('--C',default='');p.add_argument('--status',action='store_true');a=p.parse_args()
scope=json.loads((BASE/'scope.json').read_text());expected={f['path']:f for f in scope['files']}
ledger=BASE/'file-inspection.json'
s=json.loads(ledger.read_text()) if ledger.exists() else {'object':'rxdb-adapter-sqlite-core','worker':'PKG-sqlite-core','scope':'scope.json','sourceReviewComplete':False,'opinionDeliveryComplete':False,'files':[],'readEvents':[],'pending':{},'createdAt':STAMP()}
if a.ack:
 e=s['pending'].pop(a.ack);f=e['path'];assert a.notes and a.C
 raw=(ROOT/f).read_bytes();assert hashlib.sha256(raw).hexdigest()==e['sha256'],'Source drift since view: do not acknowledge'
 row=next((v for v in s['files'] if v['path']==f),None)
 if row is None:
  row={'path':f,'sha256':e['sha256'],'lineCount':e['lineCount'],'fullTextRead':False,'readRanges':[],'notes':'','C':[],'inspections':[]};s['files'].append(row)
 if row['sha256']!=e['sha256']:
  s.setdefault('supersededReadingVersions',[]).append(dict(row));row.update(sha256=e['sha256'],lineCount=e['lineCount'],fullTextRead=False,readRanges=[],notes='',C=[],inspections=[])
 row['readRanges'].append(e['range']);merged=[]
 for lo,hi in sorted(row['readRanges']):
  if merged and lo<=merged[-1][1]+1:merged[-1][1]=max(merged[-1][1],hi)
  else:merged.append([lo,hi])
 row['readRanges']=merged;row['fullTextRead']=merged==[[1,row['lineCount']]] if row['lineCount'] else True
 row['C']=sorted(set(row['C']+a.C.split(',')));row['inspections'].append({'range':e['range'],'notes':a.notes,'C':a.C.split(','),'readEvent':a.ack,'at':STAMP()});row['notes']='；'.join(v['notes'] for v in row['inspections'])
 s['readEvents'].append({**e,'id':a.ack,'acknowledgedAt':STAMP(),'notes':a.notes,'C':a.C.split(',')})
if a.view:
 f=a.view if a.view.startswith('packages/') else 'packages/rxdb-adapter-sqlite-core/'+a.view
 assert f in expected,'Outside frozen scope'
 raw=(ROOT/f).read_bytes();lines=raw.decode().splitlines();sha=hashlib.sha256(raw).hexdigest()
 if sha!=expected[f]['sha256']:raise SystemExit('Frozen scope drift: retain old scope and explicitly revise before read')
 row=next((v for v in s['files'] if v['path']==f),None)
 lo=a.start or (row['readRanges'][-1][1]+1 if row and row['readRanges'] else 1);assert 1<=lo<=len(lines)
 out=[];size=0;hi=lo-1
 for i in range(lo-1,len(lines)):
  text=f'{i+1:4d} | {lines[i]}\n';n=len(text.encode())
  if out and size+n>7000:break
  out.append(text);size+=n;hi=i+1
 body=''.join(out);assert len(body.encode())<=9500,'single oversized line; manual bounded read required'
 id=f'R{len(s["readEvents"])+len(s["pending"])+1:04d}'
 e={'path':f,'sha256':sha,'lineCount':len(lines),'range':[lo,hi],'at':STAMP(),'textArtifact':f'read-text/{id}.txt','outputBytes':len(body.encode())}
 (BASE/'read-text').mkdir(exist_ok=True);(BASE/e['textArtifact']).write_text(f'{f} SHA256 {sha} [{lo},{hi}]\n'+body)
 s['pending'][id]=e
 print(f'=== {f} [{lo},{hi}]/{len(lines)} ===\n'+body+f'=== END {id}; next={hi+1 if hi<len(lines) else "EOF"}; SHA256={sha} ===')
s['updatedAt']=STAMP();s['files']=sorted(s['files'],key=lambda v:v['path']);s['checkpoint']={'fullyReadFiles':sum(v['fullTextRead'] for v in s['files']),'partiallyReadFiles':sum(not v['fullTextRead'] for v in s['files']),'readLines':sum(hi-lo+1 for v in s['files'] for lo,hi in v['readRanges']),'totalFiles':len(expected),'totalLines':scope['lineCount'],'unreadFiles':len(expected)-len(s['files']),'pendingReadOutputCount':len(s['pending'])};save(ledger,s)
if a.status or (a.ack and not a.view):print(json.dumps(s['checkpoint'],ensure_ascii=False,indent=2))
