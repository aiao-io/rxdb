from pathlib import Path
import subprocess,json,datetime,hashlib,os,re
root=Path(__file__).resolve().parents[5]
ev=Path(__file__).parent
package=root/'packages/rxdb-adapter-supabase'
new_files=['src/__tests__/review-large-rest-writes.spec.ts','src/__tests__/review-querycache-relations.spec.ts']
base=json.loads((package/'tsconfig.spec.json').read_text())
configs={
 'new-spec-types-delivery':{'extends':'./tsconfig.spec.json','include':new_files+['src/__tests__/wa-sqlite-wasm.ts'],'references':base['references']},
 'existing-spec-types-delivery':{'extends':'./tsconfig.spec.json','exclude':new_files,'references':base['references']}
}
env=os.environ.copy();env.update(CI='true',CODECOV_TOKEN='',NX_DAEMON='false',NX_SKIP_REMOTE_CACHE='true',NX_SKIP_NX_CACHE='true')
summary={}
for name,config in configs.items():
 path=package/f'.review-{name}.json';body=json.dumps(config,indent=2)+'\n';sha=hashlib.sha256(body.encode()).hexdigest()
 with path.open('x') as out:out.write(body)
 (ev/f'{name}-config.json').write_text(body)
 command=['pnpm','nx','exec','-p','rxdb-adapter-supabase','--skipRemoteCache','--skipNxCache','--','pnpm','exec','tsc','-p',str(path),'--noEmit','--pretty','false']
 try:
  with (ev/f'{name}.txt').open('w') as out:
   out.write('COMMAND: '+' '.join(command)+'\n');out.flush();result=subprocess.run(command,cwd=root,env=env,stdout=out,stderr=subprocess.STDOUT)
  diagnostics=re.findall(r'([^\n]+)\(\d+,\d+\): error (TS\d+): ([^\n]+)',(ev/f'{name}.txt').read_text())
  status={'command':command,'exitCode':result.returncode,'temporaryConfig':'Created next to original tsconfig.spec.json for standard type package resolution; removed only when unchanged. Config body saved separately.','diagnosticCount':len(diagnostics),'diagnosticFiles':sorted(set(x[0] for x in diagnostics)),'recordedAt':datetime.datetime.now().astimezone().isoformat()}
  (ev/f'{name}-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n');summary[name]=status
 finally:
  assert hashlib.sha256(path.read_bytes()).hexdigest()==sha,('temporary config changed externally',path)
  path.unlink()
assert summary['new-spec-types-delivery']['exitCode']==0,summary
assert summary['existing-spec-types-delivery']['exitCode']==1,summary
assert summary['existing-spec-types-delivery']['diagnosticCount']==9,summary
print(json.dumps(summary,ensure_ascii=False,indent=2))
