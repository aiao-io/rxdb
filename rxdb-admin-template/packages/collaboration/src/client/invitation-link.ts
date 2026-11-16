/** 邀请链接携带的四个字段：目标团队与应用、邀请标识和一次性令牌。 */
export interface InvitationTicket {
  teamId: string;
  appId: string;
  id: string;
  token: string;
}

const invalid = () => new Error('邀请链接格式错误');

/** 取出 fragment 里的 join 参数；不是 URL 或没有该参数时返回 null。 */
function joinValue(link: string): string | null {
  if (!URL.canParse(link)) return null;
  return new URLSearchParams(new URL(link).hash.slice(1)).get('join');
}

/** 必须是非空字符串。 */
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw invalid();
  return value;
}

/**
 * 生成邀请链接：以 `page` 为基础，清空其查询参数与 fragment，把邀请写入 `#join=<转义后的 JSON>`。
 * 令牌只放在 fragment 里：浏览器不会把它发给服务器，也不会进入代理日志或 Referer。
 */
export function createInvitationLink(page: string | URL, ticket: InvitationTicket): string {
  const url = new URL(page);
  url.search = '';
  const { teamId, appId, id, token } = ticket;
  url.hash = new URLSearchParams({ join: JSON.stringify({ teamId, appId, id, token }) }).toString();
  return url.toString();
}

/**
 * 解析邀请链接。四个字段都必须是非空字符串；
 * 任何格式问题（不是 URL、缺少 fragment 或 join、JSON 非法、字段缺失或类型不符）统一抛出「邀请链接格式错误」。
 * 令牌在查询参数里的旧格式同样视为非法。
 */
export function parseInvitationLink(link: string): InvitationTicket {
  const value = joinValue(link);
  if (!value) throw invalid();
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    throw invalid();
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw invalid();
  const fields = payload as Record<string, unknown>;
  return {
    teamId: text(fields['teamId']),
    appId: text(fields['appId']),
    id: text(fields['id']),
    token: text(fields['token'])
  };
}

/** 链接的 fragment 是否携带邀请，用于决定是否把当前地址预填进「邀请链接」输入框。 */
export function carriesInvitation(link: string): boolean {
  return !!joinValue(link);
}
