import { WorktreeTableSet } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  input,
  model,
  output,
  signal
} from '@angular/core';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideGitBranch as GitBranch,
  LucideLink as Link,
  LucideDynamicIcon,
  LucideMoreVertical as MoreVertical,
  LucidePlus as Plus
} from '@lucide/angular';
import { isImeComposing } from '../working-tree.ime';

/** 工作树工具栏里的检出位选择器。只显示可写检出位；主检出位是固定的第一行。 */
@Component({
  selector: 'app-working-tree-worktree-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  template: `
    <div class="flex h-full items-stretch">
      <div class="relative flex-1">
        <button
          class="gd-toolbar-select"
          [attr.aria-expanded]="menuOpen()"
          [disabled]="busy()"
          (click)="toggleMenu()"
          aria-controls="wt-worktree-menu-popup"
          aria-haspopup="dialog"
          data-testid="wt-worktree-menu"
          type="button"
        >
          <svg [lucideIcon]="Link" size="17"></svg>
          <span class="min-w-0 flex-1 text-left">
            <small>Worktree</small>
            <strong class="truncate">{{ currentLabel() }}</strong>
          </span>
          <svg
            class="transition-transform"
            [lucideIcon]="ChevronDown"
            [style.transform]="menuOpen() ? 'rotate(180deg)' : null"
            size="14"
          ></svg>
        </button>

        @if (menuOpen()) {
          <div
            class="fixed inset-0 z-30"
            [style.background]="'rgba(0, 0, 0, 0.35)'"
            (click)="closeAll()"
            (keydown.escape)="closeAll()"
            aria-label="Close worktree menu"
            role="button"
            tabindex="0"
          ></div>
          <div
            class="gd-menu gd-menu-flush absolute top-full left-0 z-40 flex min-w-[320px] flex-col overflow-y-auto"
            id="wt-worktree-menu-popup"
            [style.width.px]="popupWidth()"
            aria-label="Worktree list"
            data-testid="wt-worktree-menu-popup"
            role="dialog"
          >
            <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
              <span class="text-[11px] font-semibold uppercase" [style.color]="'var(--gd-muted)'">Worktrees</span>
              <button
                class="gd-btn-ghost shrink-0"
                (click)="requestCreate()"
                data-testid="wt-worktree-create"
                type="button"
              >
                <svg [lucideIcon]="Plus" size="12"></svg>
                New Worktree…
              </button>
            </div>

            <div class="gd-menu-header">Main worktree</div>
            <button
              class="gd-menu-row"
              [attr.aria-current]="isMainMounted() ? 'true' : null"
              (click)="selectMain()"
              data-testid="wt-worktree-item"
              data-worktree-id="main"
              type="button"
            >
              <svg
                class="shrink-0"
                [lucideIcon]="isMainMounted() ? Check : GitBranch"
                [style.color]="isMainMounted() ? 'var(--gd-accent)' : null"
                size="13"
              ></svg>
              <span class="min-w-0 flex-1 truncate text-left text-sm font-medium">Main worktree</span>
              <span class="text-xs" [style.color]="'var(--gd-muted)'">{{ mainBranch() }}</span>
            </button>

            <div class="gd-menu-header mt-1">Linked worktrees</div>
            @if (linkedWorktrees().length === 0) {
              <p class="px-4 py-3 text-center text-sm" [style.color]="'var(--gd-muted)'">No linked worktrees</p>
            } @else {
              <ul class="py-1">
                @for (worktree of linkedWorktrees(); track worktree.id) {
                  <li>
                    <div class="flex items-stretch">
                      <button
                        class="gd-menu-row min-w-0 flex-1"
                        [attr.aria-current]="isCurrent(worktree) ? 'true' : null"
                        [attr.data-worktree-id]="worktree.id"
                        (click)="select(worktree)"
                        data-testid="wt-worktree-item"
                        type="button"
                      >
                        <svg
                          class="shrink-0"
                          [lucideIcon]="isCurrent(worktree) ? Check : Link"
                          [style.color]="isCurrent(worktree) ? 'var(--gd-accent)' : null"
                          size="13"
                        ></svg>
                        <span class="min-w-0 flex-1 truncate text-left text-sm font-medium">{{ label(worktree) }}</span>
                        <span class="max-w-32 truncate text-xs" [style.color]="'var(--gd-muted)'">{{
                          worktree.branchId
                        }}</span>
                      </button>
                      <button
                        class="gd-icon-btn"
                        [attr.aria-label]="'Rename ' + label(worktree)"
                        [attr.data-testid]="'wt-worktree-rename-' + worktree.id"
                        [attr.data-worktree-id]="worktree.id"
                        (click)="requestRename(worktree, $event)"
                        type="button"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                      <button
                        class="gd-icon-btn"
                        [attr.aria-label]="'Delete ' + label(worktree)"
                        [attr.data-testid]="'wt-worktree-delete-' + worktree.id"
                        [attr.data-worktree-id]="worktree.id"
                        (click)="requestDelete(worktree, $event)"
                        type="button"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                      <button
                        class="gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex"
                        [attr.aria-label]="'More actions for ' + label(worktree)"
                        [attr.data-worktree-id]="worktree.id"
                        (click)="openActions($event, worktree)"
                        data-testid="wt-worktree-more"
                        type="button"
                      >
                        <svg [lucideIcon]="MoreVertical" size="14"></svg>
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class WorkingTreeWorktreeMenuComponent {
  readonly busy = input(false);
  readonly records = input<readonly Worktree[]>([]);
  readonly mounted = input.required<WorktreeTableSet>();
  readonly mainBranch = input('main');
  readonly popupWidth = input(320);
  readonly menuOpen = model(false);

  readonly selectWorktree = output<Worktree>();
  readonly selectMainWorktree = output<void>();
  readonly createRequest = output<void>();
  readonly menuRequest = output<{ target: Worktree; event: MouseEvent }>();
  readonly renameRequest = output<Worktree>();
  readonly deleteRequest = output<Worktree>();

  readonly Link = Link;
  readonly Check = Check;
  readonly ChevronDown = ChevronDown;
  readonly GitBranch = GitBranch;
  readonly MoreVertical = MoreVertical;
  readonly Plus = Plus;
  readonly filter = signal('');

  readonly linkedWorktrees = computed(() =>
    this.records().filter(record => record.mode === 'writable' && record.state === 'ready')
  );
  readonly currentLabel = computed(() => {
    if (this.mounted().isMain) return 'Main worktree';
    const current = this.linkedWorktrees().find(record => record.tableSetSuffix === this.mounted().suffix);
    return current === undefined ? '…' : this.label(current);
  });

  toggleMenu(): void {
    if (this.menuOpen()) this.closeAll();
    else this.menuOpen.set(true);
  }

  closeAll(): void {
    this.menuOpen.set(false);
  }

  requestCreate(): void {
    this.closeAll();
    this.createRequest.emit();
  }

  isMainMounted(): boolean {
    return this.mounted().isMain;
  }

  isCurrent(record: Worktree): boolean {
    return !this.mounted().isMain && record.tableSetSuffix === this.mounted().suffix;
  }

  label(record: Worktree): string {
    return record.name?.trim() || record.branchId;
  }

  selectMain(): void {
    if (this.isMainMounted()) {
      this.closeAll();
      return;
    }
    this.closeAll();
    this.selectMainWorktree.emit();
  }

  select(record: Worktree): void {
    if (this.isCurrent(record)) {
      this.closeAll();
      return;
    }
    this.closeAll();
    this.selectWorktree.emit(record);
  }

  openActions(event: MouseEvent, record: Worktree): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuRequest.emit({
      target: record,
      event: new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom, bubbles: true })
    });
  }

  requestRename(record: Worktree, event: MouseEvent): void {
    event.stopPropagation();
    this.closeAll();
    this.renameRequest.emit(record);
  }

  requestDelete(record: Worktree, event: MouseEvent): void {
    event.stopPropagation();
    this.closeAll();
    this.deleteRequest.emit(record);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !isImeComposing(event)) this.closeAll();
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-worktree-id]');
    if (!target || target.dataset['worktreeId'] === 'main') return;
    const record = this.linkedWorktrees().find(candidate => candidate.id === target.dataset['worktreeId']);
    if (!record) return;
    event.preventDefault();
    this.menuRequest.emit({ target: record, event });
  }
}
