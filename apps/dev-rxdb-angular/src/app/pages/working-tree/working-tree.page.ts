import type { WorkingTreeCredentials, WorkingTreeQueryState, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { Todo } from '@aiao/rxdb-test/entities';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

const AUTHOR_ID = 'demo-author';

/**
 * 从最近一次成功的 `status()` 取出提交凭据（三个捕获位）。
 *
 * 读不到就返回 `null` 而不是补默认值：三个位里任何一个给默认值，都等于让这次
 * `commit()` 跳过一次并发比较（见 `WorkingTreeCredentials` 的 TSDoc）。
 */
const credentialsOf = (state: WorkingTreeQueryState<WorkingTreeStatus>): WorkingTreeCredentials | null => {
  if (state.phase !== 'success' && state.phase !== 'empty') return null;
  return {
    expectedBranch: { branchId: state.value.branchId, activationRevision: state.value.activationRevision },
    expectedHeadRevision: state.value.headRevision,
    expectedWorkingTreeRevision: state.value.workingTreeRevision
  };
};

@Component({
  selector: 'app-working-tree-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './working-tree.page.html',
  imports: [CommonModule, FormsModule]
})
export default class WorkingTreePage implements OnInit {
  private readonly createdAt = performance.now();

  readonly tree: WorkingTreeResource = useWorkingTree();

  readonly $notice = signal<string | null>(null);
  readonly $firstVisibleMs = signal<number | null>(null);

  message = 'demo commit';
  title = '工作树里的一条 Todo';

  constructor() {
    effect(() => {
      const phase = this.tree.statusState().phase;
      if (this.$firstVisibleMs() !== null) return;
      if (phase === 'idle' || phase === 'loading') return;
      this.$firstVisibleMs.set(Math.round(performance.now() - this.createdAt));
    });
  }

  // 面板初始化后主动读一次状态：入口自己不发 IO（见它的 TSDoc），而一个开着却说不出
  // 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
  ngOnInit(): void {
    void this.tree.isEnabled().catch(() => undefined);
    void this.tree.status().catch(() => undefined);
  }

  // `enable()` 自己会重读一次 status，但**不会**重读 isEnabled ——
  // 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
  async runEnable(): Promise<void> {
    await this.tree.enable().catch(() => undefined);
    await this.tree.isEnabled().catch(() => undefined);
  }

  async refreshStatus(): Promise<void> {
    await this.tree.status().catch(() => undefined);
  }

  async readDiff(): Promise<void> {
    await this.tree.diff().catch(() => undefined);
  }

  async readCommits(): Promise<void> {
    await this.tree.listCommits().catch(() => undefined);
  }

  async writeTodo(): Promise<void> {
    const todo = new Todo();
    todo.title = this.title;
    await todo.save();
    await this.tree.status().catch(() => undefined);
  }

  async runCommit(): Promise<void> {
    const credentials = credentialsOf(this.tree.statusState());
    if (credentials === null) {
      this.$notice.set('还没有读到一份 status，提交凭据无从谈起——先刷新状态。');
      return;
    }
    this.$notice.set(null);
    await this.tree
      .commit(this.message, { ...credentials, authorId: AUTHOR_ID, operationId: crypto.randomUUID() })
      .catch(() => undefined);
    await this.tree.status().catch(() => undefined);
  }

  async runDiscard(): Promise<void> {
    const credentials = credentialsOf(this.tree.statusState());
    if (credentials === null) {
      this.$notice.set('还没有读到一份 status，丢弃凭据无从谈起——先刷新状态。');
      return;
    }
    this.$notice.set(null);
    await this.tree.discard(credentials).catch(() => undefined);
  }
}
