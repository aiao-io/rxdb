import argparse,datetime,fcntl,hashlib,json,os,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--scope',action='append',default=[]);p.add_argument('--cwd',default='/Users/jimmy/Documents/aiao/rxdb');p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args();cmd=a.command[1:] if a.command[:1]==['--'] else a.command
root=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb');dest=root/'requirements/reviews/evidence/2026-10-05/parallel-round3'/a.name;dest.mkdir(parents=True,exist_ok=True)
with open('/tmp/rxdb-review-heavy-task.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 stamp=datetime.datetime.now().astimezone().strftime('%Y%m%dT%H%M%S%f');prefix=dest/stamp
 paths=subprocess.check_output(['git','ls-files','--',*a.scope],cwd=root,text=True).splitlines() if a.scope else []
 files={str(n):hashlib.sha256((root/n).read_bytes()).hexdigest() for n in paths if (root/n).is_file()};head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();start=time.time()
 env={**os.environ,'CI':'true','CODECOV_TOKEN':'','NX_DAEMON':'false','FORCE_COLOR':'0'}
 with prefix.with_suffix('.txt').open('w') as out:
  out.write('COMMAND: '+json.dumps(cmd,ensure_ascii=False)+'\nCWD: '+a.cwd+'\n');out.flush();q=subprocess.run(cmd,cwd=a.cwd,env=env,stdout=out,stderr=subprocess.STDOUT)
 drift=[n for n,h in files.items() if not (root/n).is_file() or hashlib.sha256((root/n).read_bytes()).hexdigest()!=h]
 d={'clientDate':'2026-10-05','startedAt':datetime.datetime.fromtimestamp(start).astimezone().isoformat(),'headAtStart':head,'headAtFinish':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'command':cmd,'cwd':a.cwd,'exitCode':q.returncode,'elapsedSeconds':round(time.time()-start,3),'scopedInputCount':len(files),'changedInputsDuringMeasurement':drift,'serialHeavyTaskLock':True,'rawLog':str(prefix.with_suffix('.txt').relative_to(root))}
 prefix.with_suffix('.status.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');prefix.with_suffix('.inputs.json').write_text(json.dumps(files,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d,ensure_ascii=False,indent=2));print('\n'.join(prefix.with_suffix('.txt').read_text().splitlines()[-36:]));raise SystemExit(q.returncode)
