/**
 * 打印线上 Worker 的 secrets（JSON），供 `wrangler secret bulk` 从 stdin 读入；私钥不落盘。
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon / publishable key> \
 *     node scripts/deploy-secrets.mjs [--new-ticket-key] | wrangler secret bulk
 *
 * 默认不含签票私钥 `TICKET_PRIVATE_JWK`：`secret bulk` 只覆盖列出的键，线上那把照旧。首次部署（还没有这把钥）
 * 与确实要换钥时才带 `--new-ticket-key`，新生成一把 Ed25519 私钥：换钥让所有正在握手的连接票据失效
 * （已建立的会话不受影响），不该随每次改 Supabase 配置顺带发生。
 */
const NEW_TICKET_KEY = '--new-ticket-key';

const args = process.argv.slice(2);
const unknown = args.find(arg => arg !== NEW_TICKET_KEY);
if (unknown) throw new Error(`unknown argument ${unknown}: the only option is ${NEW_TICKET_KEY}`);

const { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey } = process.env;
if (!supabaseUrl?.startsWith('https://') || !supabaseAnonKey) {
  throw new Error('set SUPABASE_URL (https://…) and SUPABASE_ANON_KEY');
}

const generateTicketKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
};

const secrets = { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey };
process.stdout.write(
  JSON.stringify(
    args.includes(NEW_TICKET_KEY) ? { ...secrets, TICKET_PRIVATE_JWK: await generateTicketKey() } : secrets
  )
);
