/**
 * 管理后台的接口形状：Worker 的 `/api/admin/*` 与前端共用（US-713）。
 *
 * @remarks
 * 只有管理员能调用这些接口：服务端先验 access token，再比对 `ADMIN_USER_IDS` 名单；
 * 前端据 `GET /api/admin/me` 决定入口显不显示，那不是权限判定。
 */

/** 账号列表每页的条数。 */
export const ADMIN_ACCOUNTS_PAGE_SIZE = 50;

/** 管理员总览里的一个账号。 */
export interface AdminAccount {
  readonly id: string;
  readonly email: string;
  /** 注册时间（ISO 8601）。 */
  readonly createdAt: string;
  /** 最近登录时间（ISO 8601）；从未登录为 null。 */
  readonly lastSignInAt: string | null;
  /** 此刻是否处于封禁中。 */
  readonly banned: boolean;
  /** 是否在管理员名单里：这类账号不能被封禁或删除。 */
  readonly admin: boolean;
  /** 登记过的设备数。 */
  readonly deviceCount: number;
  /** 这些设备持有的文件声明数。 */
  readonly claimCount: number;
}

/** 一页账号。 */
export interface AdminAccountPage {
  readonly accounts: readonly AdminAccount[];
  /** 全部账号数。 */
  readonly total: number;
  /** 当前页码，从 1 起。 */
  readonly page: number;
}

/** 信令上在线的一台设备（一个运行实例）。 */
export interface AdminOnlineDevice {
  readonly deviceId: string;
  readonly deviceName: string;
  /** 所属账号的 id。 */
  readonly userId: string;
  readonly userName: string;
  /** 实例键：同一台设备开多个页面时各有一个。 */
  readonly instanceKey: string;
}

/** 服务器（R2）上的一个文件副本。 */
export interface AdminServerFile {
  readonly contentHash: string;
  /** 清单里的文件名；清单里已没有这个文件时为 null。 */
  readonly fileName: string | null;
  readonly size: number;
  /** 上传时间（ISO 8601）。 */
  readonly uploadedAt: string;
  /** 清单里声明持有它的设备数。 */
  readonly holderCount: number;
}

/** 服务器副本总览。 */
export interface AdminServerFiles {
  readonly files: readonly AdminServerFile[];
  readonly totalBytes: number;
  /** 副本多于一次能列出的上限，列表被截断。 */
  readonly truncated: boolean;
}

/** 当前登录者在管理后台的身份。 */
export interface AdminSelf {
  readonly admin: boolean;
}

/** 封禁账号的结果。 */
export interface AdminBanResult {
  /** 随封禁被断开的在线设备数。 */
  readonly evictedDevices: number;
}

/** 删除账号的结果。 */
export interface AdminDeleteAccountResult {
  /** 一并清掉的持有声明数。 */
  readonly purgedClaims: number;
  /** 被断开的在线设备数。 */
  readonly evictedDevices: number;
}

/** 踢设备下线的结果。 */
export interface AdminKickResult {
  /** 被断开的连接数（同一台设备开了几个页面就有几个）。 */
  readonly evictedDevices: number;
}
