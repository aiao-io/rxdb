import type { Vivari } from '@vivari/core';
import type { GithubTerminalRequest, GithubTerminalResult } from './workspace-git';

function requestOf(text: string): GithubTerminalRequest {
  if (text.length > 65536) throw new Error('Git arguments exceed 64 KiB');
  const request: unknown = JSON.parse(text);
  if (!request || typeof request !== 'object' || !('cwd' in request) || typeof request.cwd !== 'string' || !request.cwd.startsWith('/') || !('args' in request) || !Array.isArray(request.args) || !request.args.every(arg => typeof arg === 'string')) throw new Error('Invalid Git arguments');
  return { cwd: request.cwd, args: request.args };
}

/** 在 VM 自己的临时目录收发请求。子进程自行输出结果，管道、重定向和退出码都由 shell 处理。 */
export async function gitMailbox(fs: Vivari['fs'], run: (request: GithubTerminalRequest) => Promise<GithubTerminalResult>) {
  const directory = `/tmp/aiao-git-${crypto.randomUUID()}`;
  await fs.mkdir(directory);
  let busy = false;
  async function consume(name: string) {
    const file = `${directory}/${name}`;
    let result: GithubTerminalResult;
    try { result = await run(requestOf(await fs.readFile(file, 'utf-8'))); }
    catch (error) { result = { code: 1, stdout: '', stderr: `git: ${error instanceof Error ? error.message : String(error)}\n` }; }
    await fs.rm(file);
    await fs.writeFile(`${file}.tmp`, JSON.stringify(result));
    await fs.rename(`${file}.tmp`, `${file}.out`);
  }
  async function scan() {
    if (busy) return;
    busy = true;
    try {
      for (const name of await fs.readdir(directory)) if (/^[a-z0-9-]+\.in$/i.test(name)) await consume(name);
    } finally { busy = false; }
  }
  return { directory, scan, dispose: () => fs.rm(directory) };
}
