export interface GitFile {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

export interface GitSnapshot {
  readonly projectId: string;
  readonly revision: number;
  readonly files: readonly GitFile[];
}

export interface GitStatusEntry {
  readonly path: string;
  readonly originalPath?: string;
  readonly index: string;
  readonly worktree: string;
}

export interface GitStatus {
  readonly head: string | null;
  readonly branch: string;
  readonly raw: string;
  readonly entries: readonly GitStatusEntry[];
}

export interface GitCommit {
  readonly oid: string;
  readonly message: string;
}

/** Git 差异的一侧，缺失文件与二进制不会冒充空文本。 */
export interface GitFileVersion {
  readonly exists: boolean;
  readonly binary: boolean;
  readonly text: string | null;
  readonly byteLength: number;
}

/** HEAD、index 和已保存工作区之间的精确文件差异。 */
export interface GitFileDiff {
  readonly projectId: string;
  readonly path: string;
  readonly kind: 'working' | 'staged';
  readonly base: GitFileVersion;
  readonly modified: GitFileVersion;
}

export type GitErrorCode =
  | 'unsupported_environment'
  | 'unsupported_operation'
  | 'invalid_path'
  | 'path_collision'
  | 'project_exists'
  | 'project_missing'
  | 'revision_conflict'
  | 'dirty_workspace'
  | 'nothing_staged'
  | 'unreachable_commit'
  | 'invalid_archive'
  | 'resource_limit'
  | 'auth_required'
  | 'auth_invalid'
  | 'remote_not_found'
  | 'remote_conflict'
  | 'rate_limited'
  | 'network_failed'
  | 'git_failed'
  | 'storage_failed';

export class GitWorkbenchError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'GitWorkbenchError';
  }
}

export const GIT_WORKBENCH_LIMITS = Object.freeze({
  files: 2_000,
  fileBytes: 2 * 1024 * 1024,
  totalBytes: 20 * 1024 * 1024,
  archiveBytes: 24 * 1024 * 1024
});
