import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideGitBranch as GitBranch, LucideDynamicIcon, LucidePlus as Plus } from '@lucide/angular';
import { DevToolsStateService } from '../services/devtools-state.service';

@Component({
  selector: 'app-branch-selector',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (branches().length > 0) {
      <div class="flex items-center gap-1.5">
        <div class="join">
          <span class="btn btn-xs join-item flex items-center px-2 text-xs">
            <svg [lucideIcon]="GitBranch" aria-hidden="true" size="12"></svg>
          </span>
          <select class="select select-xs join-item" [disabled]="switching()" (change)="onBranchChange($event)">
            @for (branch of branches(); track branch.id) {
              <option [selected]="branch.id === currentBranchId()" [value]="branch.id">{{ branch.id }}</option>
            }
          </select>
        </div>
        @if (switching()) {
          <span class="loading loading-spinner loading-xs"></span>
        }
        <div class="relative" data-branch-popover>
          <button
            class="btn btn-xs btn-ghost btn-circle"
            [disabled]="switching()"
            (click)="toggleBranchPopover()"
            title="创建分支"
          >
            <svg [lucideIcon]="Plus" aria-hidden="true" size="14"></svg>
          </button>
          @if (showBranchPopover()) {
            <div class="bg-base-100 border-base-300 absolute top-8 left-0 z-50 rounded-lg border p-3 shadow-lg">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium" for="new-branch-name">创建新分支</label>
                <input
                  class="input input-sm input-bordered w-48"
                  id="new-branch-name"
                  [value]="newBranchName()"
                  (input)="onBranchNameInput($event)"
                  (keydown.enter)="createBranch()"
                  (keydown.escape)="showBranchPopover.set(false)"
                  placeholder="输入分支名称"
                  type="text"
                />
                <div class="flex justify-end gap-2">
                  <button class="btn btn-ghost btn-sm" (click)="showBranchPopover.set(false)">取消</button>
                  <button class="btn btn-primary btn-sm" [disabled]="!newBranchName().trim()" (click)="createBranch()">
                    创建
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  host: {
    '(document:click)': 'onDocumentClick($event)'
  }
})
export class BranchSelectorComponent {
  private readonly devToolsState = inject(DevToolsStateService);

  protected readonly GitBranch = GitBranch;
  protected readonly Plus = Plus;
  readonly branches = this.devToolsState.branches;
  readonly switching = this.devToolsState.switching;
  readonly currentBranchId = computed(() => this.devToolsState.activeBranch()?.id ?? null);
  readonly showBranchPopover = signal(false);
  readonly newBranchName = signal('');

  onBranchChange(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.value && target.value !== this.currentBranchId()) this.devToolsState.switchBranch(target.value);
  }

  onBranchNameInput(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) this.newBranchName.set(target.value);
  }

  toggleBranchPopover(): void {
    this.showBranchPopover.update(open => !open);
  }

  createBranch(): void {
    const name = this.newBranchName().trim();
    if (!name) return;
    this.devToolsState.createBranch(name);
    this.newBranchName.set('');
    this.showBranchPopover.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-branch-popover]')) this.showBranchPopover.set(false);
  }
}
