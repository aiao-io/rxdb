import hashlib,json,pathlib,sys,datetime,re
ROOT=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb')
DIR=ROOT/'requirements/reviews/evidence/2026-10-05/parallel/core'
REG=DIR/'file-inspection.json'
d=json.loads(REG.read_text()) if REG.exists() else {'reviewDate':'2026-10-05','head':'44de1138b4d396fc45d6e76ab60476c40fef2223','method':'逐文件/逐区间输出正文人工审读。sha 仅标识读取版本，inventory 不计已读；全文读取也不等于动态验证。单次正文限制 7500 UTF-8 字节，防止工具截断导致虚报已读。','files':{},'generatedValidation':[]}
used=0
for arg in sys.argv[1:]:
 parts=arg.rsplit(':',1)
 rel=parts[0] if len(parts)==2 and parts[1][0].isdigit() else arg
 p=ROOT/rel; raw=p.read_bytes(); lines=raw.decode().splitlines()
 start,end=1,len(lines)
 if rel!=arg:
  bounds=parts[1].split('-'); start=int(bounds[0]); end=int(bounds[1]) if len(bounds)>1 and bounds[1] else len(lines)
 end=min(end,len(lines))
 header='\n=== '+rel+f' [{start}-{end}/{len(lines)}] ==='
 print(header); used+=len(header.encode()); actual=start-1
 for n in range(start,end+1):
  text=re.sub(r'[ \t]{2,}', ' ', lines[n-1]) if p.suffix=='.md' else lines[n-1]
  text=f'{n:4} {text}'
  if used+len(text.encode())>7500: break
  print(text); used+=len(text.encode())+1; actual=n
 if actual<start:
  print('CAP: 未输出正文，不计读取'); break
 sha=hashlib.sha256(raw).hexdigest(); entry=d['files'].get(rel,{})
 if entry.get('sha256')!=sha: entry={'sha256':sha,'lineCount':len(lines),'ranges':[]}
 entry['ranges'].append([start,actual]); entry['ranges']=sorted(entry['ranges'])
 merged=[]
 for a,b in entry['ranges']:
  if merged and a<=merged[-1][1]+1: merged[-1][1]=max(merged[-1][1],b)
  else: merged.append([a,b])
 entry['ranges']=merged; entry['fullTextRead']=merged==[[1,len(lines)]]; entry['readAt']=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(); d['files'][rel]=entry
 if actual<end:
  print(f'CAP: 下一段 {rel}:{actual+1}-{end}'); break
REG.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
