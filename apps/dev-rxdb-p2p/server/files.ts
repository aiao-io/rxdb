/**
 * 服务器回退（US-706）：文件按 `contentHash` 存进 R2，下载时流式回传。
 *
 * @remarks
 * 上传带 `sha256` 交给 R2 校验，内容与键不符时 R2 拒绝写入，所以桶里每个对象都与它的键一致；
 * 下载方仍按清单逐块复核（`downloadP2PFile`），不信任服务器。单个请求体受 Cloudflare 免费 / Pro 域名的
 * 100 MB 上限约束，更大的文件留给分片上传。
 */
import { FALLBACK_ENCODING_HEADER, FALLBACK_ENCODING_VERSION } from '../shared/fallback-encoding';
import { MAX_UPLOAD_BYTES } from '../shared/limits';
import { bearerOf, json } from './http';
import type { VerifiedUser } from './identity';
import type { R2BucketLike } from './runtime';

export { MAX_UPLOAD_BYTES };

/** 限流判定（POOL-US-102）。 */
export type ConsumeLimiter = (
  scope: string,
  key: string,
  cost?: number
) => Promise<{ readonly allowed: boolean; readonly retryAfterMs: number }>;
/** 只查不记（下载前按流量预检）。 */
export type CheckLimiter = (
  scope: string,
  key: string
) => Promise<{ readonly allowed: boolean; readonly retryAfterMs: number }>;

/** 文件路由的依赖。 */
export interface FileRouteDeps {
  readonly bucket: R2BucketLike;
  /** 校验 access token；无效时为 null，认证宿主故障时抛错。 */
  readonly verifyUser: (accessToken: string) => Promise<VerifiedUser | null>;
  /** 限流（POOL-US-102）：返回是否放行与 Retry-After；缺省全放行。 */
  readonly consume?: ConsumeLimiter;
  readonly check?: CheckLimiter;
  /** 邀请制开关：开启时未激活账号 403（POOL-US-102）。 */
  readonly requireActivation?: boolean;
  readonly isActivated?: (accessToken: string, userId: string) => Promise<boolean>;
  /** 回退下载流结束时按实际字节记账（POOL-US-102），发后即忘。 */
  readonly reportBytes?: (scope: string, key: string, cost: number) => void;
}

/** 限流拒绝：429 + Retry-After（POOL-US-102）。 */
export const limited = (retryAfterMs: number): Response => {
  const seconds = Math.ceil(retryAfterMs / 1000);
  return new Response(JSON.stringify({ error: 'rate limited', retryAfterSeconds: seconds }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(seconds) }
  });
};

/** 邀请制门禁（POOL-US-102）：开启时未激活账号 403，并明确提示要邀请码。 */
const activationGate = async (deps: FileRouteDeps, user: VerifiedUser, token: string): Promise<Response | null> => {
  if (!deps.requireActivation || !deps.isActivated) return null;
  if (await deps.isActivated(token, user.id)) return null;
  return json(403, { error: 'this account is not activated; enter an invite code' });
};

/** 小写 SHA-256 十六进制：文件的内容哈希，也是它在桶里的键。 */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** 文件在桶里的键。 */
export const fileKey = (contentHash: string): string => `files/${contentHash}`;

/** 密文回退副本在桶里的键：键是密文哈希，与明文 `contentHash` 分离，服务器无法由键反推内容。 */
export const encFileKey = (encHash: string): string => `files/enc/${encHash}`;

const fileHeaders = (size: number): HeadersInit => ({
  'content-length': String(size),
  'content-type': 'application/octet-stream',
  'cache-control': 'private, no-store'
});

const download = async (key: string, bucket: R2BucketLike, countBytes?: (bytes: number) => void): Promise<Response> => {
  const object = await bucket.get(key);
  if (!object) return json(404, { error: 'file not found' });
  let body: ReadableStream<Uint8Array> = object.body;
  if (countBytes) {
    let total = 0;
    body = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          total += chunk.byteLength;
          controller.enqueue(chunk);
        },
        flush() {
          countBytes(total);
        }
      })
    );
  }
  return new Response(body, { headers: fileHeaders(object.size) });
};

const describe = async (key: string, bucket: R2BucketLike): Promise<Response> => {
  const object = await bucket.head(key);
  return object ? new Response(null, { headers: fileHeaders(object.size) }) : new Response(null, { status: 404 });
};

const upload = async (request: Request, key: string, expectedHash: string, bucket: R2BucketLike): Promise<Response> => {
  const length = Number(request.headers.get('content-length') ?? Number.NaN);
  if (!Number.isSafeInteger(length) || !request.body) return json(411, { error: 'content-length is required' });
  if (length > MAX_UPLOAD_BYTES) return json(413, { error: `uploads are limited to ${MAX_UPLOAD_BYTES} bytes` });
  if (await bucket.head(key)) return json(200, { stored: false });
  try {
    await bucket.put(key, request.body, { sha256: expectedHash });
  } catch (error) {
    console.error('[p2p] file upload failed', error);
    return json(502, { error: 'storage rejected the upload' });
  }
  return json(201, { stored: true });
};

/**
 * 处理 `/api/files/:contentHash`。
 *
 * @throws Error 认证宿主或 R2 读取故障，由路由层转成 502
 */
export const handleFileRequest = async (
  request: Request,
  contentHash: string,
  deps: FileRouteDeps
): Promise<Response> => {
  if (!HASH_PATTERN.test(contentHash)) return json(400, { error: 'expected a lowercase SHA-256 hex hash' });
  const token = bearerOf(request);
  const user = token ? await deps.verifyUser(token) : null;
  if (!token || !user) return json(401, { error: 'a valid access token is required' });
  if (deps.requireActivation) {
    const gate = await activationGate(deps, user, token);
    if (gate) return gate;
  }
  const key = fileKey(contentHash);
  if (request.method === 'PUT') {
    if (deps.consume) {
      const quota = await deps.consume('fallback-upload', user.id);
      if (!quota.allowed) return limited(quota.retryAfterMs);
    }
    return upload(request, key, contentHash, deps.bucket);
  }
  if (request.method === 'GET') {
    if (deps.consume && deps.check) {
      const [count, bytes] = await Promise.all([
        deps.consume('fallback-download-count', user.id),
        deps.check('fallback-download-bytes', user.id)
      ]);
      if (!count.allowed) return limited(count.retryAfterMs);
      if (!bytes.allowed) return limited(bytes.retryAfterMs);
    }
    const countBytes =
      deps.reportBytes ? (bytes: number) => deps.reportBytes!('fallback-download-bytes', user.id, bytes) : undefined;
    return download(key, deps.bucket, countBytes);
  }
  if (request.method === 'HEAD') return describe(key, deps.bucket);
  return json(405, { error: 'allowed methods: GET, HEAD, PUT' });
};

/**
 * 处理 `/api/files/enc/:encHash`（POOL-US-101 密文回退）。
 *
 * 上传与明文路径一致：键是密文哈希，R2 按它校验内容。下载要求客户端携带当前编码头——
 * 不带头的旧客户端只会把密文当明文落盘，直接以 426 拒绝并提示升级。
 *
 * @throws Error 认证宿主或 R2 读取故障，由路由层转成 502
 */
export const handleEncryptedFileRequest = async (
  request: Request,
  encHash: string,
  deps: FileRouteDeps
): Promise<Response> => {
  if (!HASH_PATTERN.test(encHash)) return json(400, { error: 'expected a lowercase SHA-256 hex hash' });
  const token = bearerOf(request);
  const user = token ? await deps.verifyUser(token) : null;
  if (!token || !user) return json(401, { error: 'a valid access token is required' });
  if (deps.requireActivation) {
    const gate = await activationGate(deps, user, token);
    if (gate) return gate;
  }
  const key = encFileKey(encHash);
  if (request.method === 'PUT') {
    if (deps.consume) {
      const quota = await deps.consume('fallback-upload', user.id);
      if (!quota.allowed) return limited(quota.retryAfterMs);
    }
    return upload(request, key, encHash, deps.bucket);
  }
  if (request.headers.get(FALLBACK_ENCODING_HEADER) !== FALLBACK_ENCODING_VERSION) {
    return json(426, { error: 'this server copy is encrypted; upgrade the client to read it' });
  }
  if (request.method === 'GET') {
    if (deps.consume && deps.check) {
      const [count, bytes] = await Promise.all([
        deps.consume('fallback-download-count', user.id),
        deps.check('fallback-download-bytes', user.id)
      ]);
      if (!count.allowed) return limited(count.retryAfterMs);
      if (!bytes.allowed) return limited(bytes.retryAfterMs);
    }
    const countBytes =
      deps.reportBytes ? (bytes: number) => deps.reportBytes!('fallback-download-bytes', user.id, bytes) : undefined;
    return download(key, deps.bucket, countBytes);
  }
  if (request.method === 'HEAD') return describe(key, deps.bucket);
  return json(405, { error: 'allowed methods: GET, HEAD, PUT' });
};
