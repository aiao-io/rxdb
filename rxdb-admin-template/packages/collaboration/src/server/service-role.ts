import { toBase64, utf8 } from './encoding.js';

/**
 * 协作命令入口专用的数据库角色：迁移 `202611180001_service_role.sql` 建出，只授予命令事务用到的表与列的权限、
 * 各表上仅对它生效的行级策略，以及向协作私有频道广播的定义者函数；不是超级用户，不能绕过行级安全，
 * 不能读写 auth 等其他 schema、不能改表结构与行级策略，也读不到初始化密钥。迁移只建 NOLOGIN 的角色，
 * 口令与登录权由部署步骤设置（{@link servicePasswordStatement}），不写进迁移。
 */
export const serviceRole = 'admin_collaboration';

/** 连接串里的用户名是否为专用角色：直连时就是角色名，经 Supavisor 连接时为 `<角色>.<项目 ref>`。 */
export function isServiceRoleUser(user: string): boolean {
  return user === serviceRole || (user.startsWith(`${serviceRole}.`) && user.length > serviceRole.length + 1);
}

/** PostgreSQL 默认的 SCRAM 迭代次数。 */
const defaultIterations = 4096;
const hmac = async (key: Uint8Array<ArrayBuffer>, text: string) => {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, utf8(text)));
};

/**
 * 口令的 SCRAM-SHA-256 校验值（PostgreSQL 存在 `pg_authid.rolpassword` 里的格式，RFC 5802 / 7677）：
 * `SCRAM-SHA-256$<迭代次数>:<盐>$<StoredKey>:<ServerKey>`。设置口令时只把它发给数据库，明文不出现在 SQL 与数据库日志里。
 * `salt` 默认 16 字节随机数，测试可注入固定值。
 */
export async function scramVerifier(
  password: string,
  options: { salt?: Uint8Array<ArrayBuffer>; iterations?: number } = {}
): Promise<string> {
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const iterations = options.iterations ?? defaultIterations;
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const salted = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256)
  );
  const clientKey = await hmac(salted, 'Client Key');
  const storedKey = new Uint8Array(await crypto.subtle.digest('SHA-256', clientKey));
  const serverKey = await hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${toBase64(salt)}$${toBase64(storedKey)}:${toBase64(serverKey)}`;
}

/** SCRAM 校验值只含这些字符：可以直接放进 SQL 字符串字面量，不需要转义。 */
const verifierFormat = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

/**
 * 部署步骤：允许专用角色登录并设置口令的语句（以迁移所有者，即 Supabase 的 postgres 角色执行）。口令为空时抛错。
 * 生产在函数环境里另设连接串 `ADMIN_DATABASE_URL`，口令只出现在那里与这一次部署步骤中。
 */
export async function servicePasswordStatement(password: string): Promise<string> {
  if (!password) throw new Error('The service role password must not be empty');
  const verifier = await scramVerifier(password);
  if (!verifierFormat.test(verifier)) throw new Error('Unexpected SCRAM verifier format');
  return `ALTER ROLE ${serviceRole} WITH LOGIN PASSWORD '${verifier}'`;
}
