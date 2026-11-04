/**
 * 服务器回退（US-706）：文件按 `contentHash` 存进 R2，下载时流式回传。
 *
 * @remarks
 * 上传带 `sha256` 交给 R2 校验，内容与键不符时 R2 拒绝写入，所以桶里每个对象都与它的键一致；
 * 下载方仍按清单逐块复核（`downloadP2PFile`），不信任服务器。单个请求体受 Cloudflare 免费 / Pro 域名的
 * 100 MB 上限约束，更大的文件留给分片上传。
 */
import { MAX_UPLOAD_BYTES } from '../shared/limits';
import type { VerifiedUser } from './identity';
import type { R2BucketLike } from './runtime';

export { MAX_UPLOAD_BYTES };

/** 文件路由的依赖。 */
export interface FileRouteDeps {
  readonly bucket: R2BucketLike;
  /** 校验 access token；无效时为 null，认证宿主故障时抛错。 */
  readonly verifyUser: (accessToken: string) => Promise<VerifiedUser | null>;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** 文件在桶里的键。 */
export const fileKey = (contentHash: string): string => `files/${contentHash}`;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bearerOf = (request: Request): string | null =>
  /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;

const fileHeaders = (size: number): HeadersInit => ({
  'content-length': String(size),
  'content-type': 'application/octet-stream',
  'cache-control': 'private, no-store'
});

const download = async (key: string, bucket: R2BucketLike): Promise<Response> => {
  const object = await bucket.get(key);
  if (!object) return json(404, { error: 'file not found' });
  return new Response(object.body, { headers: fileHeaders(object.size) });
};

const describe = async (key: string, bucket: R2BucketLike): Promise<Response> => {
  const object = await bucket.head(key);
  return object ? new Response(null, { headers: fileHeaders(object.size) }) : new Response(null, { status: 404 });
};

const upload = async (request: Request, contentHash: string, bucket: R2BucketLike): Promise<Response> => {
  const length = Number(request.headers.get('content-length') ?? Number.NaN);
  if (!Number.isSafeInteger(length) || !request.body) return json(411, { error: 'content-length is required' });
  if (length > MAX_UPLOAD_BYTES) return json(413, { error: `uploads are limited to ${MAX_UPLOAD_BYTES} bytes` });
  const key = fileKey(contentHash);
  if (await bucket.head(key)) return json(200, { stored: false });
  try {
    await bucket.put(key, request.body, { sha256: contentHash });
  } catch (error) {
    return json(502, {
      error: `storage rejected the upload: ${error instanceof Error ? error.message : String(error)}`
    });
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
  if (!token || !(await deps.verifyUser(token))) return json(401, { error: 'a valid access token is required' });
  const key = fileKey(contentHash);
  if (request.method === 'GET') return download(key, deps.bucket);
  if (request.method === 'HEAD') return describe(key, deps.bucket);
  if (request.method === 'PUT') return upload(request, contentHash, deps.bucket);
  return json(405, { error: 'allowed methods: GET, HEAD, PUT' });
};
