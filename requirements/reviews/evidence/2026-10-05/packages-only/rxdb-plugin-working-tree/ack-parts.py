from pathlib import Path
import json,sys,hashlib,datetime
root=Path('/Users/jimmy/Documents/aiao/rxdb');base=Path(__file__).resolve().parent;p=base/'file-inspection.json';d=json.loads(p.read_text());t=json.loads((base/'read-output-trace.json').read_text());scope=json.loads((base/'scope.json').read_text());counts={x['path']:x['lineCount'] for x in scope['files']};entries={x['path']:x for x in d['files']};acked=set(d.get('acknowledgedParts',[]))
for part in sys.argv[1:]:
    for item in t['parts'][part]['ranges']:
        path=item['path'];sha=hashlib.sha256((root/path).read_bytes()).hexdigest()
        if sha!=item['sha256']:raise SystemExit('SHA changed: '+path)
        f=entries.setdefault(path,{'path':path,'sha256':sha,'lineCount':counts[path],'fullTextRead':False,'readRanges':[],'notes':'进行中：已读正文区间；整文件关注结论待填。','C':[]})
        if f['sha256']!=sha:raise SystemExit('preserve stale read before re-reading: '+path)
        merged=[]
        for a,b in sorted(f['readRanges']+[item['range']]):
            if merged and a<=merged[-1][1]+1:merged[-1][1]=max(b,merged[-1][1])
            else:merged.append([a,b])
        f['readRanges']=merged;f['fullTextRead']=merged==[[1,f['lineCount']]]
    acked.add(int(part))
d['files']=sorted(entries.values(),key=lambda f:f['path']);d['acknowledgedParts']=sorted(acked);d['updatedAt']=datetime.datetime.now().astimezone().isoformat();tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)
print('checkpoint',sum(f['fullTextRead'] for f in entries.values()),'/152 full files;',sum(sum(b-a+1 for a,b in f['readRanges']) for f in entries.values()),'/43861 lines')
