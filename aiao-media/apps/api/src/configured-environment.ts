import { installation } from './installation.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 只从安装服务的内部接口取得服务端配置，供路由和后台任务共用。 */
export async function configuredEnvironment(env: WorkerEnv): Promise<WorkerEnv> {
  const setup = installation(env);
  if (!setup) return env;
  const installed = await setup.fetch('https://installation/internal/config');
  if (!installed.ok) throw new Error('Installation configuration unavailable');
  const config = await installed.json<Partial<WorkerEnv> | null>();
  return config ? { ...env, ...config } : env;
}
