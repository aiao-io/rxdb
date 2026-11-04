/**
 * 生成 wrangler 本地开发用的 `.dev.vars`（已被 .gitignore 忽略）。
 *
 * - Supabase 地址与 anon key：设置了 `P2P_SUPABASE_URL` / `P2P_SUPABASE_ANON_KEY` 就用它们（CI 指向 action 起的栈）；
 *   否则取本 checkout 的隔离栈：地址读 docker/supabase-ci-url.sh，anon key 读 docker/docker-compose.ci.yml。
 * - 签票私钥 `TICKET_PRIVATE_JWK`：首次生成 Ed25519 私钥，之后沿用文件里已有的那把。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const devVarsPath = `${appDir}.dev.vars`;

const isolatedStack = () => {
  const url = execFileSync('bash', [`${repoRoot}docker/supabase-ci-url.sh`], { encoding: 'utf8' }).trim();
  const compose = readFileSync(`${repoRoot}docker/docker-compose.ci.yml`, 'utf8');
  const anonKey = /SUPABASE_ANON_KEY: (\S+)/.exec(compose)?.[1];
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY not found in docker/docker-compose.ci.yml');
  return { url, anonKey };
};

const supabase =
  process.env.P2P_SUPABASE_URL ?
    { url: process.env.P2P_SUPABASE_URL, anonKey: process.env.P2P_SUPABASE_ANON_KEY ?? '' }
  : isolatedStack();
if (!supabase.anonKey) throw new Error('P2P_SUPABASE_ANON_KEY must be set together with P2P_SUPABASE_URL');

const generateTicketKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
};

const previous = existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8') : '';
const ticketKey = /^TICKET_PRIVATE_JWK=(.+)$/m.exec(previous)?.[1] ?? (await generateTicketKey());

writeFileSync(
  devVarsPath,
  [`SUPABASE_URL=${supabase.url}`, `SUPABASE_ANON_KEY=${supabase.anonKey}`, `TICKET_PRIVATE_JWK=${ticketKey}`, ''].join(
    '\n'
  )
);
console.log(`✅ .dev.vars → Supabase ${supabase.url}`);
