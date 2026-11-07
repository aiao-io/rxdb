/**
 * 打印管理后台的两个线上 Worker secret（JSON），供 `wrangler secret bulk` 从 stdin 读入；key 不落盘。
 *
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role key> ADMIN_USER_IDS=<管理员用户 id，逗号分隔> \
 *     node scripts/admin-secrets.mjs | wrangler secret bulk
 *
 * 与 deploy-secrets.mjs 分开：这里不换签票私钥，也不动 Supabase 地址。管理员的用户 id 先注册、
 * 再到 Supabase 控制台 Authentication → Users 里复制；用邮箱认定并不安全（测试项目关了邮箱确认，邮箱可以被抢注）。
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, ADMIN_USER_IDS: rawIds } = process.env;
const ids = (rawIds ?? '').split(/[\s,]+/).filter(Boolean);
if (!serviceRoleKey || ids.length === 0) throw new Error('set SUPABASE_SERVICE_ROLE_KEY and ADMIN_USER_IDS');
const invalid = ids.find(id => !UUID_PATTERN.test(id));
if (invalid) throw new Error(`ADMIN_USER_IDS must list Supabase user ids (uuid): "${invalid}" is not one`);

process.stdout.write(JSON.stringify({ SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, ADMIN_USER_IDS: ids.join(',') }));
