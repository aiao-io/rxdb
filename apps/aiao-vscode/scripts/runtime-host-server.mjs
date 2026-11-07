// 验证脚本共用（US-409）：按部署配置找工作台来源对应的运行时宿主源，必要时起宿主的静态服务。
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { RUNTIME_HOSTS } from '../src/runtime-hosts/hosts.ts';

/** 跑在独立源宿主页里的运行方式。 */
export const isHostedRuntime = runtime => Object.hasOwn(RUNTIME_HOSTS, runtime);

/** 工作台来源对应的宿主源；部署配置（src/runtime-hosts/hosts.ts）里没有时明确报错。 */
export function runtimeHostFor(runtime, url) {
  const { origin } = new URL(url);
  const host = RUNTIME_HOSTS[runtime]?.[origin];
  if (!host) throw new Error(`工作台来源 ${origin} 没有在 src/runtime-hosts/hosts.ts 里配置 ${runtime} 宿主`);
  return host;
}

/** 起全部运行时宿主的静态服务（先构建 runtime-hosts），等它打印就绪行；返回子进程，用完 kill。 */
export async function startRuntimeHost() {
  const child = spawn(process.execPath, [resolve(import.meta.dirname, 'serve-runtime-hosts.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((done, fail) => {
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('运行时宿主已就绪')) done();
    });
    child.once('exit', code => fail(new Error(`运行时宿主服务退出（${code}），端口可能已被占用`)));
  });
  return child;
}

/** 已在运行的宿主服务（如 nx serve 带起的）是否可达。 */
export async function assertRuntimeHost(host) {
  const reachable = await fetch(host, { signal: AbortSignal.timeout(3000) }).then(
    response => response.ok,
    () => false
  );
  if (!reachable) throw new Error(`运行时宿主 ${host} 没有响应：先运行 pnpm nx run aiao-vscode:serve-runtime-hosts`);
}
