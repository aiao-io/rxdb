/**
 * 打印线上 Worker 的 secrets（JSON），供 `wrangler secret bulk` 从 stdin 读入；私钥不落盘。
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon / publishable key> \
 *     node scripts/deploy-secrets.mjs | wrangler secret bulk
 *
 * `TICKET_PRIVATE_JWK` 每次新生成一把 Ed25519 私钥：换钥只让正在握手的连接票据失效，已建立的会话不受影响。
 */
const { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey } = process.env;
if (!supabaseUrl?.startsWith('https://') || !supabaseAnonKey) {
  throw new Error('set SUPABASE_URL (https://…) and SUPABASE_ANON_KEY');
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const ticketKey = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));

process.stdout.write(
  JSON.stringify({ SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey, TICKET_PRIVATE_JWK: ticketKey })
);
