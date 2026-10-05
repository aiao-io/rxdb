import sys,json,hashlib
from pathlib import Path
base=Path(__file__).resolve().parent
idx=base/'file-inspection.json'
data=json.loads(idx.read_text())
chars=0
for arg in sys.argv[1:]:
 parts=arg.split('::')
 p=Path(parts[0]); text=p.read_text(); lines=text.splitlines()
 start=int(parts[1]) if len(parts)>1 else 1
 end=min(int(parts[2]) if len(parts)>2 else len(lines),len(lines))
 print('\n--- '+str(p)+' ['+str(start)+'-'+str(end)+'/'+str(len(lines))+'] ---')
 shown_end=start-1
 for n in range(start,end+1):
  out=str(n)+': '+lines[n-1]
  if chars+len(out)>6500:break
  print(out);chars+=len(out)+1;shown_end=n
 if shown_end<end:print('CAP: 下一段从 '+str(shown_end+1)+' 开始；未输出行不记阅读。')
 end=shown_end
 if end<start:continue
 row=next((r for r in data['files'] if r['path']==str(p)),None)
 if row is None:
  row={'path':str(p),'absolutePath':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'totalLines':len(lines),'displayedRanges':[],'readComplete':False};data['files'].append(row)
 row['displayedRanges'].append([start,end]); ranges=sorted(row['displayedRanges']); merged=[]
 for a,b in ranges:
  if merged and a<=merged[-1][1]+1:merged[-1][1]=max(merged[-1][1],b)
  else:merged.append([a,b])
 row['displayedRanges']=merged;row['readComplete']=merged==[[1,len(lines)]]
idx.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
