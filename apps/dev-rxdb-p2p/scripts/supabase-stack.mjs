/**
 * 解析 dev-rxdb-p2p 本地开发与 e2e 用的 Supabase 栈：地址、anon key 与 service role key。
 *
 * - 设置了 `P2P_SUPABASE_URL` / `P2P_SUPABASE_ANON_KEY` 就用它们（CI 指向 action 起的栈）；
 * - 否则取本 checkout 的隔离栈：地址读 docker/supabase-ci-url.sh，anon key 读 docker/docker-compose.ci.yml。
 * - service role key 取 `P2P_SUPABASE_SERVICE_ROLE_KEY`；没设时只在本地栈（localhost）上取 compose 里测试栈的固定 key，
 *   指向托管项目时不猜，返回 undefined，管理后台随之保持「未配置」。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const composeValue = name => {
  const compose = readFileSync(`${repoRoot}docker/docker-compose.ci.yml`, 'utf8');
  const value = new RegExp(`${name}: (\\S+)`).exec(compose)?.[1];
  if (!value) throw new Error(`${name} not found in docker/docker-compose.ci.yml`);
  return value;
};

const isLocal = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname);

/** @returns {{ url: string, anonKey: string, serviceRoleKey: string | undefined }} */
export const resolveStack = () => {
  const { P2P_SUPABASE_URL: url, P2P_SUPABASE_ANON_KEY: anonKey, P2P_SUPABASE_SERVICE_ROLE_KEY: explicit } = process.env;
  const stack =
    url ?
      { url, anonKey: anonKey ?? '' }
    : {
        url: execFileSync('bash', [`${repoRoot}docker/supabase-ci-url.sh`], { encoding: 'utf8' }).trim(),
        anonKey: composeValue('SUPABASE_ANON_KEY')
      };
  if (!stack.anonKey) throw new Error('P2P_SUPABASE_ANON_KEY must be set together with P2P_SUPABASE_URL');
  const serviceRoleKey = explicit || (isLocal(stack.url) ? composeValue('SUPABASE_SERVICE_KEY') : undefined);
  return { ...stack, serviceRoleKey };
};
