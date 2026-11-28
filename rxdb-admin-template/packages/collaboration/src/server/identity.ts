import { CollaborationError, demand, type Identity } from '../model.js';
import { base64UrlJson, fromBase64Url, utf8 } from './encoding.js';

/**
 * 命令入口的身份校验：在本进程里按签名密钥验 Supabase 签发的 access token，稳态下不访问 Auth。
 * 生产用非对称签名密钥（JWKS），本机隔离栈的 GoTrue 用 HS256 共享密钥；二者由部署环境显式二选一，
 * 都缺或都给时启动即失败，运行中不在两种方式之间回退。
 * 验签只用 WebCrypto（`crypto.subtle`），Node 入口与 Supabase Edge Function（Deno）跑同一份代码。
 *
 * 本地验签只证明「这是一个有效会话」：邮箱是否已验证只在接受邀请时向 Auth 确认一次（{@link Identities.confirm}），
 * 成员关系因此只属于验证过邮箱的账号；权限与成员资格仍由每条命令在服务端按成员表裁决，撤权即时生效。
 * 残留窗口：账号在 Auth 里被删除后，已签发的 access token 在过期前仍能通过本地验签（以及 PostgREST、Realtime 的验签），
 * 窗口等于 access token 有效期；团队级撤权不受此影响。
 */

/** 本地验签用的签名密钥：JWKS 地址（生产，非对称），或 HS256 共享密钥（本机隔离栈）。 */
export type SigningKeys = { kind: 'jwks'; url: string } | { kind: 'secret'; secret: string };
/** 令牌校验规则：签名密钥与期望的签发者；`issuer` 为 undefined 时要求令牌不带 iss（本机隔离栈的 GoTrue 不签发 iss）。 */
export interface TokenRules {
  keys: SigningKeys;
  issuer: string | undefined;
}
/** 接受邀请时向 Auth 确认邮箱所需的最小接口（与 supabase-js 的 `auth.getUser` 同形，见 `auth.ts`）。 */
export interface AuthLookup {
  getUser(token: string): Promise<{
    data: { user: { id: string; email?: string; email_confirmed_at?: string | null } | null };
    error: unknown;
  }>;
}
/** 命令入口用的身份：稳态请求本地验签，接受邀请时再向 Auth 确认邮箱。 */
export interface Identities {
  /** 本地验签并返回会话身份；任何不合格（签名、算法、签发者、受众、角色、有效期）都按 `unauthenticated` 拒绝。 */
  verify(token: string): Promise<Identity>;
  /** 向 Auth 确认该会话的账号仍存在、邮箱已验证，并以 Auth 的邮箱为准；只在接受邀请时调用。 */
  confirm(token: string, identity: Identity): Promise<Identity>;
}
/** 身份校验的三个设置在部署环境里的变量名：JWKS 地址、HS256 共享密钥与签发者。 */
export interface TokenVariables {
  jwksUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
}
/** Node 入口的变量名：沿用 Supabase 的命名。 */
export const nodeTokenVariables: TokenVariables = {
  jwksUrl: 'SUPABASE_JWKS_URL',
  jwtSecret: 'SUPABASE_JWT_SECRET',
  jwtIssuer: 'SUPABASE_JWT_ISSUER'
};
/**
 * Edge Function 的变量名：Supabase 不接受 `SUPABASE_` 开头的函数密钥（CLI 设置时直接跳过），平台还会自行注入这个前缀的变量，
 * 函数因此只从自己的 `ADMIN_` 前缀变量读取身份校验设置，不受平台注入的同类变量影响。
 */
export const edgeTokenVariables: TokenVariables = {
  jwksUrl: 'ADMIN_JWKS_URL',
  jwtSecret: 'ADMIN_JWT_SECRET',
  jwtIssuer: 'ADMIN_JWT_ISSUER'
};

/** Supabase access token 的受众与角色：只接受已登录用户的令牌，anon / service_role 等 API key 一律拒绝。 */
const audience = 'authenticated';
/** 共享密钥只签 HS256；JWKS 只接受这两种非对称算法，防止拿公钥当 HMAC 密钥的算法混淆。 */
const asymmetric = ['ES256', 'RS256'] as const;
/** 遇到未知 kid 时重新取 JWKS 的最短间隔：轮换密钥能及时生效，伪造的 kid 也不会把每个请求都变成一次 JWKS 请求。 */
const refetchInterval = 30_000;

const configured = (value: string | undefined) => (value === undefined || value === '' ? undefined : value);
/**
 * 从部署环境读取校验规则：JWKS 地址与共享密钥恰好给一个；用 JWKS 时签发者必填，用共享密钥时可选（不配置即要求令牌不带 iss）。
 * 不满足即抛出配置错误，服务不启动。`variables` 是这三个设置的变量名，默认是 Node 入口的命名（{@link nodeTokenVariables}）。
 */
export function tokenRulesFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  variables: TokenVariables = nodeTokenVariables
): TokenRules {
  const url = configured(env[variables.jwksUrl]);
  const secret = configured(env[variables.jwtSecret]);
  const issuer = configured(env[variables.jwtIssuer]);
  demand((url === undefined) !== (secret === undefined), 'configuration', '身份校验必须且只能配置一种签名密钥', {
    variables: [variables.jwksUrl, variables.jwtSecret]
  });
  if (secret !== undefined) return { keys: { kind: 'secret', secret }, issuer };
  demand(URL.canParse(url!), 'configuration', '签名密钥地址格式错误', { variables: [variables.jwksUrl] });
  demand(issuer, 'configuration', '使用 JWKS 校验令牌时必须配置签发者', { variables: [variables.jwtIssuer] });
  return { keys: { kind: 'jwks', url: url! }, issuer };
}

/** 统一的拒绝：不向客户端透露是哪一项不合格。 */
const rejected = () => new CollaborationError('unauthenticated', '会话已失效，请重新登录');
interface Header {
  alg?: unknown;
  kid?: unknown;
}
interface Claims {
  sub?: unknown;
  aud?: unknown;
  role?: unknown;
  iss?: unknown;
  exp?: unknown;
  nbf?: unknown;
  email?: unknown;
}
interface Token {
  header: Header;
  claims: Claims;
  /** 签名覆盖的字节：`<头部>.<载荷>` 的 UTF-8。 */
  input: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}
/** JWS 紧凑格式里的一段 JSON 对象；不是对象（含 null、数组）即不是合法令牌。 */
function segment(text: string): Record<string, unknown> {
  const value = base64UrlJson(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw rejected();
  return value as Record<string, unknown>;
}
function decode(token: string): Token {
  const parts = token.split('.');
  if (parts.length !== 3) throw rejected();
  try {
    return {
      header: segment(parts[0]) as Header,
      claims: segment(parts[1]) as Claims,
      input: utf8(`${parts[0]}.${parts[1]}`),
      signature: fromBase64Url(parts[2])
    };
  } catch {
    throw rejected();
  }
}
/** 声明的校验：签发者完全一致（未配置即要求没有），受众含 authenticated，角色是 authenticated，在有效期内，sub 非空。 */
function checkClaims(claims: Claims, issuer: string | undefined, now: number): Identity {
  const seconds = now / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const valid =
    claims.iss === issuer &&
    audiences.includes(audience) &&
    claims.role === audience &&
    typeof claims.exp === 'number' &&
    claims.exp > seconds &&
    (claims.nbf === undefined || (typeof claims.nbf === 'number' && claims.nbf <= seconds)) &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0;
  if (!valid) throw rejected();
  return { id: claims.sub as string, email: typeof claims.email === 'string' ? claims.email : '', verified: true };
}
/** 验签本身出错（例如签名长度不合规时某些实现直接抛出）一律按签名无效处理。 */
async function signatureValid(work: () => Promise<boolean>): Promise<boolean> {
  try {
    return await work();
  } catch {
    return false;
  }
}
/** HS256：WebCrypto 的 HMAC 验证按常量时间比较。 */
async function verifyHs256(token: Token, key: Promise<CryptoKey>): Promise<void> {
  if (token.header.alg !== 'HS256') throw rejected();
  const hmac = await key;
  const valid = await signatureValid(() => crypto.subtle.verify('HMAC', hmac, token.signature, token.input));
  if (!valid) throw rejected();
}

/** JWKS 里的一把公钥：它声明的算法与导入后的验签密钥。 */
interface PublicKey {
  alg: (typeof asymmetric)[number];
  key: CryptoKey;
}
/** JWKS 里的一项：标准 JWK 字段加上 kid。 */
type Jwk = JsonWebKey & { kid?: unknown };
/** 导入与验签参数：ES256 是 P-256 上的 ECDSA（签名为 r‖s，与 JWS 一致），RS256 是 RSASSA-PKCS1-v1_5。 */
const algorithms = {
  ES256: { key: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { key: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } }
} as const;
const algorithmOf = (jwk: Jwk): PublicKey['alg'] | undefined => {
  if (jwk.kty === 'EC' && jwk.crv === 'P-256' && (jwk.alg === undefined || jwk.alg === 'ES256')) return 'ES256';
  if (jwk.kty === 'RSA' && (jwk.alg === undefined || jwk.alg === 'RS256')) return 'RS256';
  return undefined;
};
const unavailable = () => new CollaborationError('unavailable', '服务暂时不可用，请稍后按原请求重试');
/** 按 kid 缓存的 JWKS：未知 kid 时最多每 {@link refetchInterval} 重取一次，取失败按服务暂不可用处理。 */
class KeySet {
  private keys = new Map<string, PublicKey>();
  private fetchedAt: number | undefined;
  private pending: Promise<void> | undefined;
  constructor(
    private readonly url: string,
    private readonly fetch: typeof globalThis.fetch,
    private readonly now: () => number
  ) {}
  async find(kid: string): Promise<PublicKey> {
    const known = this.keys.get(kid);
    if (known) return known;
    if (this.fetchedAt === undefined || this.now() - this.fetchedAt >= refetchInterval) await this.refresh();
    const found = this.keys.get(kid);
    if (!found) throw rejected();
    return found;
  }
  private refresh(): Promise<void> {
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async load(): Promise<void> {
    const response = await this.fetch(this.url, { headers: { accept: 'application/json' } }).catch(() => {
      throw unavailable();
    });
    if (!response.ok) throw unavailable();
    const body = (await response.json()) as { keys?: unknown };
    const keys = new Map<string, PublicKey>();
    for (const jwk of Array.isArray(body.keys) ? (body.keys as Jwk[]) : []) {
      const alg = algorithmOf(jwk);
      if (typeof jwk.kid !== 'string' || !alg || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
      keys.set(jwk.kid, {
        alg,
        key: await crypto.subtle.importKey('jwk', jwk, algorithms[alg].key, false, ['verify'])
      });
    }
    this.keys = keys;
    this.fetchedAt = this.now();
  }
}
async function verifyAsymmetric(token: Token, keys: KeySet): Promise<void> {
  const { alg, kid } = token.header;
  if (typeof kid !== 'string' || !asymmetric.includes(alg as PublicKey['alg'])) throw rejected();
  const key = await keys.find(kid);
  if (key.alg !== alg) throw rejected();
  const valid = await signatureValid(() =>
    crypto.subtle.verify(algorithms[key.alg].verify, key.key, token.signature, token.input)
  );
  if (!valid) throw rejected();
}

/**
 * 按规则建出命令入口的身份校验。`auth` 只在 {@link Identities.confirm}（接受邀请）时使用；
 * `fetch` 取 JWKS（只在 JWKS 模式下、启动后首次与遇到未知 kid 时调用），`now` 供测试注入时钟。
 * 共享密钥在第一次验签时导入为 WebCrypto 密钥，之后复用。
 */
export function createIdentities(options: {
  rules: TokenRules;
  auth: AuthLookup;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}): Identities {
  const now = options.now ?? Date.now;
  const { rules } = options;
  const keys = rules.keys.kind === 'jwks' ? new KeySet(rules.keys.url, options.fetch ?? fetch, now) : undefined;
  let hmac: Promise<CryptoKey> | undefined;
  const secretKey = (secret: string) =>
    (hmac ??= crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']));
  return {
    async verify(token) {
      const decoded = decode(token);
      if (rules.keys.kind === 'secret') await verifyHs256(decoded, secretKey(rules.keys.secret));
      else await verifyAsymmetric(decoded, keys!);
      return checkClaims(decoded.claims, rules.issuer, now());
    },
    async confirm(token, identity) {
      const { data, error } = await options.auth.getUser(token);
      const user = data.user;
      demand(
        !error && user && user.id === identity.id && user.email && user.email_confirmed_at,
        'unauthenticated',
        '会话已失效，请重新登录'
      );
      return { id: user.id, email: user.email, verified: true };
    }
  };
}
