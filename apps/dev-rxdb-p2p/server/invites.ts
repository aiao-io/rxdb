/**
 * 邀请制 beta（POOL-US-102）：`GET /api/me` 报告激活状态，`POST /api/invite` 用邀请码激活。
 *
 * @remarks
 * 激活状态只在 Supabase 的 `p2p.activated_users` 登记（只对 service_role 开放），
 * 客户端激活经 Worker 调用 `p2p.activate_invite`：一条语句完成「校验码未用未作废 → 标记使用 → 登记激活」。
 */
import { bearerOf, json, methodNotAllowed } from './http';
import type { VerifiedUser } from './identity';

/** 邀请码长度。 */
export const INVITE_CODE_LENGTH = 20;
/** 邀请码长度下限（防止把任意字符串当码塞给目录）。 */
const MIN_CODE_LENGTH = 12;

/** 一条邀请码（目录返回的线上行）。 */
export interface InviteCodeRow {
  readonly code: string;
  readonly createdAt: string;
  readonly usedBy: string | null;
  readonly usedAt: string | null;
  readonly revokedAt: string | null;
}

/** 邀请目录：以 service_role 访问 Supabase 的 `p2p.invite_codes` / `p2p.activated_users`。 */
export interface InviteDirectory {
  /** 激活：码有效且未用、未作废时成功；幂等——已激活的用户再激活返回 true。 */
  activate(code: string, userId: string): Promise<boolean>;
  /** 用户是否已激活。 */
  isActivated(userId: string): Promise<boolean>;
  /** 批量发码。 */
  issueCodes(count: number, createdBy: string): Promise<readonly string[]>;
  /** 作废一个码；码不存在时为 false。 */
  revoke(code: string): Promise<boolean>;
  listCodes(): Promise<readonly InviteCodeRow[]>;
}

export interface InviteDeps {
  readonly verifyUser: (accessToken: string) => Promise<VerifiedUser | null>;
  readonly directory: InviteDirectory;
  /** 部署是否要求激活（POOL_REQUIRE_ACTIVATION）；不要求时 /api/me 恒报已激活。 */
  readonly requireActivation: boolean;
  /** 管理员豁免邀请制（他们发码，不该被自己的门禁挡住）。 */
  readonly isAdmin?: (userId: string) => boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 生成一批邀请码；`random` 可注入以便测试。 */
export const generateInviteCodes = (count: number, random: () => number): readonly string[] => {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let code = '';
    for (let position = 0; position < INVITE_CODE_LENGTH; position += 1) {
      code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    }
    codes.push(code);
  }
  return codes;
};

/**
 * 处理 `/api/me`（GET）与 `/api/invite`（POST）。
 *
 * @throws Error 目录（Supabase）故障，由路由层转成 502
 */
export const handleInviteRequest = async (request: Request, deps: InviteDeps): Promise<Response> => {
  const token = bearerOf(request);
  const user = token ? await deps.verifyUser(token) : null;
  if (!user) return json(401, { error: 'a valid access token is required' });
  if (request.method === 'GET') {
    const activationRequired = deps.requireActivation;
    const exempt = activationRequired && deps.isAdmin?.(user.id);
    return json(200, {
      activated: !activationRequired || exempt === true || (await deps.directory.isActivated(user.id)),
      activationRequired
    });
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST');
  const body = (await request.json().catch(() => null)) as { readonly code?: unknown } | null;
  const code = body?.code;
  if (typeof code !== 'string' || code.length < MIN_CODE_LENGTH) {
    return json(400, { error: 'an invite code is required' });
  }
  const activated = await deps.directory.activate(code, user.id);
  return json(activated ? 200 : 409, { activated });
};
