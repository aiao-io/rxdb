from pathlib import Path
import sys,json,hashlib,datetime
root=Path('/Users/jimmy/Documents/aiao/rxdb')
base=Path(__file__).resolve().parent
state=base/'file-inspection.json'
manifest=base/'literal-read-manifest.json'
data=json.loads(state.read_text())
log=json.loads(manifest.read_text()) if manifest.exists() else []
mode=sys.argv[1]
if mode=='emit':
    path=sys.argv[2]
    if not path.startswith('packages/rxdb-plugin-working-tree/'):
        path='packages/rxdb-plugin-working-tree/'+path
    raw=(root/path).read_bytes(); sha=hashlib.sha256(raw).hexdigest(); lines=raw.decode().splitlines(); start=int(sys.argv[3]) if len(sys.argv)>3 else 1
    end=int(sys.argv[4]) if len(sys.argv)>4 else len(lines)
    out=[];count=0
    for no in range(start,min(end,len(lines))+1):
        line=f'{no}: {lines[no-1]}\n';size=len(line.encode())
        if out and count+size>6800:break
        out.append(line);count+=size
    stop=start+len(out)-1
    key=f'{path}:{start}-{stop}:{sha[:12]}'
    log.append({'id':key,'path':path,'sha256':sha,'lineCount':len(lines),'range':[start,stop],'literalUtf8Bytes':count,'acknowledged':False})
    manifest.write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
    print(f'FILE {path} SHA {sha}\nRANGE {start}-{stop}/{len(lines)} NEXT {stop+1 if stop<len(lines) else "EOF"}\n'+''.join(out))
elif mode=='ack':
    entries={f['path']:f for f in data['files']}
    for item in log:
        if item['acknowledged']:continue
        current=hashlib.sha256((root/item['path']).read_bytes()).hexdigest()
        if current!=item['sha256']:raise SystemExit('source changed; do not acknowledge stale bytes')
        v=entries.setdefault(item['path'],{'path':item['path'],'sha256':current,'lineCount':item['lineCount'],'fullTextRead':False,'readRanges':[],'notes':'进行中：正文已读区间见 readRanges；尚未作整文件意见。','C':[]})
        if v['sha256']!=current:raise SystemExit('preserve previous SHA record before re-reading')
        ranges=sorted(v['readRanges']+[item['range']]);merged=[]
        for a,b in ranges:
            if merged and a<=merged[-1][1]+1:merged[-1][1]=max(merged[-1][1],b)
            else:merged.append([a,b])
        v['readRanges']=merged;v['fullTextRead']=merged==[[1,v['lineCount']]];item['acknowledged']=True
    data['files']=sorted(entries.values(),key=lambda x:x['path']);data['updatedAt']=datetime.datetime.now().astimezone().isoformat();tmp=state.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(state);manifest.write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
    print('checkpoint',sum(x['fullTextRead'] for x in entries.values()),'full files;',sum(sum(b-a+1 for a,b in x['readRanges']) for x in entries.values()),'literal lines acknowledged')
else:raise SystemExit('emit <relative path> [start] [end] / ack')
