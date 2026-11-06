/**
 * 举报接口（POOL-US-102）：`POST /api/reports`。
 *
 * @remarks
 * 服务端只收目标标识（内容哈希或账号 id）、分类与举报人，不落文件内容与举报正文（AC#9）；
 * 同一目标同一举报人的未处置举报只有一条（数据库部分唯一索引兜底，目录返回 `created: false`）。
 */
import {
  REPORT_CATEGORIES,
  REPORT_RESOLUTIONS,
  type ReportCategory,
  type ReportResolution
} from '../shared/reporting-protocol';
import { HASH_PATTERN } from './files';
import { bearerOf, json, methodNotAllowed } from './http';
import { UUID_PATTERN, type VerifiedUser } from './identity';

export { REPORT_CATEGORIES, REPORT_RESOLUTIONS };
export type { ReportCategory, ReportResolution };

/** 一条举报（目录返回的线上行）。 */
export interface ReportRow {
  readonly id: string;
  readonly targetHash: string | null;
  readonly targetUser: string | null;
  readonly sourceUrl: string | null;
  readonly category: ReportCategory;
  readonly reporterUser: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolution: ReportResolution | null;
}

/** 提交举报的输入（已校验）。 */
export interface ReportInput {
  readonly targetHash: string | null;
  readonly targetUser: string | null;
  readonly category: ReportCategory;
  /** 文件目标的服务器副本地址（`/api/files/<hash>` 或 `/api/files/enc/<hash>`）；只有 contentHash 目标需要。 */
  readonly sourceUrl: string | null;
}

/** 合法的服务器副本地址。 */
export const SOURCE_URL_PATTERN = /^\/api\/files\/(enc\/)?[0-9a-f]{64}$/;

/** 举报目录：以 service_role 访问 Supabase 的 `p2p.reports`。 */
export interface ReportDirectory {
  submit(input: ReportInput & { readonly reporterUser: string }): Promise<{ readonly created: boolean }>;
  listOpen(): Promise<readonly ReportRow[]>;
  resolve(id: string, resolution: ReportResolution, resolvedBy: string): Promise<boolean>;
  hasServerCopy(contentHash: string, sourceUrl: string, origin: string): Promise<boolean>;
}

export interface ReportDeps {
  readonly verifyUser: (accessToken: string) => Promise<VerifiedUser | null>;
  readonly directory: ReportDirectory;
}

/** 解析并校验请求体；结构或取值不合法时为 null。 */
export const parseReportInput = (body: unknown): ReportInput | null => {
  if (typeof body !== 'object' || body === null) return null;
  const { target, category } = body as { readonly target?: unknown; readonly category?: unknown };
  if (typeof category !== 'string' || !(REPORT_CATEGORIES as readonly string[]).includes(category)) return null;
  if (typeof target !== 'object' || target === null) return null;
  const { contentHash, accountId, sourceUrl } = target as {
    readonly contentHash?: unknown;
    readonly accountId?: unknown;
    readonly sourceUrl?: unknown;
  };
  const hasHash = typeof contentHash === 'string';
  const hasAccount = typeof accountId === 'string';
  if (hasHash === hasAccount) return null;
  if (hasHash && !HASH_PATTERN.test(contentHash as string)) return null;
  if (hasAccount && !UUID_PATTERN.test(accountId as string)) return null;
  const hasSource = typeof sourceUrl === 'string';
  if (hasAccount && hasSource) return null;
  if (sourceUrl !== undefined && !hasSource) return null;
  if (hasSource && !SOURCE_URL_PATTERN.test(sourceUrl as string)) return null;
  if (hasSource && !(sourceUrl as string).includes('/enc/') && sourceUrl !== `/api/files/${contentHash as string}`)
    return null;
  return {
    targetHash: hasHash ? (contentHash as string) : null,
    targetUser: hasAccount ? (accountId as string) : null,
    sourceUrl: hasSource ? (sourceUrl as string) : null,
    category: category as ReportCategory
  };
};

/**
 * 处理 `POST /api/reports`。
 *
 * @throws Error 目录（Supabase）故障，由路由层转成 502
 */
export const handleReportRequest = async (request: Request, deps: ReportDeps): Promise<Response> => {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = bearerOf(request);
  const user = token ? await deps.verifyUser(token) : null;
  if (!user) return json(401, { error: 'a valid access token is required' });
  const input = parseReportInput(await request.json().catch(() => null));
  if (!input)
    return json(400, { error: 'expected exactly one of target.contentHash or target.accountId, and a valid category' });
  if (
    input.targetHash &&
    input.sourceUrl &&
    !(await deps.directory.hasServerCopy(input.targetHash, input.sourceUrl, new URL(request.url).origin))
  ) {
    return json(400, { error: 'the server copy is not published for this content' });
  }
  const { created } = await deps.directory.submit({ ...input, reporterUser: user.id });
  return json(created ? 201 : 200, { created });
};
