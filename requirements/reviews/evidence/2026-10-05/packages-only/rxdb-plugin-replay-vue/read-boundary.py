from pathlib import Path
import hashlib,json,re,sys
root=Path('/Users/jimmy/Documents/aiao/rxdb')
base=Path(__file__).resolve().parent
label,path=sys.argv[1:3]
data=(root/path).read_bytes();lines=data.decode().splitlines()
lo=int(sys.argv[3]) if len(sys.argv)>3 else 1
hi=min(int(sys.argv[4]),len(lines)) if len(sys.argv)>4 else len(lines)
sha=hashlib.sha256(data).hexdigest()
normalize=len(sys.argv)>5 and sys.argv[5]=='doc'
body=[f'--- {path} SHA256={sha} lines={len(lines)} read={lo}-{hi} ---']
for i in range(lo,hi+1):
 line=re.sub(r' {2,}',' ',lines[i-1]) if normalize else lines[i-1]
 body.append(f'{i:4d} {line}')
text='\n'.join(body)+'\n'
(base/(label+'.txt')).write_text(text)
record={'path':path,'sha256':sha,'lineCount':len(lines),'readRanges':[[lo,hi]],'transcript':label+'.txt','tableSpacingNormalized':normalize}
(base/(label+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(text)
