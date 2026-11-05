/**
 * 管理后台的 HTTP 接口（US-713）：`/api/admin/*`。
 *
 * @remarks
 * 检查次序固定：令牌（401）→ 配置（503）→ 管理员名单（403）→ 路由。`/me` 例外：任何已登录用户都能问，
 * 配置缺失也只回 `admin: false`，前端据此决定入口显不显示，不产生 403 噪音。
 *
 * 处置按「先让账号失效、再清数据」排次序，任何一步失败即停并回 502，重试安全：
 * - 封禁：先封（新连接立即被拒），再踢在线设备；
 * - 删除：先在一条语句里清掉声明与设备登记（账号既握不了手也写不了新声明），再踢在线设备，最后删账号。
 */
import type {
  AdminAccount,
  AdminAccountPage,
  AdminBanResult,
  AdminDeleteAccountResult,
  AdminKickResult,
  AdminOnlineDevice,
  AdminSelf,
  AdminServerFile,
  AdminServerFiles
} from '../shared/admin-protocol';
import { AdminConfigError, type AdminConfig } from './admin-config';
import type { AdminRoom } from './admin-room';
import { AccountNotFoundError } from './admin-supabase';
import { fileKey, HASH_PATTERN } from './files';
import { bearerOf, json, methodNotAllowed, noContent } from './http';
import { isBanned, UUID_PATTERN, type VerifiedUser } from './identity';
import type { R2BucketLike } from './runtime';

/** 管理接口的路径前缀。 */
export const ADMIN_ROUTE_PREFIX = '/api/admin/';

/** 一次最多列出的服务器副本数（R2 单次列表的上限）。 */
const MAX_LISTED_FILES = 1000;
const ME_PATH = `${ADMIN_ROUTE_PREFIX}me`;

/** 管理接口的依赖。 */
export interface AdminRouteDeps {
  /** 校验 access token；无效或账号被封禁时为 null，认证宿主故障时抛错。 */
  readonly verifyUser: (accessToken: string) => Promise<VerifiedUser | null>;
  /** 读管理后台配置；没配好时抛 {@link AdminConfigError}。 */
  readonly config: () => AdminConfig;
  readonly room: AdminRoom;
  readonly bucket: R2BucketLike;
}

interface AdminContext {
  readonly deps: AdminRouteDeps;
  readonly config: AdminConfig;
  readonly user: VerifiedUser;
  readonly url: URL;
}

type Handler = (context: AdminContext, params: readonly string[]) => Promise<Response>;

interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly handler: Handler;
}

const invalidId = (what: string): Response => json(400, { error: `expected a ${what}` });

const isAdminId = (config: AdminConfig, userId: string): boolean => config.adminIds.has(userId.toLowerCase());

/** 管理员不能处置自己，也不能处置名单里的其他管理员。 */
const refuseTarget = ({ config, user }: AdminContext, userId: string): Response | null => {
  if (userId.toLowerCase() === user.id.toLowerCase()) {
    return json(409, { error: 'administrators cannot ban or delete their own account' });
  }
  if (isAdminId(config, userId)) {
    return json(409, { error: 'administrator accounts are managed outside the console' });
  }
  return null;
};

const parsePage = (raw: string | null): number | null => {
  if (raw === null) return 1;
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null;
};

const listAccounts: Handler = async ({ config, url }) => {
  const page = parsePage(url.searchParams.get('page'));
  if (page === null) return json(400, { error: 'page must be a positive integer' });
  const [{ users, total }, stats] = await Promise.all([
    config.directory.listAccounts(page),
    config.directory.accountStats()
  ]);
  const statsById = new Map(stats.map(entry => [entry.userId, entry]));
  const accounts = users.map((user): AdminAccount => ({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    banned: isBanned(user.bannedUntil),
    admin: isAdminId(config, user.id),
    deviceCount: statsById.get(user.id)?.deviceCount ?? 0,
    claimCount: statsById.get(user.id)?.claimCount ?? 0
  }));
  return json(200, { accounts, total, page } satisfies AdminAccountPage);
};

const banAccount: Handler = async (context, [userId = '']) => {
  if (!UUID_PATTERN.test(userId)) return invalidId('user id (uuid)');
  const refusal = refuseTarget(context, userId);
  if (refusal) return refusal;
  await context.config.directory.setBanned(userId, true);
  const evictedDevices = await context.deps.room.evict({ userId });
  return json(200, { evictedDevices } satisfies AdminBanResult);
};

const unbanAccount: Handler = async ({ config }, [userId = '']) => {
  if (!UUID_PATTERN.test(userId)) return invalidId('user id (uuid)');
  await config.directory.setBanned(userId, false);
  return noContent();
};

const deleteAccount: Handler = async (context, [userId = '']) => {
  if (!UUID_PATTERN.test(userId)) return invalidId('user id (uuid)');
  const refusal = refuseTarget(context, userId);
  if (refusal) return refusal;
  const purgedClaims = await context.config.directory.purgeAccount(userId);
  const evictedDevices = await context.deps.room.evict({ userId });
  await context.config.directory.deleteAccount(userId);
  return json(200, { purgedClaims, evictedDevices } satisfies AdminDeleteAccountResult);
};

const listOnline: Handler = async ({ deps }) => {
  const peers = await deps.room.roster();
  const devices = peers
    .map((peer): AdminOnlineDevice => ({
      deviceId: peer.deviceId,
      deviceName: peer.deviceName,
      userId: peer.principal,
      userName: peer.userName,
      instanceKey: peer.key
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName) || a.deviceName.localeCompare(b.deviceName));
  return json(200, { devices });
};

const kickDevice: Handler = async ({ deps }, [deviceId = '']) => {
  if (!UUID_PATTERN.test(deviceId)) return invalidId('device id (uuid)');
  const evictedDevices = await deps.room.evict({ deviceId });
  if (evictedDevices === 0) return json(404, { error: 'device is not online' });
  return json(200, { evictedDevices } satisfies AdminKickResult);
};

const listFiles: Handler = async ({ config, deps }) => {
  const prefix = fileKey('');
  const [listing, catalog] = await Promise.all([
    deps.bucket.list({ prefix, limit: MAX_LISTED_FILES }),
    config.directory.fileCatalog()
  ]);
  const catalogByHash = new Map(catalog.map(entry => [entry.contentHash, entry]));
  const files = listing.objects
    .map((object): AdminServerFile => {
      const contentHash = object.key.slice(prefix.length);
      const entry = catalogByHash.get(contentHash);
      return {
        contentHash,
        fileName: entry?.fileName ?? null,
        size: object.size,
        uploadedAt: object.uploaded.toISOString(),
        holderCount: entry?.holderCount ?? 0
      };
    })
    .filter(file => HASH_PATTERN.test(file.contentHash))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return json(200, { files, totalBytes, truncated: listing.truncated } satisfies AdminServerFiles);
};

const deleteFile: Handler = async ({ deps }, [contentHash = '']) => {
  if (!HASH_PATTERN.test(contentHash)) return json(400, { error: 'expected a lowercase SHA-256 hex hash' });
  const key = fileKey(contentHash);
  if (!(await deps.bucket.head(key))) return json(404, { error: 'file not found' });
  await deps.bucket.delete(key);
  return noContent();
};

const ROUTES: readonly Route[] = [
  { method: 'GET', pattern: /^\/api\/admin\/accounts$/, handler: listAccounts },
  { method: 'POST', pattern: /^\/api\/admin\/accounts\/([^/]+)\/ban$/, handler: banAccount },
  { method: 'POST', pattern: /^\/api\/admin\/accounts\/([^/]+)\/unban$/, handler: unbanAccount },
  { method: 'DELETE', pattern: /^\/api\/admin\/accounts\/([^/]+)$/, handler: deleteAccount },
  { method: 'GET', pattern: /^\/api\/admin\/online$/, handler: listOnline },
  { method: 'POST', pattern: /^\/api\/admin\/devices\/([^/]+)\/kick$/, handler: kickDevice },
  { method: 'GET', pattern: /^\/api\/admin\/files$/, handler: listFiles },
  { method: 'DELETE', pattern: /^\/api\/admin\/files\/([^/]+)$/, handler: deleteFile }
];

const route = (context: AdminContext, method: string): Promise<Response> | Response => {
  const matches = ROUTES.flatMap(candidate => {
    const found = candidate.pattern.exec(context.url.pathname);
    return found ? [{ route: candidate, params: found.slice(1) }] : [];
  });
  if (matches.length === 0) return json(404, { error: 'not found' });
  const chosen = matches.find(match => match.route.method === method);
  if (!chosen) return methodNotAllowed(matches.map(match => match.route.method).join(', '));
  return chosen.route.handler(context, chosen.params);
};

const isAdministrator = (user: VerifiedUser, deps: AdminRouteDeps): boolean => {
  try {
    return isAdminId(deps.config(), user.id);
  } catch (error) {
    if (error instanceof AdminConfigError) return false;
    throw error;
  }
};

const dispatch = async (request: Request, deps: AdminRouteDeps): Promise<Response> => {
  const url = new URL(request.url);
  const token = bearerOf(request);
  const user = token ? await deps.verifyUser(token) : null;
  if (!user) return json(401, { error: 'a valid access token is required' });
  if (url.pathname === ME_PATH) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return json(200, { admin: isAdministrator(user, deps) } satisfies AdminSelf);
  }
  const config = deps.config();
  if (!isAdminId(config, user.id)) return json(403, { error: 'administrator access required' });
  return route({ deps, config, user, url }, request.method);
};

const failure = (error: unknown): Response => {
  if (error instanceof AdminConfigError) return json(503, { error: error.message });
  if (error instanceof AccountNotFoundError) return json(404, { error: 'account not found' });
  return json(502, { error: error instanceof Error ? error.message : String(error) });
};

/**
 * 处理 `/api/admin/*`。
 *
 * @remarks
 * 上游（Supabase、信令房间、R2）的故障转成 502 并带上它们的说明：看到这个页面的只有管理员，需要知道缺了什么
 * （例如数据库函数还没装）。
 */
export const handleAdminRequest = async (request: Request, deps: AdminRouteDeps): Promise<Response> => {
  try {
    return await dispatch(request, deps);
  } catch (error) {
    return failure(error);
  }
};
