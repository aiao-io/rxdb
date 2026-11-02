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

export type GitErrorCode =
  | 'unsupported_environment'
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
