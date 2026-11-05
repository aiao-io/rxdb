/**
 * 生成 wrangler 本地开发用的 `.dev.vars`（已被 .gitignore 忽略）。
 *
 * - Supabase 地址、anon key 与 service role key：见 supabase-stack.mjs（CI 指向 action 起的栈，否则取本 checkout 的隔离栈）。
 * - 签票私钥 `TICKET_PRIVATE_JWK`：首次生成 Ed25519 私钥，之后沿用文件里已有的那把。
 * - 管理员名单 `ADMIN_USER_IDS`：取环境变量 `P2P_ADMIN_USER_IDS`（逗号分隔的 Supabase 用户 id），没设就沿用文件里已有的；
 *   都没有就不写，管理后台保持「未配置」。
 *
 * 文件里有签票私钥与 service role key，只给本人读写（0600）。
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveStack } from './supabase-stack.mjs';

const devVarsPath = `${fileURLToPath(new URL('..', import.meta.url))}.dev.vars`;

const supabase = resolveStack();

const generateTicketKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
};

/** 直接读、不做 existsSync 预检：预检结果到读写时可能已过期；文件不存在即首次生成。 */
const readPrevious = () => {
  try {
    return readFileSync(devVarsPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
};

const previous = readPrevious();
const previousValue = name => new RegExp(`^${name}=(.+)$`, 'm').exec(previous)?.[1];
const ticketKey = previousValue('TICKET_PRIVATE_JWK') ?? (await generateTicketKey());
const adminIds = (process.env.P2P_ADMIN_USER_IDS || previousValue('ADMIN_USER_IDS') || '')
  .split(/[\s,]+/)
  .filter(Boolean)
  .join(',');

const lines = [
  `SUPABASE_URL=${supabase.url}`,
  `SUPABASE_ANON_KEY=${supabase.anonKey}`,
  `TICKET_PRIVATE_JWK=${ticketKey}`,
  ...(supabase.serviceRoleKey ? [`SUPABASE_SERVICE_ROLE_KEY=${supabase.serviceRoleKey}`] : []),
  ...(adminIds ? [`ADMIN_USER_IDS=${adminIds}`] : [])
];
// 先写同目录的新文件再改名替换：几个服务同时起时，读的一方只会看到完整的旧文件或新文件。
// `wx` 保证这个文件是新建的，`mode` 才生效；替换之后旧文件原来宽松的权限也就不在了。
// 临时文件名落在仓库根 .gitignore 的 `*.tmp` 里，不会被当成改动提交。
const temporary = `${devVarsPath}.${process.pid}.tmp`;
writeFileSync(temporary, [...lines, ''].join('\n'), { mode: 0o600, flag: 'wx' });
renameSync(temporary, devVarsPath);
console.log(`✅ .dev.vars → Supabase ${supabase.url}${adminIds ? '，管理后台已配置' : '，管理后台未配置'}`);
