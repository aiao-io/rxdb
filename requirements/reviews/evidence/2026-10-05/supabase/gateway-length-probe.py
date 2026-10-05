from pathlib import Path
import json,re,subprocess,urllib.parse,urllib.request,urllib.error,uuid
root=Path(__file__).resolve().parents[5]
base=subprocess.check_output(['bash','docker/supabase-ci-url.sh'],cwd=root,text=True).strip()
config=(root/'docker/docker-compose.ci.yml').read_text()
key=re.search(r'^\s*SUPABASE_ANON_KEY:\s*(\S+)\s*$',config,re.M).group(1)
results=[]
for count in [80,400]:
 ids=[str(uuid.uuid4()) for _ in range(count)]
 query=urllib.parse.urlencode({'id':'in.('+','.join(ids)+')','select':'id'})
 url=base+'/rest/v1/todos?'+query
 request=urllib.request.Request(url,method='DELETE',headers={'apikey':key,'Authorization':'Bearer '+key,'Prefer':'return=representation'})
 try:
  response=urllib.request.urlopen(request,timeout=10)
 except urllib.error.HTTPError as error:
  response=error
 body=response.read().decode()
 results.append({'entityCount':count,'method':'DELETE','urlLength':len(url),'status':response.status,'corsAllowOrigin':response.headers.get('Access-Control-Allow-Origin'),'body':body[:300]})
result={'boundary':'Native HTTP without browser CORS; original CI Kong and PostgREST. Random absent UUIDs only, no matching business rows.', 'credentialsWritten':False,'measurements':results}
assert results[0]['status']==200,results
assert results[1]['status']==414,results
(Path(__file__).parent/'gateway-length-probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
