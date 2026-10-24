import type { RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideGitBranch as GitBranch, LucideLink as Link, LucideDynamicIcon } from '@lucide/angular';
import { isImeComposing } from '../working-tree.ime';
import { WorkingTreeDialogShellComponent } from './dialog-shell.component';

/** 新建、改名与删除检出位的页面级对话框。 */
@Component({
  selector: 'app-working-tree-worktree-dialogs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideDynamicIcon, WorkingTreeDialogShellComponent],
  template: `
    @if (createOpen()) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-worktree-create-title"
        testId="wt-worktree-create-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="Link" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-worktree-create-title">New Worktree</h2>
        </div>
        <label class="mb-1 block text-sm font-medium" for="wt-worktree-create-name">Name</label>
        <input
          class="gd-input mb-3 w-full"
          id="wt-worktree-create-name"
          #createInput
          [ngModel]="createName()"
          (keydown)="onCreateKeydown($event)"
          (ngModelChange)="createName.set($event)"
          autocomplete="off"
          data-testid="wt-worktree-create-name"
          type="text"
        />
        <label class="mb-1 block text-sm font-medium" for="wt-worktree-create-branch">Branch</label>
        <select
          class="gd-input mb-3 w-full"
          id="wt-worktree-create-branch"
          [ngModel]="createBranch()"
          (ngModelChange)="createBranch.set($event)"
          data-testid="wt-worktree-create-branch"
        >
          <option value="">Use the first available branch</option>
          @for (branch of branches(); track branch.id) {
            <option [disabled]="branch.activeKey !== null && branch.activeKey !== undefined" [value]="branch.id">
              {{ branch.id }}{{ branch.activeKey ? ' (in use)' : '' }}
            </option>
          }
        </select>
        @if (error(); as message) {
          <p class="mb-3 text-sm" [style.color]="'var(--gd-del-fg)'" data-testid="wt-worktree-error" role="alert">
            {{ message }}
          </p>
        }
        <div class="flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            [disabled]="busy()"
            (click)="closeRequested.emit()"
            data-testid="wt-worktree-create-cancel"
            type="button"
          >
            Cancel
          </button>
          <button
            class="gd-btn-primary"
            [disabled]="!canCreate()"
            (click)="submitCreate()"
            data-testid="wt-worktree-create-confirm"
            type="button"
          >
            {{ busy() ? 'Creating…' : 'Create worktree' }}
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }

    @if (renameTarget(); as target) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-worktree-rename-title"
        testId="wt-worktree-rename-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="Link" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-worktree-rename-title">Rename Worktree</h2>
        </div>
        <p class="mb-3 text-sm" [style.color]="'var(--gd-muted)'">Rename “{{ label(target) }}”.</p>
        <label class="mb-1 block text-sm font-medium" for="wt-worktree-rename-name">Name</label>
        <input
          class="gd-input mb-3 w-full"
          id="wt-worktree-rename-name"
          #renameInput
          [ngModel]="renameName()"
          (keydown)="onRenameKeydown($event)"
          (ngModelChange)="renameName.set($event)"
          autocomplete="off"
          data-testid="wt-worktree-rename-name"
          type="text"
        />
        @if (error(); as message) {
          <p class="mb-3 text-sm" [style.color]="'var(--gd-del-fg)'" data-testid="wt-worktree-error" role="alert">
            {{ message }}
          </p>
        }
        <div class="flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            [disabled]="busy()"
            (click)="closeRequested.emit()"
            data-testid="wt-worktree-rename-cancel"
            type="button"
          >
            Cancel
          </button>
          <button
            class="gd-btn-primary"
            [disabled]="!canRename()"
            (click)="submitRename()"
            data-testid="wt-worktree-rename-confirm"
            type="button"
          >
            {{ busy() ? 'Renaming…' : 'Rename' }}
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }

    @if (deleteTarget(); as target) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-worktree-delete-title"
        testId="wt-worktree-delete-dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <svg class="text-[var(--gd-del-fg)]" [lucideIcon]="GitBranch" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-worktree-delete-title">Delete Worktree</h2>
        </div>
        <p class="mb-3 text-sm">Delete “{{ label(target) }}”?</p>
        @if (deleteDirty()) {
          <p
            class="mb-4 text-sm"
            [style.color]="'var(--gd-del-fg)'"
            data-testid="wt-worktree-delete-warning"
            role="alert"
          >
            This worktree has uncommitted changes. They will remain on its branch after deletion.
          </p>
        } @else {
          <p class="mb-4 text-sm" [style.color]="'var(--gd-muted)'">The linked worktree will be removed.</p>
        }
        <div class="flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            (click)="closeRequested.emit()"
            data-testid="wt-worktree-delete-cancel"
            type="button"
          >
            Cancel
          </button>
          <button
            class="gd-btn-primary"
            [style.background]="'var(--gd-del-fg)'"
            [style.border-color]="'var(--gd-del-fg)'"
            (click)="confirmDelete.emit()"
            data-testid="wt-worktree-delete-confirm"
            type="button"
          >
            Delete
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }
  `
})
export class WorkingTreeWorktreeDialogsComponent {
  readonly createOpen = input(false);
  readonly branches = input<readonly RxDBBranch[]>([]);
  readonly createName = model('');
  readonly createBranch = model('');
  readonly renameTarget = input<Worktree | null>(null);
  readonly renameName = model('');
  readonly deleteTarget = input<Worktree | null>(null);
  readonly deleteDirty = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly closeRequested = output<void>();
  readonly createConfirmed = output<{ name: string; branchId: string }>();
  readonly renameConfirmed = output<string>();
  readonly confirmDelete = output<void>();

  readonly Link = Link;
  readonly GitBranch = GitBranch;

  readonly canCreate = computed(() => {
    const branchId = this.createBranch().trim();
    const branch = this.branches().find(candidate => candidate.id === branchId);
    const available = this.branches().some(candidate => candidate.activeKey == null);
    return this.createName().trim() !== '' && (branchId === '' ? available : branch?.activeKey == null) && !this.busy();
  });
  readonly canRename = computed(() => this.renameName().trim() !== '' && !this.busy());

  label(target: Worktree): string {
    return target.name?.trim() || target.branchId;
  }

  submitCreate(): void {
    if (!this.canCreate()) return;
    this.createConfirmed.emit({ name: this.createName().trim(), branchId: this.createBranch().trim() });
  }

  submitRename(): void {
    if (!this.canRename()) return;
    this.renameConfirmed.emit(this.renameName().trim());
  }

  onCreateKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || isImeComposing(event)) return;
    event.preventDefault();
    this.submitCreate();
  }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || isImeComposing(event)) return;
    event.preventDefault();
    this.submitRename();
  }
}
