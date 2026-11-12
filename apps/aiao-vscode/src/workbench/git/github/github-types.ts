/** 工作台与 GitHub 后端之间的登录会话契约。 */
export interface GitHubSession {
  readonly token: string;
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly provider: 'pat' | 'oauth';
}

export interface GitHubUser {
  readonly login: string;
  readonly avatarUrl: string | null;
}

export interface GitHubRepoSummary {
  readonly fullName: string;
  readonly description: string | null;
  readonly stars: number;
  readonly cloneUrl: string;
  readonly isPrivate: boolean;
}

export interface GitHubRepo {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
}

export interface GitHubBranch {
  readonly name: string;
  readonly sha: string;
}

/** 仓库树中的 blob 条目；gitlink（mode 160000）在 API 层被跳过。 */
export interface GitHubTreeEntry {
  readonly path: string;
  readonly sha: string;
  readonly mode: string;
}

export interface GitHubCommitInfo {
  readonly sha: string;
  readonly treeSha: string;
  readonly parents: readonly string[];
  readonly message: string;
}

export interface GitHubCommitSummary {
  readonly oid: string;
  readonly message: string;
}

export type GitHubApiErrorCode =
  | 'auth_required'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'network_failed'
  | 'invalid_response'
  | 'resource_limit';

export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubApiErrorCode,
    message: string,
    readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'GitHubApiError';
  }
}

export interface GitHubQuota {
  readonly remaining: number | null;
  readonly limit: number | null;
  readonly resetAt: number | null;
}
