from pathlib import Path
import argparse,json,hashlib,datetime,sys
D=Path(__file__).resolve().parent;ROOT=D.parents[6]
ROOT=Path('/Users/jimmy/Documents/aiao/rxdb')
p=argparse.ArgumentParser();p.add_argument('parts');a=p.parse_args();notes=json.load(sys.stdin);trace=json.loads((D/'read-output-trace.json').read_text());ins=json.loads((D/'file-inspection.json').read_text());rs={x['path']:x for x in ins['files']}
for part in map(int,a.parts.split(',')):
 for e in trace['parts'][str(part)]['ranges']:
  path=e['path'];raw=(ROOT/path).read_bytes();n=len(raw.decode().splitlines());sha=hashlib.sha256(raw).hexdigest();assert sha==e['sha256'],'drift since actual output'
  v=rs.setdefault(path,{'path':path,'sha256':sha,'lineCount':n,'fullTextRead':False,'readRanges':[],'notes':'','C':[],'acceptedParts':[]});assert v['sha256']==sha
  ranges=sorted(v['readRanges']+([e['range']] if e['range'] else []));m=[]
  for lo,hi in ranges:
   if m and lo<=m[-1][1]+1:m[-1][1]=max(m[-1][1],hi)
   else:m.append([lo,hi])
  v['readRanges']=m;v['fullTextRead']=m==[[1,n]] if n else True;v['lineCount']=n;v['acceptedParts']=sorted(set(v.get('acceptedParts',[])+[part]));v['lastReviewedAt']=datetime.datetime.now().astimezone().isoformat()
for suffix,op in notes.items():
 path=suffix if suffix.startswith('packages/') else 'packages/rxdb-adapter-pglite/'+suffix;v=rs[path];v['notes']=op['notes'];v['C']=op['C']
for v in rs.values():assert v['notes'],'actual opinion missing: '+v['path']
ins['files']=sorted(rs.values(),key=lambda x:x['path']);ins['lastCheckpointAt']=datetime.datetime.now().astimezone().isoformat();t=D/'file-inspection.json.tmp';t.write_text(json.dumps(ins,ensure_ascii=False,indent=2)+'\n');t.replace(D/'file-inspection.json');print('checkpoint',len(rs),'files touched;',sum(v['fullTextRead'] for v in rs.values()),'complete;',sum(sum(b-a+1 for a,b in v['readRanges']) for v in rs.values()),'body lines accepted')
