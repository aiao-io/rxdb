/**
 * AI 子分支生命周期管理服务
 *
 * 管理 AI 操作的分支创建、合并、丢弃，以及刷新页面后识别仍检出着的 AI 分支。
 */

/** AI 子分支的 ID 前缀 */
const AI_BRANCH_PREFIX = 'ai-';

/** RxDB 版本管理器接口 */
interface VersionManagerLike {
  createBranch: (name: string) => Promise<{ id: string }>;
  switchBranch: (branchId: string) => Promise<void>;
  removeBranch: (branchId: string) => Promise<void>;
  mergeBranch: (
    sourceBranchId: string,
    options?: { strategy?: string; deleteSource?: boolean }
  ) => Promise<{ merged: number }>;
  getCurrentBranch: () => Promise<{ id: string; parentId: string | null }>;
  getChanges?: (fromBranch: string, toBranch: string) => Promise<BranchChange[]>;
}

export class AiBranchService {
  readonly #versionManager: VersionManagerLike;

  constructor(versionManager: unknown) {
    this.#versionManager = versionManager as VersionManagerLike;
  }

  /**
   * 创建 AI 子分支并切换
   *
   * @returns 新分支 ID 及父分支 ID
   */
  async forkAiBranch(modelDesignId: string): Promise<{ branchId: string; parentBranchId: string }> {
    void modelDesignId;
    const parent = await this.#versionManager.getCurrentBranch();
    const parentBranchId = parent?.id ?? 'main';
    const branchId = `${AI_BRANCH_PREFIX}${Date.now().toString(36)}`;
    await this.#versionManager.createBranch(branchId);
    await this.#versionManager.switchBranch(branchId);
    return { branchId, parentBranchId };
  }

  /**
   * 合并 AI 子分支到父分支（squash 策略，合并后删除源分支）
   */
  async mergeAiBranch(branchId: string, parentBranchId: string): Promise<void> {
    await this.#versionManager.switchBranch(parentBranchId);
    await this.#versionManager.mergeBranch(branchId, { strategy: 'squash', deleteSource: true });
  }

  /**
   * 丢弃 AI 子分支并切回父分支
   */
  async discardAiBranch(branchId: string, parentBranchId: string): Promise<void> {
    await this.#versionManager.switchBranch(parentBranchId);
    await this.#versionManager.removeBranch(branchId);
  }

  /**
   * 当前检出的是 AI 分支时返回它的 ID
   *
   * 检出的分支保存在数据库里：fork 之后既没合并也没丢弃就刷新页面，重新打开时仍停在这条分支上。
   */
  async activeAiBranchId(): Promise<string | null> {
    const current = await this.#versionManager.getCurrentBranch();
    return current.id.startsWith(AI_BRANCH_PREFIX) ? current.id : null;
  }

  /**
   * 对比两个分支的差异
   */
  async compareBranches(fromBranch: string, toBranch: string): Promise<BranchDiff> {
    const changes = (await this.#versionManager.getChanges?.(fromBranch, toBranch)) ?? [];

    const added: DiffItem[] = [];
    const modified: DiffItem[] = [];
    const deleted: DiffItem[] = [];

    for (const change of changes) {
      const item: DiffItem = {
        type: change.type,
        name: (change.data?.['name'] as string) ?? (change.prev?.['name'] as string) ?? 'unknown',
        entityId: (change.data?.['entityId'] as string | undefined) ?? (change.prev?.['entityId'] as string | undefined)
      };

      switch (change.action) {
        case 'insert':
          added.push(item);
          break;
        case 'update':
          modified.push(item);
          break;
        case 'delete':
          deleted.push(item);
          break;
      }
    }

    return { added, modified, deleted };
  }
}

/** 单条分支变更记录 */
export interface BranchChange {
  type: 'entity' | 'property' | 'relation' | 'index';
  action: 'insert' | 'update' | 'delete';
  data?: Record<string, unknown>;
  prev?: Record<string, unknown>;
}

/** Diff 差异项 */
export interface DiffItem {
  type: string;
  name: string;
  entityId?: string;
}

/** 分支对比结果 */
export interface BranchDiff {
  added: DiffItem[];
  modified: DiffItem[];
  deleted: DiffItem[];
}
