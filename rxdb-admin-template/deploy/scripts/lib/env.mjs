/**
 * 本地预演栈的部署环境（ADMIN-US-217 AC#3）：服务端密钥只来自 `deploy/local/.env.local`，由 {@link ensureEnvFile} 第一次起栈时
 * 用随机数生成（权限 600，被 .gitignore 忽略，已存在时绝不覆盖）。仓库里只有不含任何值的 `.env.example`。
 *
 * 身份用非对称签名密钥（与生产计划一致）：GoTrue 以 ES256 私钥签用户令牌（`JWT_KEYS`），PostgREST、Realtime 与命令入口
 * 按公开的 JWKS 验签；anon / service role 两个 API key 仍是 HS256 共享密钥（`JWT_SECRET`）签的长期令牌，与托管 Supabase 的
 * 旧版 API key 相同，所以 `JWT_JWKS` 里另带这把对称密钥给 PostgREST 与 Realtime 校验 API key。
 */
import { createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { envFile, local, ports } from './paths.mjs';

/** `.env.local` 里必须有的变量（都是密钥或由密钥派生）。 */
export const secretNames = [
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'ANON_KEY',
  'SERVICE_ROLE_KEY',
  'JWT_KEYS',
  'JWT_JWKS',
  'REALTIME_DB_ENC_KEY',
  'SECRET_KEY_BASE',
  'PG_META_CRYPTO_KEY',
  'ADMIN_SERVICE_PASSWORD',
  'ADMIN_BOOTSTRAP_KEY'
];

/** 以 HS256 共享密钥签一个长期 API key（anon / service_role），与 Supabase 旧版 API key 同形。 */
export function apiKey(role, secret, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase', iat: now, exp: now + 10 * 365 * 86400 })}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

/**
 * 生成一套新的密钥：数据库口令、HS256 共享密钥与两个 API key、ES256 签名密钥对（私钥给 GoTrue，公钥连同对称密钥组成 JWKS）、
 * Realtime 与 Studio 的加密密钥、协作专用角色口令与初始化密钥。口令只用十六进制字符，放进连接串不需要转义。
 */
export function generateSecrets() {
  const jwtSecret = randomBytes(48).toString('base64url');
  const kid = randomUUID();
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { kty, crv, x, y, d } = privateKey.export({ format: 'jwk' });
  const signing = { kty, crv, x, y, d, kid, alg: 'ES256', use: 'sig', key_ops: ['sign', 'verify'] };
  // 对称密钥按原始字节编码：GoTrue 以密钥字符串的 UTF-8 字节签 HS256
  const legacy = { kty: 'oct', k: Buffer.from(jwtSecret, 'utf8').toString('base64url'), alg: 'HS256', use: 'sig' };
  const jwks = {
    keys: [
      { kty, crv, x, y, kid, alg: 'ES256', use: 'sig', key_ops: ['verify'] },
      { ...legacy, key_ops: ['verify'] }
    ]
  };
  return {
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: jwtSecret,
    ANON_KEY: apiKey('anon', jwtSecret),
    SERVICE_ROLE_KEY: apiKey('service_role', jwtSecret),
    // GoTrue 只接受 JWT_KEYS 里出现过的算法：带上只验签的对称密钥，anon / service role key（HS256）才能调用管理接口；
    // 签名密钥只有 ES256 这一把（GoTrue 要求恰好一把），JWKS 接口也不公开对称密钥
    JWT_KEYS: JSON.stringify([signing, { ...legacy, kid: 'legacy-hs256', key_ops: ['verify'] }]),
    JWT_JWKS: JSON.stringify(jwks),
    // Realtime 以 AES-128 加密租户配置：恰好 16 个字符
    REALTIME_DB_ENC_KEY: randomBytes(8).toString('hex'),
    SECRET_KEY_BASE: randomBytes(48).toString('hex'),
    PG_META_CRYPTO_KEY: randomBytes(32).toString('hex'),
    ADMIN_SERVICE_PASSWORD: randomBytes(24).toString('hex'),
    ADMIN_BOOTSTRAP_KEY: randomUUID()
  };
}

/** 写成 compose 与 Node 都能读的 env 文件：JSON 值用单引号括起（单引号内按字面量读取）。 */
export function formatEnv(values) {
  const header = [
    '# 本地预演栈的密钥（ADMIN-US-217），由 deploy/scripts/local-stack.mjs 随机生成。不要提交、不要复制到前端配置。',
    '# 重新生成：先 `pnpm nx run rxdb-admin-template:local-down -- --volumes`，再删除本文件后 local-up。'
  ];
  const lines = Object.entries(values).map(([name, value]) =>
    /[{}[\]"\s]/.test(value) ? `${name}='${value}'` : `${name}=${value}`
  );
  return `${[...header, ...lines].join('\n')}\n`;
}

/** 生成 `.env.local`（不存在时）；已存在时保留原值。返回是否新生成。 */
export async function ensureEnvFile(file = envFile) {
  try {
    await writeFile(file, formatEnv(generateSecrets()), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

/** 读取 `.env.local` 并检查每个密钥都在；缺文件时提示先起栈。 */
export async function loadEnv(file = envFile) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error('缺少 deploy/local/.env.local：先运行 pnpm nx run rxdb-admin-template:local-up', {
        cause: error
      });
    throw error;
  }
  const env = parseEnv(text);
  for (const name of secretNames) if (!env[name]) throw new Error(`deploy/local/.env.local 缺少 ${name}`);
  return env;
}

/** 以给定用户与口令拼本机连接串（口令只含十六进制字符）。 */
export function databaseUrl(user, password, port = ports.database, host = '127.0.0.1') {
  const url = new URL(`postgres://${host}:${port}/postgres`);
  url.username = user;
  url.password = password;
  return url.href;
}

/** 迁移所有者（Supabase 的 postgres 角色）的直连：部署期的迁移、口令、初始化与运维命令用它，命令入口拿不到。 */
export const ownerDatabaseUrl = env => databaseUrl('postgres', env.POSTGRES_PASSWORD);

/** 测试与验收脚本访问部署栈所需的设置（service role key 只在测试侧使用，不进任何前端产物）。 */
export function deployedTarget(env) {
  return {
    supabaseUrl: local.supabaseUrl,
    anonKey: env.ANON_KEY,
    serviceKey: env.SERVICE_ROLE_KEY,
    ownerDatabaseUrl: ownerDatabaseUrl(env),
    functionUrl: local.functionUrl
  };
}
