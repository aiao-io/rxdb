import {
  afterRenderEffect,
  ApplicationRef,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  NgZone,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import {
  LucideGitBranch as BranchIcon,
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideCopy as Copy,
  LucideFileDiff as FileDiff,
  LucideFilter as Filter,
  LucideFolder as Folder,
  LucideDynamicIcon,
  LucideMoreVertical as MoreVertical,
  LucideSearch as Search,
  LucideSettings2 as Settings2,
  LucideTrash2 as Trash2,
  LucideUserPlus as UserPlus,
  LucideUsersRound as UsersRound
} from '@lucide/angular';

import { finderPathOf, fromVmPath, HOME, toVmPath, type DiskPath } from '../../disk/disk-path';
import { DesktopAppServices } from '../../services/desktop-app-services';
import {
  DesktopMenus,
  type GithubExternalTarget,
  type GithubRepositoryMenu,
  type GithubTab
} from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { archiveOfDirectory, archiveOfUploadedDirectory, type SourceDirectory } from '../../services/git/git-directory';
import {
  type GitBranch,
  type GitCommit,
  type GitCommitFileChange,
  type GitFile,
  type GitFileDiff,
  type GitFileVersion,
  type GitStatus,
  type GitStatusEntry
} from '../../services/github-git-backend';
import { parseGithubRemote, type GithubRepositoryRecord } from '../../services/github-repository';
import { GithubWorkspace } from '../../services/github-workspace';
import type { GitHubBranch, GitHubRepoSummary, GitHubSession } from '../../services/github/github-types';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';

const fatalDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type GithubChangeKind = 'all' | 'added' | 'modified' | 'deleted';

interface GithubDiffLine {
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
  readonly oldText: string | null;
  readonly newText: string | null;
  readonly same: boolean;
}

interface GithubDiffValue {
  readonly base: GitFileVersion;
  readonly modified: GitFileVersion;
}

type DirectoryPicker = () => Promise<SourceDirectory>;

interface DirectoryPickerWindow extends Window {
  readonly showDirectoryPicker?: DirectoryPicker;
}

type GithubContextMenu =
  | { readonly kind: 'file'; readonly path: string; readonly x: number; readonly y: number }
  | { readonly kind: 'branch'; readonly name: string; readonly x: number; readonly y: number }
  | { readonly kind: 'commit'; readonly oid: string; readonly x: number; readonly y: number };

type GithubContextMenuTarget =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'branch'; readonly name: string }
  | { readonly kind: 'commit'; readonly oid: string };

const ASIDE_WIDTH_MIN = 240;
const ASIDE_WIDTH_MAX = 560;

function bytesOf(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function textOf(bytes: Uint8Array): string | null {
  try {
    const value = fatalDecoder.decode(bytes);
    return value.includes('\0') ? null : value;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function linesOf(text: string | null): readonly string[] {
  if (text === null) return [];
  const lines = text.split('\n');
  return lines.length > 1 && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function diffLinesOf(value: GithubDiffValue | null): readonly GithubDiffLine[] {
  if (!value || value.base.binary || value.modified.binary) return [];
  const oldLines = linesOf(value.base.text);
  const newLines = linesOf(value.modified.text);
  const max = oldLines.length + newLines.length;
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[0, 0]]);

  for (let distance = 0; distance <= max; distance++) {
    trace.push(new Map(frontier));
    const next = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down =
        diagonal === -distance ||
        (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
      let oldIndex = down ? (frontier.get(diagonal + 1) ?? 0) : (frontier.get(diagonal - 1) ?? 0) + 1;
      let newIndex = oldIndex - diagonal;
      while (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
        oldIndex++;
        newIndex++;
      }
      next.set(diagonal, oldIndex);
      if (oldIndex >= oldLines.length && newIndex >= newLines.length) {
        return buildDiffLines(oldLines, newLines, trace, distance);
      }
    }
    frontier = next;
  }

  return [];
}

function buildDiffLines(
  oldLines: readonly string[],
  newLines: readonly string[],
  trace: readonly Map<number, number>[],
  finalDistance: number
): readonly GithubDiffLine[] {
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  const result: GithubDiffLine[] = [];

  for (let distance = finalDistance; distance > 0; distance--) {
    const diagonal = oldIndex - newIndex;
    const previous = trace[distance - 1];
    const down =
      diagonal === -distance ||
      (diagonal !== distance && (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1));
    const previousDiagonal = down ? diagonal + 1 : diagonal - 1;
    const previousOldIndex = previous.get(previousDiagonal) ?? 0;
    const previousNewIndex = previousOldIndex - previousDiagonal;

    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      result.push({
        oldNumber: oldIndex,
        newNumber: newIndex,
        oldText: oldLines[oldIndex - 1],
        newText: newLines[newIndex - 1],
        same: true
      });
      oldIndex--;
      newIndex--;
    }

    if (oldIndex === previousOldIndex) {
      result.push({
        oldNumber: null,
        newNumber: newIndex,
        oldText: null,
        newText: newLines[newIndex - 1],
        same: false
      });
      newIndex--;
    } else {
      result.push({
        oldNumber: oldIndex,
        newNumber: null,
        oldText: oldLines[oldIndex - 1],
        newText: null,
        same: false
      });
      oldIndex--;
    }
  }

  while (oldIndex > 0 && newIndex > 0) {
    result.push({
      oldNumber: oldIndex,
      newNumber: newIndex,
      oldText: oldLines[oldIndex - 1],
      newText: newLines[newIndex - 1],
      same: true
    });
    oldIndex--;
    newIndex--;
  }

  return result.reverse();
}

@Component({
  selector: 'app-github',
  imports: [TrafficLights, LucideDynamicIcon],
  templateUrl: './github.html',
  encapsulation: ViewEncapsulation.None,
  host: {
    style: 'display: contents'
  }
})
export class GithubApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly menus = inject(DesktopMenus);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  private readonly destroyRef = inject(DestroyRef);
  private readonly backend = inject(DesktopAppServices).get(GithubWorkspace);
  private readonly store = this.backend.records;
  private readonly connection = this.backend.connection;
  private readonly auth = this.connection.auth;
  private readonly api = this.connection.api;
  private readonly remote = this.connection.remote;
  private readonly unsubscribeAuth: () => void;
  private currentRevision = 0;
  private historyLoadRequest = 0;
  private restorePromise: Promise<void> | null = null;
  private readonly storageListener: (event: StorageEvent) => void;
  private readonly commitMessageInput = viewChild<ElementRef<HTMLInputElement>>('commitMessageInput');
  private readonly repositoryInput = viewChild<ElementRef<HTMLElement>>('repositoryInput');
  private readonly newRepositoryInput = viewChild<ElementRef<HTMLElement>>('newRepositoryInput');
  private readonly localRepositoryButton = viewChild<ElementRef<HTMLElement>>('localRepositoryButton');
  private readonly localRepositoryInput = viewChild<ElementRef<HTMLInputElement>>('localRepositoryInput');
  private readonly branchInput = viewChild<ElementRef<HTMLElement>>('newBranchInput');
  private readonly repositoryMenuFocus = signal<GithubRepositoryMenu | null>(null);
  private readonly branchMenuFocus = signal(false);
  private readonly changesFilterFocus = signal(false);

  private readonly changeFilterInput = viewChild<ElementRef<HTMLInputElement>>('changeFilterInput');

  protected readonly records = this.store.records;
  protected readonly session = signal<GitHubSession | null>(null);
  protected readonly activeRecord = signal<GithubRepositoryRecord | null>(null);
  protected readonly files = signal<readonly GitFile[]>([]);
  protected readonly status = signal<GitStatus | null>(null);
  protected readonly branches = signal<readonly GitBranch[]>([]);
  protected readonly remoteBranches = signal<readonly GitHubBranch[]>([]);
  protected readonly searchResults = signal<readonly GitHubRepoSummary[]>([]);
  protected readonly history = signal<readonly GitCommit[]>([]);
  protected readonly diff = signal<GitFileDiff | null>(null);
  protected readonly historyChanges = signal<readonly GitCommitFileChange[]>([]);
  protected readonly historyDiff = signal<GitCommitFileChange | null>(null);
  protected readonly historyDetailsExpanded = signal(false);
  protected readonly historyDiffSettingsOpen = signal(false);
  protected readonly selectedHistoryPath = signal<string | null>(null);
  protected readonly selectedPath = signal<string | null>(null);
  protected readonly editorValue = signal('');
  protected readonly tab = signal<GithubTab>('changes');
  protected readonly busy = signal(false);
  protected readonly authBusy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorCode = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editorDirty = signal(false);
  protected readonly repoValue = signal('');
  protected readonly branchValue = signal('');
  protected readonly searchValue = signal('');
  protected readonly pendingBranch = signal<string | null>(null);
  protected readonly newRepoValue = signal('');
  protected readonly newBranchValue = signal('');
  protected readonly commitValue = signal('');
  protected readonly commitDescription = signal('');
  protected readonly patValue = signal('');
  protected readonly repositoryMenuOpen = signal(false);
  protected readonly worktreeMenuOpen = signal(false);
  protected readonly branchMenuOpen = signal(false);
  protected readonly branchFilter = signal('');
  protected readonly worktreeFilter = signal('');
  protected readonly changeFilter = signal('');
  protected readonly changeKind = signal<GithubChangeKind>('all');
  protected readonly changeKindOpen = signal(false);
  protected readonly contextMenu = signal<GithubContextMenu | null>(null);
  protected readonly changeKinds: readonly GithubChangeKind[] = ['all', 'added', 'modified', 'deleted'];
  protected readonly asideWidth = signal(380);
  protected readonly worktreeWidth = signal(190);
  protected readonly branchWidth = signal(250);
  protected readonly showCleanFiles = signal(false);
  protected readonly lastFetchedAt = signal<number | null>(null);
  protected readonly selectedCommitOid = signal<string | null>(null);

  protected readonly selectedFile = computed(() => {
    const path = this.selectedPath();
    return path ? (this.files().find(file => file.path === path) ?? null) : null;
  });
  protected readonly selectedText = computed(() => {
    const file = this.selectedFile();
    return file ? textOf(file.bytes) : null;
  });
  protected readonly hasChanges = computed(() => (this.status()?.entries.length ?? 0) > 0 || this.editorDirty());
  protected readonly changedEntries = computed(() => this.status()?.entries ?? []);
  protected readonly currentBranch = computed(() => this.status()?.branch ?? this.activeRecord()?.branch ?? 'main');
  protected readonly currentWorktree = computed(() => this.activeRecord()?.name ?? 'No repository');
  protected readonly cleanRepository = computed(() => !this.hasChanges() && !this.showCleanFiles());
  protected readonly canDiscardBranch = computed(() => this.errorCode() === 'dirty_workspace');
  protected readonly lastFetchedLabel = computed(() => {
    const timestamp = this.lastFetchedAt();
    return timestamp === null ? 'Never' : (
        new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
      );
  });
  protected readonly selectedCommit = computed(() => {
    const selected = this.selectedCommitOid();
    const commits = this.history();
    return commits.find(commit => commit.oid === selected) ?? commits[0] ?? null;
  });
  protected readonly filteredEntries = computed(() => {
    const needle = this.changeFilter().trim().toLowerCase();
    const kind = this.changeKind();
    return this.changedEntries().filter(entry => {
      const matchesText = entry.path.toLowerCase().includes(needle);
      const matchesKind = kind === 'all' || this.changeKindFor(entry) === kind;
      return matchesText && matchesKind;
    });
  });
  protected readonly visibleFiles = computed(() => {
    const entries = this.changedEntries();
    if (!entries.length) return this.showCleanFiles() ? this.files() : [];
    const paths = new Set(this.filteredEntries().map(entry => entry.path));
    return this.files().filter(file => paths.has(file.path));
  });
  protected readonly filteredBranches = computed(() => {
    const needle = this.branchFilter().trim().toLowerCase();
    return this.branches().filter(branch => branch.name.toLowerCase().includes(needle));
  });
  protected readonly diffLines = computed(() => diffLinesOf(this.diff()));
  protected readonly historyDiffLines = computed(() => diffLinesOf(this.historyDiff()));
  protected readonly historyStats = computed(() => {
    let additions = 0;
    let deletions = 0;
    for (const change of this.historyChanges()) {
      for (const line of diffLinesOf(change)) {
        if (line.same) continue;
        if (line.newText !== null) additions++;
        if (line.oldText !== null) deletions++;
      }
    }
    return { additions, deletions };
  });

  protected readonly Check = Check;
  protected readonly ChevronDown = ChevronDown;
  protected readonly Copy = Copy;
  protected readonly FileDiff = FileDiff;
  protected readonly Filter = Filter;
  protected readonly Folder = Folder;
  protected readonly GitBranch = BranchIcon;
  protected readonly MoreVertical = MoreVertical;
  protected readonly Search = Search;
  protected readonly Settings2 = Settings2;
  protected readonly Trash2 = Trash2;
  protected readonly UserPlus = UserPlus;
  protected readonly UsersRound = UsersRound;

  constructor() {
    this.win.setMenus(computed(() => this.menuSections()));
    const changes = this.backend.changes.subscribe(id => {
      if (this.activeRecord()?.projectId === id) this.reloadExternal();
    });
    this.destroyRef.onDestroy(() => changes.unsubscribe());
    effect(() => {
      const front = this.wm.focused() === this.win;
      if (front) untracked(() => this.reloadExternal());
    });
    afterRenderEffect(() => {
      const repositoryFocus = this.repositoryMenuFocus();
      const branchFocus = this.branchMenuFocus();
      if (this.repositoryMenuOpen() && repositoryFocus) {
        let focusTarget: ElementRef<HTMLElement> | undefined;
        if (repositoryFocus === 'clone') focusTarget = this.repositoryInput();
        if (repositoryFocus === 'new') focusTarget = this.newRepositoryInput();
        if (repositoryFocus === 'local') focusTarget = this.localRepositoryButton();
        if (focusTarget) focusTarget.nativeElement.focus();
        untracked(() => this.repositoryMenuFocus.set(null));
      }
      if (this.branchMenuOpen() && branchFocus) {
        const input = this.branchInput();
        if (input) input.nativeElement.focus();
        untracked(() => this.branchMenuFocus.set(false));
      }
      if (this.changesFilterFocus()) {
        const input = this.changeFilterInput();
        if (input) input.nativeElement.focus();
        untracked(() => this.changesFilterFocus.set(false));
      }
    });
    this.storageListener = event => {
      if (event.key === 'aiao-desktop-github-session-updated') void this.auth.refresh();
    };
    this.unsubscribeAuth = this.auth.subscribe(session => this.session.set(session));
    addEventListener('storage', this.storageListener);
    this.destroyRef.onDestroy(() => {
      this.unsubscribeAuth();
      removeEventListener('storage', this.storageListener);
    });
    void this.restoreLastRepository().catch(error => this.fail(error));
  }

  protected setValue(
    target:
      | 'repo'
      | 'branch'
      | 'newRepo'
      | 'newBranch'
      | 'commit'
      | 'commitDescription'
      | 'pat'
      | 'search'
      | 'branchFilter'
      | 'worktreeFilter'
      | 'changeFilter',
    event: Event
  ): void {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const value = element.value;
    if (target === 'repo') this.repoValue.set(value);
    if (target === 'branch') this.branchValue.set(value);
    if (target === 'search') this.searchValue.set(value);
    if (target === 'newRepo') this.newRepoValue.set(value);
    if (target === 'newBranch') this.newBranchValue.set(value);
    if (target === 'commit') this.commitValue.set(value);
    if (target === 'commitDescription') this.commitDescription.set(value);
    if (target === 'pat') this.patValue.set(value);
    if (target === 'branchFilter') this.branchFilter.set(value);
    if (target === 'worktreeFilter') this.worktreeFilter.set(value);
    if (target === 'changeFilter') this.changeFilter.set(value);
  }

  protected openLocalRepository(): void {
    this.openRepositoryMenu('local');
  }

  protected openRepositoryInEditor(): void {
    if (!this.activeRecord()) return;
    this.showCleanFiles.set(true);
    const path = this.selectedPath() ?? this.files()[0]?.path ?? null;
    if (path) this.openFile(path);
    this.wm.open('vscode', { projectId: this.activeRecord()!.projectId });
    this.notice.set('Opened Aiao Code');
  }

  protected showRepositoryInFinder(): void {
    if (!this.activeRecord()) return;
    const root = this.activeRecord()?.rootPath;
    this.wm.open('finder', root ? { path: finderPathOf(root), force: true } : {});
    this.notice.set('Opened Finder');
  }

  protected openImportPicker(event: Event): void {
    event.preventDefault();
    const input =
      event.currentTarget instanceof HTMLElement ?
        event.currentTarget.querySelector<HTMLInputElement>('input[type=file]')
      : null;
    input?.click();
  }

  protected async configureOrigin(url: string | null): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const next = await this.backend.configureRemote(record.projectId, url);
      this.activeRecord.set(next);
      this.repoValue.set(next.owner ? `${next.owner}/${next.repo}` : '');
      this.notice.set(url ? 'Added remote origin' : 'Removed remote origin');
    });
  }

  protected droppedDiskFolder(event: Event): void {
    if (
      event instanceof CustomEvent &&
      Array.isArray(event.detail) &&
      event.detail.every(part => typeof part === 'string')
    )
      void this.openDiskDirectory(event.detail);
  }

  protected async openDiskDirectory(path: DiskPath): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    try {
      await this.openStored(await this.backend.openDirectory(path));
    } catch (error) {
      this.fail(error);
    }
  }

  protected openLocalPath(value: string): void {
    const path = value.startsWith('~/') ? [...HOME, ...fromVmPath(value.slice(2))] : fromVmPath(value);
    void this.openDiskDirectory(path);
  }

  protected foldersOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  }

  protected async dropFolders(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.ensureEditorSaved() || !event.dataTransfer) return;
    // 浏览器只允许在 drop 回调首次 await 之前取得句柄。
    const items = Array.from(event.dataTransfer.items).filter(item => item.kind === 'file');
    const handles = items.map(item =>
      (
        item as DataTransferItem & {
          getAsFileSystemHandle?(): Promise<SourceDirectory | { kind: 'file'; name: string } | null>;
        }
      ).getAsFileSystemHandle?.()
    );
    await this.run(async () => {
      const added: string[] = [];
      const errors: string[] = [];
      for (const item of await Promise.allSettled(handles)) {
        const handle = item.status === 'fulfilled' ? item.value : null;
        try {
          if (item.status === 'rejected') throw item.reason;
          if (handle?.kind !== 'directory') throw new Error('请选择 Git 仓库文件夹，也可以使用 Add Local Repository');
          const { name, archive } = await archiveOfDirectory(handle);
          await this.importArchive(name, archive, 'Added');
          added.push(toVmPath(this.activeRecord()!.rootPath!));
        } catch (error) {
          errors.push(`${handle?.name ?? 'Folder'} · ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (added.length) this.notice.set(`Added ${added.join(', ')}`);
      if (errors.length) throw new Error(errors.join(' · '));
    });
  }

  protected openLocalRepositoryPicker(): void {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      void this.pickLocalDirectory(picker);
      return;
    }
    this.localRepositoryInput()?.nativeElement.click();
  }

  protected async importLocalDirectory(event: Event): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement) || !element.files?.length) return;
    const files = [...element.files];
    element.value = '';
    await this.run(async () => {
      const archive = await archiveOfUploadedDirectory(files);
      await this.importArchive(archive.name, archive.archive, 'Added');
    });
  }

  protected toggleRepositoryMenu(): void {
    if (this.repositoryMenuOpen()) {
      this.closeRepositoryMenu();
      return;
    }
    this.openRepositoryMenu('clone');
  }

  protected openRepositoryMenu(kind: GithubRepositoryMenu): void {
    this.worktreeMenuOpen.set(false);
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    this.repositoryMenuFocus.set(kind);
    this.repositoryMenuOpen.set(true);
  }

  protected closeRepositoryMenu(): void {
    this.repositoryMenuOpen.set(false);
  }

  protected toggleWorktreeMenu(): void {
    if (this.worktreeMenuOpen()) {
      this.closeWorktreeMenu();
      return;
    }
    this.repositoryMenuOpen.set(false);
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    this.worktreeFilter.set('');
    this.worktreeMenuOpen.set(true);
  }

  protected closeWorktreeMenu(): void {
    this.worktreeMenuOpen.set(false);
  }

  protected toggleBranchMenu(): void {
    if (this.branchMenuOpen()) {
      this.closeBranchMenu();
      return;
    }
    this.openBranchMenu();
  }

  protected openBranchMenu(): void {
    this.repositoryMenuOpen.set(false);
    this.worktreeMenuOpen.set(false);
    this.closeContextMenu();
    this.branchMenuFocus.set(true);
    this.branchMenuOpen.set(true);
  }

  protected closeBranchMenu(): void {
    this.branchMenuOpen.set(false);
  }

  protected toggleChangeKind(): void {
    this.changeKindOpen.update(open => !open);
  }

  protected closeChangeKind(): void {
    this.changeKindOpen.set(false);
  }

  protected setChangeKind(kind: GithubChangeKind): void {
    this.changeKind.set(kind);
    this.changeKindOpen.set(false);
  }

  protected changeKindLabel(): string {
    const labels: Record<GithubChangeKind, string> = {
      all: 'All',
      added: 'Added',
      modified: 'Modified',
      deleted: 'Deleted'
    };
    return labels[this.changeKind()];
  }

  protected openContextMenu(event: MouseEvent, menu: GithubContextMenuTarget): void {
    event.preventDefault();
    event.stopPropagation();
    const width = 230;
    const height = menu.kind === 'file' ? 180 : 125;
    this.contextMenu.set({
      ...menu,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))
    });
  }

  protected closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  protected async copyValue(value: string): Promise<void> {
    this.closeContextMenu();
    try {
      await navigator.clipboard.writeText(value);
      this.notice.set(`Copied ${value}`);
    } catch (error) {
      this.fail(error);
    }
  }

  protected async deleteBranch(branch: string): Promise<void> {
    const record = this.activeRecord();
    if (!record || branch === this.currentBranch()) return;
    this.closeContextMenu();
    await this.run(async () => {
      this.branches.set(await this.backend.deleteBranch(record.projectId, branch));
      this.notice.set(`Deleted branch ${branch}`);
    });
  }

  protected async restoreFromContext(oid: string): Promise<void> {
    this.closeContextMenu();
    await this.restore(oid);
  }

  protected contextSelectFile(path: string): void {
    this.closeContextMenu();
    this.openFile(path);
  }

  protected async contextShowDiff(path: string): Promise<void> {
    const entry = this.statusEntryForPath(path);
    this.closeContextMenu();
    await this.showDiff(path, entry && this.isStaged(entry) ? 'staged' : 'working');
  }

  protected async contextStage(path: string): Promise<void> {
    this.closeContextMenu();
    await this.stage(path);
  }

  protected async contextUnstage(path: string): Promise<void> {
    this.closeContextMenu();
    await this.unstage(path);
  }

  protected async contextDiscard(path: string): Promise<void> {
    this.closeContextMenu();
    await this.discard(path);
  }

  protected async fetchOrigin(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      if (!record.owner || !record.repo) {
        await this.refresh();
        this.lastFetchedAt.set(Date.now());
        this.notice.set('Refreshed local status');
        return;
      }
      const remote = await this.backend.fetch(record.projectId);
      this.lastFetchedAt.set(Date.now());
      this.notice.set(remote.record.remoteHead === record.remoteHead ? 'Already up to date' : 'Fetched origin');
    });
  }

  protected startAsideResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.asideWidth();
    const move = (moveEvent: PointerEvent): void => {
      const next = startWidth + moveEvent.clientX - startX;
      this.asideWidth.set(Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, next)));
    };
    const stop = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', stop);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', stop);
  }

  protected handleAsideResizeKey(event: KeyboardEvent): void {
    const step = 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.asideWidth.update(width => Math.max(ASIDE_WIDTH_MIN, width - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.asideWidth.update(width => Math.min(ASIDE_WIDTH_MAX, width + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.asideWidth.set(ASIDE_WIDTH_MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.asideWidth.set(ASIDE_WIDTH_MAX);
    }
  }

  protected startToolbarResize(event: PointerEvent, target: 'repository' | 'worktree' | 'branch'): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      target === 'repository' ? this.asideWidth()
      : target === 'worktree' ? this.worktreeWidth()
      : this.branchWidth();
    const move = (moveEvent: PointerEvent): void => {
      const next = startWidth + moveEvent.clientX - startX;
      if (target === 'repository') this.asideWidth.set(Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, next)));
      if (target === 'worktree') this.worktreeWidth.set(Math.max(160, Math.min(340, next)));
      if (target === 'branch') this.branchWidth.set(Math.max(210, Math.min(480, next)));
    };
    const stop = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', stop);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', stop);
  }

  protected async searchRemoteRepositories(): Promise<void> {
    const query = this.searchValue().trim();
    if (!query) {
      this.searchResults.set([]);
      return;
    }
    await this.run(async () => {
      const results = await this.api.searchRepositories(query, 20);
      this.searchResults.set(results);
      this.repositoryMenuOpen.set(true);
      this.notice.set(results.length ? `Found ${results.length} repositories` : 'No repositories found');
    });
  }

  protected async selectRemoteRepository(repository: GitHubRepoSummary): Promise<void> {
    const address = parseGithubRemote(repository.fullName);
    if (!address) return;
    this.repoValue.set(repository.fullName);
    this.branchValue.set('');
    this.searchResults.set([]);
    this.repositoryMenuOpen.set(true);
    await this.loadRemoteBranches();
  }

  protected selectRemoteBranch(event: Event): void {
    const element = event.target;
    if (element instanceof HTMLSelectElement) this.branchValue.set(element.value);
  }

  protected async loadRemoteBranches(): Promise<void> {
    const address = parseGithubRemote(this.repoValue());
    if (!address) {
      this.fail(new Error('请输入有效的 GitHub owner/repo'));
      return;
    }
    await this.run(async () => {
      const repository = await this.api.getRepository(address.owner, address.repo);
      const branches = await this.api.listBranches(address.owner, address.repo);
      this.remoteBranches.set(branches);
      const preferred = this.branchValue().trim() || address.branch || repository.defaultBranch;
      this.branchValue.set(branches.some(branch => branch.name === preferred) ? preferred : repository.defaultBranch);
      this.notice.set(`Loaded ${branches.length} branches`);
    });
  }

  protected setEditor(event: Event): void {
    const element = event.target;
    if (!(element instanceof HTMLTextAreaElement)) return;
    const path = this.selectedPath();
    const file = this.selectedFile();
    if (!path || !file || textOf(file.bytes) === null) return;
    const next = bytesOf(element.value);
    this.files.update(files => files.map(item => (item.path === path ? { ...item, bytes: next } : item)));
    this.editorValue.set(element.value);
    this.editorDirty.set(true);
    this.win.hasUnsavedChanges.set(true);
  }

  protected async selectFile(path: string, entry: GitStatusEntry | null): Promise<void> {
    if (this.editorDirty() && this.selectedPath() !== path) {
      this.fail(new Error('请先保存当前文件再切换文件'));
      return;
    }
    if (!entry) {
      this.openFile(path);
      return;
    }
    this.selectedPath.set(path);
    await this.showDiff(path);
  }

  protected openFile(path: string): void {
    if (this.editorDirty() && this.selectedPath() !== path) {
      this.fail(new Error('请先保存当前文件再切换文件'));
      return;
    }
    this.selectedPath.set(path);
    const file = this.files().find(item => item.path === path);
    this.editorValue.set(file ? (textOf(file.bytes) ?? '') : '');
    this.diff.set(null);
  }

  protected async openStored(record: GithubRepositoryRecord, closeMenu = true): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    await this.run(async () => {
      const snapshot = await this.backend.open(record.projectId);
      this.activeRecord.set(record);
      this.showCleanFiles.set(false);
      this.repoValue.set(record.owner && record.repo ? `${record.owner}/${record.repo}` : '');
      this.branchValue.set(record.owner ? record.branch : '');
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Opened ${record.name}`);
      if (closeMenu) this.repositoryMenuOpen.set(false);
    });
  }

  protected async createRepository(): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const name = this.newRepoValue().trim() || 'Untitled Repository';
    await this.run(async () => {
      const root = [...HOME, 'Documents', 'GitHub', name];
      const record = await this.backend.createDirectory(root, [{ path: 'README.md', bytes: bytesOf(`# ${name}\n`) }]);
      const projectId = record.projectId;
      await this.backend.stage(projectId, ['README.md']);
      await this.backend.commit(projectId, `Create ${name}`);
      const snapshot = await this.backend.open(projectId);
      this.activeRecord.set(record);
      this.showCleanFiles.set(false);
      this.newRepoValue.set('');
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.repositoryMenuOpen.set(false);
    });
  }

  protected async openRemoteRepository(): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const address = parseGithubRemote(this.repoValue());
    if (!address) {
      this.fail(new Error('请输入 owner/repo 或 GitHub 仓库地址'));
      return;
    }
    this.repositoryMenuOpen.set(false);
    await this.run(async () => {
      const remote = await this.remote.open(address.owner, address.repo, this.branchValue().trim() || address.branch);
      const existing = this.store.find(remote.record.projectId);
      if (existing) {
        const current = await this.backend.open(existing.projectId);
        const currentStatus = await this.backend.status(existing.projectId);
        if (existing.remoteHead === remote.record.remoteHead) {
          this.activeRecord.set(existing);
          this.showCleanFiles.set(false);
          this.repoValue.set(`${remote.record.owner}/${remote.record.repo}`);
          this.branchValue.set(remote.record.branch);
          this.applySnapshot(current.files);
          await this.refresh();
          this.notice.set(`Opened ${remote.record.name}`);
          this.repositoryMenuOpen.set(false);
          return;
        }
        const localDirty = Boolean(currentStatus.entries.length) || this.editorDirty();
        const localFiles = this.editorDirty() ? this.files() : current.files;
        const pulled = await this.remote.pull(existing, localFiles, localDirty, remote);
        await this.replaceFromRemote(existing, pulled, !localDirty);
        return;
      }
      const snapshot = await this.backend.create(remote.record.projectId, remote.files);
      await this.backend.stage(
        remote.record.projectId,
        remote.files.map(file => file.path)
      );
      await this.backend.commit(remote.record.projectId, `Import ${remote.record.name}@${remote.record.branch}`);
      if (remote.record.branch !== 'main') {
        await this.backend.createBranch(remote.record.projectId, remote.record.branch);
        await this.backend.checkout(remote.record.projectId, remote.record.branch);
      }
      await this.backend.setClonedOrigin(remote.record);
      await this.store.put(remote.record);
      this.activeRecord.set(remote.record);
      this.showCleanFiles.set(false);
      this.repoValue.set(`${remote.record.owner}/${remote.record.repo}`);
      this.branchValue.set(remote.record.branch);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.repositoryMenuOpen.set(false);
    });
  }

  protected async importRepository(event: Event): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement) || !element.files?.length) return;
    const file = element.files[0];
    element.value = '';
    await this.run(async () => {
      const name = file.name.replace(/\.(zip|tar)$/i, '') || 'Imported Repository';
      const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
      await this.importArchive(name, bytes, 'Imported');
    });
  }

  protected async exportRepository(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const bytes = await this.backend.exportArchive(record.projectId);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/zip' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${record.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      this.notice.set(`Exported ${record.name}`);
    });
  }

  protected async saveFile(): Promise<void> {
    const record = this.activeRecord();
    const revision = this.status() ? this.currentRevision : null;
    if (!record || revision === null) return;
    await this.run(async () => {
      const snapshot = await this.backend.save(record.projectId, this.files(), revision);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.editorDirty.set(false);
      this.win.hasUnsavedChanges.set(false);
      this.notice.set('Saved to OPFS');
    });
  }

  protected async removeSelectedFile(): Promise<void> {
    const record = this.activeRecord();
    const path = this.selectedPath();
    if (!record || !path) return;
    await this.run(async () => {
      const snapshot = await this.backend.save(
        record.projectId,
        this.files().filter(file => file.path !== path),
        this.currentRevision,
        [path]
      );
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Deleted ${path}`);
    });
  }

  protected async stage(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(await this.backend.stage(record.projectId, [path]));
      this.diff.set(null);
    });
  }

  protected async toggleStage(entry: GitStatusEntry): Promise<void> {
    await (this.isStaged(entry) ? this.unstage(entry.path) : this.stage(entry.path));
  }

  protected async unstage(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(await this.backend.unstage(record.projectId, [path]));
      this.diff.set(null);
    });
  }

  protected async stageAll(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(
        await this.backend.stage(
          record.projectId,
          this.changedEntries().map(entry => entry.path)
        )
      );
      this.diff.set(null);
    });
  }

  protected async discard(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const snapshot = await this.backend.discardWorking(record.projectId, path);
      this.applySnapshot(snapshot.files);
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set(`Discarded ${path}`);
    });
  }

  protected async discardAllChanges(): Promise<void> {
    const record = this.activeRecord();
    const entries = this.changedEntries();
    if (!record || (!entries.length && !this.editorDirty())) return;
    await this.run(async () => {
      const stagedPaths = entries.filter(entry => this.isStaged(entry)).map(entry => entry.path);
      if (stagedPaths.length) await this.backend.unstage(record.projectId, stagedPaths);

      const status = await this.backend.status(record.projectId);
      const workingPaths = status.entries
        .filter(entry => entry.worktree !== ' ' && entry.worktree !== '!')
        .map(entry => entry.path);
      for (const path of workingPaths) await this.backend.discardWorking(record.projectId, path);

      this.applySnapshot((await this.backend.snapshot(record.projectId)).files);
      this.diff.set(null);
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set('Discarded all changes');
    });
  }

  protected async showDiff(path: string, kind?: 'working' | 'staged'): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    while (this.busy()) await new Promise<void>(resolve => setTimeout(resolve, 0));
    const entry = this.statusEntryForPath(path);
    const resolvedKind = kind ?? (entry && this.isStaged(entry) ? 'staged' : 'working');
    await this.run(async () => {
      this.selectedPath.set(path);
      this.diff.set(await this.backend.readDiff(record.projectId, path, resolvedKind));
    });
  }

  protected async commit(): Promise<void> {
    const record = this.activeRecord();
    const summary = this.commitValue().trim() || this.commitMessageInput()?.nativeElement.value.trim() || '';
    const description = this.commitDescription().trim();
    const message = summary ? `${summary}${description ? `\n\n${description}` : ''}` : '';
    if (!record || !message) return;
    await this.run(async () => {
      const oid = await this.backend.commit(record.projectId, message);
      this.commitValue.set('');
      this.commitDescription.set('');
      const input = this.commitMessageInput()?.nativeElement;
      if (input) input.value = '';
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set(`Committed ${oid.slice(0, 8)}`);
    });
  }

  protected commitReady(): boolean {
    return Boolean(this.commitValue().trim() || this.commitMessageInput()?.nativeElement.value.trim());
  }

  protected async createBranch(): Promise<void> {
    const record = this.activeRecord();
    const branch = this.newBranchValue().trim();
    if (!record || !branch) return;
    await this.run(async () => {
      this.branches.set(await this.backend.createBranch(record.projectId, branch));
      this.newBranchValue.set('');
      this.branchFilter.set('');
      this.branchMenuOpen.set(false);
      this.notice.set(`Created branch ${branch}`);
    });
  }

  protected checkoutFromEvent(event: Event): void {
    const element = event.target;
    if (element instanceof HTMLSelectElement) void this.checkout(element.value);
  }

  protected async checkout(branch: string, force = false): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    this.branchMenuOpen.set(false);
    if (this.editorDirty()) {
      this.fail(new Error('请先保存当前文件再切换分支'));
      return;
    }
    this.pendingBranch.set(branch);
    await this.run(async () => {
      await this.backend.checkout(record.projectId, branch, force);
      const snapshot = await this.backend.snapshot(record.projectId);
      const next = { ...record, updatedAt: Date.now() };
      await this.store.put(next);
      this.activeRecord.set(next);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.pendingBranch.set(null);
      this.notice.set(`Switched to ${branch}`);
    });
  }

  protected async restore(oid: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    if (this.editorDirty()) {
      this.fail(new Error('请先保存当前文件再恢复提交'));
      return;
    }
    await this.run(async () => {
      const snapshot = await this.backend.restore(record.projectId, oid);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Restored ${oid.slice(0, 8)}`);
    });
  }

  protected async pull(): Promise<void> {
    const record = this.activeRecord();
    if (!record?.owner || !record.repo) return;
    await this.run(async () => {
      if (!this.ensureEditorSaved()) return;
      const snapshot = await this.backend.pull(record.projectId);
      this.activeRecord.set(this.store.find(record.projectId)!);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Pulled ${record.name}`);
    });
  }

  protected async push(): Promise<void> {
    const record = this.activeRecord();
    if (!record?.owner || !record.repo) return;
    await this.run(async () => {
      if (this.status()?.entries.length || this.editorDirty())
        throw new Error('请先保存并提交本地改动，再推送到 GitHub');
      const next = await this.backend.push(record.projectId, this.commitValue() || 'Update from Aiao Desktop');
      this.activeRecord.set(next);
      this.notice.set(`Pushed ${next.remoteHead.slice(0, 8)}`);
    });
  }

  protected async loginWithPat(): Promise<void> {
    const token = this.patValue().trim();
    if (!token) return;
    this.authBusy.set(true);
    this.fail(null);
    try {
      await this.auth.loginWithPat(token);
      this.patValue.set('');
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed in to GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      this.authBusy.set(false);
    }
  }

  protected async loginWithOAuth(): Promise<void> {
    this.authBusy.set(true);
    this.fail(null);
    let popup: Window | null = null;
    try {
      // 先同步打开占位窗口，避免异步获取 OAuth 配置后失去用户手势。
      const oauthPopup = window.open('about:blank', 'aiao-github-oauth', 'popup,width=600,height=750');
      if (!oauthPopup) throw new Error('浏览器未能打开 GitHub 授权页，请允许弹窗后重试');
      popup = oauthPopup;
      oauthPopup.opener = null;

      const pending = await this.auth.beginOAuth();
      const channel = new BroadcastChannel(`aiao-code.github-oauth:${pending.state}`);
      try {
        const code = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('GitHub 授权超时，请重试')), 120_000);
          const closedTimer = setInterval(() => {
            if (oauthPopup.closed) {
              finish();
              reject(new Error('GitHub 授权窗口已关闭'));
            }
          }, 500);
          const finish = (): void => {
            clearTimeout(timer);
            clearInterval(closedTimer);
          };
          channel.onmessage = (event: MessageEvent<unknown>) => {
            const data = event.data;
            if (typeof data !== 'object' || data === null) return;
            const result = data as { readonly code?: unknown; readonly error?: unknown };
            if (typeof result.code === 'string' && result.code) {
              finish();
              resolve(result.code);
            } else if (typeof result.error === 'string') {
              finish();
              reject(new Error(result.error === 'access_denied' ? '已取消 GitHub 授权' : 'GitHub 授权失败'));
            }
          };
          try {
            oauthPopup.location.replace(pending.authorizeUrl);
          } catch (error) {
            finish();
            reject(error);
          }
        });
        await this.auth.completeOAuth(code, pending.verifier, pending.state);
      } finally {
        channel.close();
      }
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed in to GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      if (popup && !popup.closed) popup.close();
      this.authBusy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    this.authBusy.set(true);
    try {
      await this.auth.logout();
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed out of GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      this.authBusy.set(false);
    }
  }

  protected fileText(file: GitFile): string | null {
    return textOf(file.bytes);
  }

  protected statusLabelForPath(path: string): string {
    const entry = this.changedEntries().find(item => item.path === path);
    return entry ? this.statusLabel(entry).slice(0, 1) : '';
  }

  protected statusEntryForPath(path: string): GitStatusEntry | null {
    return this.changedEntries().find(entry => entry.path === path) ?? null;
  }

  protected statusLabel(entry: GitStatusEntry): string {
    if (entry.index === '?' && entry.worktree === '?') return 'Untracked';
    if (entry.index !== ' ') return 'Staged';
    return 'Changed';
  }

  protected changeKindFor(entry: GitStatusEntry): Exclude<GithubChangeKind, 'all'> {
    if (entry.index === 'D' || entry.worktree === 'D') return 'deleted';
    if (entry.index === '?' && entry.worktree === '?') return 'added';
    return 'modified';
  }

  protected commitChangeLabel(change: GitCommitFileChange): string {
    return (
      change.status === 'added' ? 'A'
      : change.status === 'deleted' ? 'D'
      : 'M'
    );
  }

  protected commitChangeDescription(change: GitCommitFileChange): string {
    return (
      change.status === 'added' ? 'Added'
      : change.status === 'deleted' ? 'Deleted'
      : 'Modified'
    );
  }

  protected shortOid(oid: string): string {
    return oid.slice(0, 8);
  }

  protected historyHunkLabel(value: GithubDiffValue | null): string | null {
    const lines = diffLinesOf(value);
    const firstChanged = lines.findIndex(line => !line.same);
    if (firstChanged < 0) return null;
    const lastChanged = lines.findLastIndex(line => !line.same);
    const hunk = lines.slice(firstChanged, lastChanged + 1);
    const oldLines = hunk.filter(line => line.oldNumber !== null);
    const newLines = hunk.filter(line => line.newNumber !== null);
    const oldStart = oldLines[0]?.oldNumber ?? 0;
    const newStart = newLines[0]?.newNumber ?? 0;
    return `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`;
  }

  protected toggleHistoryDetails(): void {
    this.historyDetailsExpanded.update(expanded => !expanded);
  }

  protected toggleHistoryDiffSettings(): void {
    this.historyDiffSettingsOpen.update(open => !open);
  }

  protected closeHistoryDiffSettings(): void {
    this.historyDiffSettingsOpen.set(false);
  }

  protected isStaged(entry: GitStatusEntry): boolean {
    return entry.index !== ' ' && entry.index !== '?';
  }

  protected closeDiff(): void {
    this.diff.set(null);
  }

  protected setTab(tab: GithubTab): void {
    this.tab.set(tab);
    this.diff.set(null);
    this.historyDiff.set(null);
    this.selectedHistoryPath.set(null);
    if (tab === 'history') {
      const commit = this.selectedCommit();
      if (commit) void this.selectCommit(commit.oid);
    }
  }

  protected focusChangesFilter(): void {
    this.setTab('changes');
    this.changesFilterFocus.set(true);
  }

  protected async selectCommit(oid: string): Promise<void> {
    this.selectedCommitOid.set(oid);
    this.historyChanges.set([]);
    this.historyDetailsExpanded.set(false);
    this.historyDiffSettingsOpen.set(false);
    this.selectedHistoryPath.set(null);
    this.historyDiff.set(null);
    const record = this.activeRecord();
    if (!record) return;
    const request = ++this.historyLoadRequest;
    try {
      const changes = await this.backend.commitChanges(record.projectId, oid);
      if (request === this.historyLoadRequest && record.projectId === this.activeRecord()?.projectId)
        this.historyChanges.set(changes);
    } catch (error) {
      if (request === this.historyLoadRequest) this.fail(error);
    }
  }

  protected selectHistoryFile(change: GitCommitFileChange): void {
    this.selectedHistoryPath.set(change.path);
    this.historyDiffSettingsOpen.set(false);
    this.historyDiff.set(change);
  }

  private async pickLocalDirectory(picker: DirectoryPicker): Promise<void> {
    let directory: SourceDirectory;
    try {
      directory = await picker();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.fail(error);
      return;
    }
    if (!this.ensureEditorSaved()) return;
    await this.run(async () => {
      const archive = await archiveOfDirectory(directory);
      await this.importArchive(archive.name, archive.archive, 'Added');
    });
  }

  private async importArchive(
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
    noticeVerb: 'Added' | 'Imported'
  ): Promise<void> {
    const { record, snapshot } = await this.backend.importDirectory(name, bytes);
    this.activeRecord.set(record);
    this.showCleanFiles.set(false);
    this.applySnapshot(snapshot.files);
    await this.refresh();
    this.notice.set(`${noticeVerb} ${name} · ${toVmPath(record.rootPath!)}`);
    this.repositoryMenuOpen.set(false);
  }

  private menuSections() {
    return this.menus.github({
      activeTab: () => this.tab(),
      hasRepository: () => this.activeRecord() !== null,
      hasRemote: () => Boolean(this.activeRecord()?.owner && this.activeRecord()?.repo),
      hasChanges: () => this.hasChanges(),
      isBusy: () => this.busy(),
      openRepositoryMenu: kind => this.openRepositoryMenu(kind),
      openLocalRepository: () => this.openLocalRepository(),
      openInEditor: () => this.openRepositoryInEditor(),
      openBranchMenu: () => this.openBranchMenu(),
      focusChangesFilter: () => this.focusChangesFilter(),
      setTab: tab => this.setTab(tab),
      fetch: () => void this.fetchOrigin(),
      pull: () => void this.pull(),
      push: () => void this.push(),
      discardAllChanges: () => void this.discardAllChanges(),
      openExternal: target => this.openExternal(target)
    });
  }

  private openExternal(target: GithubExternalTarget): void {
    const record = this.activeRecord();
    const base = record?.owner && record.repo ? `https://github.com/${record.owner}/${record.repo}` : null;
    const branch = record?.branch
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    const urls: Record<GithubExternalTarget, string | null> = {
      repository: base,
      issue: base ? `${base}/issues/new` : null,
      compare: base && branch ? `${base}/compare/${branch}` : null,
      branch: base && branch ? `${base}/tree/${branch}` : null,
      'pull-request': base && branch ? `${base}/compare/${branch}?expand=1` : null,
      'report-issue': 'https://github.com/desktop/desktop/issues/new/choose',
      support: 'https://support.github.com/contact',
      guides: 'https://docs.github.com/en/desktop',
      shortcuts:
        'https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/keyboard-shortcuts'
    };
    const url = urls[target];
    if (!url) return;
    if (!window.open(url, '_blank', 'noopener,noreferrer')) this.notice.set('请允许打开外部页面后重试');
  }

  private async restoreLastRepository(): Promise<void> {
    await this.store.ready();
    const record = this.win.options.projectId ? this.store.find(this.win.options.projectId) : this.records()[0];
    if (!record) return;
    const pending = Promise.resolve().then(() => this.openStored(record, false));
    this.restorePromise = pending;
    try {
      await pending;
    } finally {
      if (this.restorePromise === pending) this.restorePromise = null;
    }
  }

  private reloadExternal(): void {
    if (this.busy() || this.editorDirty() || !this.activeRecord()) return;
    void this.refresh(true).catch(error => this.fail(error));
  }

  private async refresh(external = false): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    const { snapshot, status, branches, history } = await this.backend.inspect(record.projectId);
    if (record.projectId !== this.activeRecord()?.projectId || (external && (this.busy() || this.editorDirty())))
      return;
    if (external) {
      this.activeRecord.set(this.store.find(record.projectId) ?? record);
      if (snapshot.revision !== this.currentRevision) {
        this.applySnapshot(snapshot.files);
        this.diff.set(null);
      }
    }
    this.status.set(status);
    this.branches.set(branches);
    this.history.set(history);
    const selectedCommit = this.selectedCommitOid();
    if (!selectedCommit || !history.some(commit => commit.oid === selectedCommit)) {
      this.selectedCommitOid.set(history[0]?.oid ?? null);
      this.historyChanges.set([]);
      this.historyDetailsExpanded.set(false);
      this.historyDiffSettingsOpen.set(false);
      this.historyDiff.set(null);
      this.selectedHistoryPath.set(null);
    }
    this.currentRevision = snapshot.revision;
    this.win.restoreOptions.set({ projectId: record.projectId });
    this.win.title.set(`GitHub Desktop · ${record.name}`);
  }

  private applySnapshot(files: readonly GitFile[]): void {
    this.files.set(files);
    const selected = this.selectedPath();
    const path = selected && files.some(file => file.path === selected) ? selected : (files[0]?.path ?? null);
    this.selectedPath.set(path);
    const file = path ? files.find(item => item.path === path) : null;
    this.editorValue.set(file ? (textOf(file.bytes) ?? '') : '');
    this.editorDirty.set(false);
    this.win.hasUnsavedChanges.set(false);
  }

  private async replaceFromRemote(
    record: GithubRepositoryRecord,
    remote: { readonly record: GithubRepositoryRecord; readonly files: readonly GitFile[] },
    cleanBaseline: boolean
  ): Promise<void> {
    const current = await this.backend.snapshot(record.projectId);
    const remotePaths = new Set(remote.files.map(file => file.path));
    const removedPaths = current.files.filter(file => !remotePaths.has(file.path)).map(file => file.path);
    const snapshot = await this.backend.save(record.projectId, remote.files, current.revision, removedPaths);
    if (cleanBaseline) {
      const changed = await this.backend.status(record.projectId);
      if (changed.entries.length) {
        await this.backend.stage(
          record.projectId,
          changed.entries.map(entry => entry.path)
        );
        await this.backend.commit(record.projectId, `Pull ${remote.record.name}@${remote.record.branch}`);
      }
    }
    await this.store.put(remote.record);
    this.activeRecord.set(remote.record);
    this.showCleanFiles.set(false);
    this.repoValue.set(remote.record.owner && remote.record.repo ? `${remote.record.owner}/${remote.record.repo}` : '');
    this.branchValue.set(remote.record.owner ? remote.record.branch : '');
    this.applySnapshot(snapshot.files);
    await this.refresh();
    this.notice.set(`Pulled ${remote.record.name}`);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      const restore = this.restorePromise;
      if (restore) {
        await restore;
        return this.run(task);
      }
      return;
    }
    this.busy.set(true);
    this.fail(null);
    try {
      await task();
    } catch (error) {
      this.fail(error);
      if (errorCodeOf(error) === 'storage_failed') this.backend.restart();
    } finally {
      this.zone.run(() => {
        this.busy.set(false);
        if (!this.destroyRef.destroyed) {
          this.changeDetectorRef.detectChanges();
          this.applicationRef.tick();
        }
      });
    }
  }

  private fail(error: unknown): void {
    this.error.set(error === null ? null : messageOf(error));
    this.errorCode.set(error === null ? null : errorCodeOf(error));
  }

  private ensureEditorSaved(): boolean {
    if (!this.editorDirty()) return true;
    this.fail(new Error('请先保存当前文件再切换仓库'));
    return false;
  }
}
