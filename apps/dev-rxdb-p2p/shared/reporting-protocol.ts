/** 举报与邀请制（POOL-US-102）的前后端共用协议。 */

/** 举报原因分类。 */
export const REPORT_CATEGORIES = ['malware', 'phishing', 'infringement', 'harassment', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** 管理员处置方式。 */
export const REPORT_RESOLUTIONS = ['delete_copy', 'ban', 'ignore'] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

/** 举报提交的请求体：恰好一个目标；文件目标可附服务器副本地址（处置时按它删密文副本）。 */
export interface ReportRequestBody {
  readonly target: { readonly contentHash?: string; readonly accountId?: string; readonly sourceUrl?: string };
  readonly category: ReportCategory;
}

/** 激活状态（`GET /api/me`）：`activationRequired` 是部署配置；未要求激活时恒为已激活。 */
export interface ActivationState {
  readonly activated: boolean;
  readonly activationRequired: boolean;
}
